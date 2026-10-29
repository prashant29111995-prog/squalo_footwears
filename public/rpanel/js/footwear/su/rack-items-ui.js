/* global $, Swal */

(function () {
  let RACK_META_READY = false;

  const rackId = window.__RACK_ID__;
  const storeId = window.__STORE_ID__ || "";

  const API_BASE = "/apis/footwears/assembly";

  // Rack meta
  const API_RACK_META = `${API_BASE}/racks/${rackId}`;

  // Rack stock CRUD
  const API_LIST = `${API_BASE}/racks/${rackId}/stock`;
  const API_UPSERT = `${API_BASE}/racks/${rackId}/stock`; // POST { skuId, qty } (increment/add)
  const API_SETQTY = (id) => `${API_BASE}/rack-stock/${id}`; // PATCH { qty }    (set exact)
  const API_DELETE = (id) => `${API_BASE}/rack-stock/${id}`; // DELETE

  // Allocated qty across ALL racks for a skuId
  // GET /apis/footwears/assembly/sku/:skuId/allocated
  const API_ALLOCATED = (skuId) => `${API_BASE}/sku/${skuId}/allocated`;

  // SKU search + summary (total stock in store from StockLedger)
  const API_SKU_SEARCH = "/apis/footwears/skus";
  const API_SKU_SUMMARY = (skuId) =>
    `/apis/footwears/skus/skus/${skuId}/summary${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ""}`;

  let dt = null;

  // Autocomplete state
  let SKU_SUGGESTIONS = [];
  let SKU_ACTIVE_INDEX = -1;
  let SKU_LAST_Q = "";
  let SKU_PICKED = null;
  let SKU_DEBOUNCE = null;

  // cache to reduce calls
  const CACHE_ALLOC = new Map(); // skuId -> allocatedQty
  const CACHE_TOTAL = new Map(); // skuId -> totalQty

  // ---------- helpers ----------
  function toastSuccess(msg) {
    Swal.fire({ icon: "success", title: msg, timer: 1200, showConfirmButton: false });
  }
  function toastError(msg) {
    Swal.fire({ icon: "error", title: "Error", text: msg || "Something went wrong" });
  }

  async function api(url, options = {}) {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || `API request failed (${res.status})`);
    return data;
  }

  function safe(v) {
    return v === null || v === undefined ? "" : String(v);
  }
  function norm(v) {
    return String(v || "").trim().toUpperCase().replace(/\s+/g, " ");
  }
  function isObjectId(v) {
    return /^[a-f\d]{24}$/i.test(String(v || "").trim());
  }
  function withPairsLabel(nOrInfinity) {
    if (nOrInfinity === "∞") return "∞";
    const n = Number(nOrInfinity || 0);
    return `${n} Pairs`;
  }

  // tiny HTML escaper for DataTable cell rendering
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatRackTitle(r) {
    const code = r.rackCode || r.code || r.rackNo || "";
    const name = r.rackName || r.name || "";
    if (code && name) return `${code} • ${name}`;
    return code || name || "Rack";
  }

  // ---------- Rack Meta ----------
  async function loadRackMeta() {
    const resp = await api(API_RACK_META, { method: "GET" });
    const r = resp.item || resp.data || resp;
    if (!r) throw new Error("Rack not found");

    $("#rack_group").val(norm(r.categoryGroup));
    $("#rack_category").val(norm(r.category));
    $("#rack_capacity").val(Number(r.capacityPairs || 0));

    // ✅ Page context header
    const title = formatRackTitle(r);
    $("#rackTitle").text(title);
    $("#rackHeaderText").text(title);
    $("#rackSubText").text(`${norm(r.categoryGroup) || "-"} • ${norm(r.category) || "-"} • Location: ${safe(r.locationCode || r.locationName || r.locationId || "-")}`);

    RACK_META_READY = true;
    setRackMetaText();
  }

  function getRackMeta() {
    return {
      group: norm($("#rack_group").val()),
      category: norm($("#rack_category").val()),
      capacity: Number($("#rack_capacity").val() || 0), // 0 = unlimited
    };
  }

  function setRackMetaText() {
    const rack = getRackMeta();
    const capTxt = rack.capacity > 0 ? withPairsLabel(rack.capacity) : "∞";
    $("#rackMetaText").text(`${rack.group || "-"} • ${rack.category || "-"} • CAP: ${capTxt}`);
  }

  // ---------- Rack match ----------
  function skuMatchesRack(skuObj) {
    const rack = getRackMeta();
    if (!rack.group || !rack.category) return true;

    const sg = norm(skuObj?.articleId?.categoryGroup || skuObj?.categoryGroup);
    const sc = norm(skuObj?.articleId?.category || skuObj?.category);

    if (!sg || !sc) return true; // allow if missing metadata (do not block)

    const groupOK = rack.group.includes(sg) || sg.includes(rack.group);
    const catOK = rack.category.includes(sc) || sc.includes(rack.category);

    return groupOK && catOK;
  }

  // ---------- rack usage (capacity) ----------
  function getRackUsedQtyFromTable(exceptRowId) {
    if (!dt) return 0;
    const rows = dt.rows().data().toArray();
    return rows.reduce((sum, r) => {
      if (exceptRowId && r._id === exceptRowId) return sum;
      return sum + (Number(r.qty) || 0);
    }, 0);
  }

  function setCapBar(capacity, used) {
    const $bar = $("#rackCapBar");
    if (!$bar.length) return;

    if (!capacity || capacity <= 0) {
      $bar.css("width", "100%").attr("aria-valuenow", 100);
      $bar.text(""); // keep clean
      return;
    }

    const pct = Math.max(0, Math.min(100, Math.round((used / capacity) * 100)));
    $bar.css("width", `${pct}%`).attr("aria-valuenow", pct);
    $bar.text("");
  }

  function updateCapacityHint(extraLine) {
    const rack = getRackMeta();
    const used = getRackUsedQtyFromTable($("#rs_id").val());

    const capLine =
      rack.capacity > 0
        ? `Rack capacity: ${withPairsLabel(rack.capacity)} • Used(excl this): ${withPairsLabel(used)} • Free: ${withPairsLabel(
            Math.max(0, rack.capacity - used)
          )}`
        : "Rack capacity: Unlimited";

    $("#capHint").text(extraLine ? `${extraLine} | ${capLine}` : capLine);
  }

  function updateRackStatsUI() {
    const rack = getRackMeta();
    const used = getRackUsedQtyFromTable();
    const cap = rack.capacity;

    $("#rackCapText").text(cap > 0 ? withPairsLabel(cap) : "∞");
    $("#rackUsedText").text(withPairsLabel(used));
    $("#rackFreeText").text(cap > 0 ? withPairsLabel(Math.max(0, cap - used)) : "∞");

    // ✅ progress bar
    setCapBar(cap, used);
  }

  // ---------- DataTable ----------
  function buildRow(x) {
    // We will show a single "SKU" cell with nicer layout
    const skuCode = safe(x.sku || x.skuCode);
    const brand = safe(x.brand);
    const articleName = safe(x.articleName);
    const color = safe(x.color);

    const skuHtml = `
      <div style="display:flex; align-items:flex-start; gap:10px;">
        <div style="width:34px; height:34px; border-radius:10px; background:#f5f7fb; display:flex; align-items:center; justify-content:center;">
          <i class="la la-tag" style="font-size:18px; opacity:.8;"></i>
        </div>
        <div style="min-width:0;">
          <div style="font-weight:800; font-size:13px; line-height:1.2; word-break:break-word;">${esc(skuCode)}</div>
          <div style="font-size:12px; opacity:.75; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:520px;">
            ${esc(brand)} • ${esc(articleName)} • ${esc(color)}
          </div>
        </div>
      </div>
    `;

    return {
      _id: x._id,
      skuCell: skuHtml,
      size: safe(x.size),
      qty: x.qty ?? 0,
      actions: `
        <div class="btn-group" role="group" aria-label="Actions">
          <button class="btn btn-sm btn-outline-brand btn-edit" data-id="${x._id}" title="Edit Qty">
            <i class="la la-edit"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${x._id}" title="Remove">
            <i class="la la-trash"></i>
          </button>
        </div>
      `,
      _skuId: x.skuId,
      _skuCode: x.sku || x.skuCode,
      _brand: brand,
      _articleName: articleName,
      _color: color,
    };
  }

  async function loadItems() {
    const resp = await api(API_LIST, { method: "GET" });
    const list = resp.items || resp.data || [];
    return list.map(buildRow);
  }

  async function refreshTable() {
    const rows = await loadItems();
    dt.clear();
    dt.rows.add(rows).draw();
    updateRackStatsUI();
  }

  function initDataTable() {
    dt = $("#rackItemsTable").DataTable({
      responsive: true,
      processing: true,
      pageLength: 25,
      data: [],
      // ✅ nicer defaults
      dom: '<"row"<"col-md-6"l><"col-md-6"f>>rt<"row"<"col-md-6"i><"col-md-6"p>>',
      language: {
        search: "Search items:",
        searchPlaceholder: "SKU / brand / article / color...",
        emptyTable: "No SKUs added to this rack yet.",
      },
      columns: [
        { data: "skuCell", title: "SKU", orderable: false },
        { data: "size", title: "Size", className: "text-center", width: "90px" },
        { data: "qty", title: "Qty", className: "text-center", width: "90px" },
        { data: "actions", title: "Actions", orderable: false, searchable: false, className: "text-center", width: "140px" },
      ],
      order: [[1, "asc"]],
      createdRow: function (row) {
        // subtle row height
        $(row).css("vertical-align", "middle");
      },
    });

    $("#rackItemsTable tbody").on("click", ".btn-edit", function () {
      openEditModal($(this).data("id"));
    });

    $("#rackItemsTable tbody").on("click", ".btn-delete", async function () {
      await confirmDelete($(this).data("id"));
    });
  }

  // ---------- Stock numbers ----------
  // Total stock in store (from summary)
  async function fetchTotalStockQty(skuId) {
    if (!isObjectId(skuId)) return 0;
    if (CACHE_TOTAL.has(skuId)) return CACHE_TOTAL.get(skuId);

    const resp = await api(API_SKU_SUMMARY(skuId), { method: "GET" });
    const total = Number(resp.availableQty ?? resp.totalQty ?? resp.data?.availableQty ?? resp.data?.totalQty ?? 0) || 0;

    CACHE_TOTAL.set(skuId, total);
    return total;
  }

  // Allocated in ALL racks
  async function fetchAllocatedQtyAllRacks(skuId) {
    if (!isObjectId(skuId)) return 0;
    if (CACHE_ALLOC.has(skuId)) return CACHE_ALLOC.get(skuId);

    const resp = await api(API_ALLOCATED(skuId), { method: "GET" });
    const used = Number(resp.allocatedQty ?? resp.usedQty ?? resp.totalAllocated ?? 0) || 0;

    CACHE_ALLOC.set(skuId, used);
    return used;
  }

  function computeFreeToAssign(total, allocatedAll, existingInThisRack) {
    const effectiveAllocated = Math.max(0, Number(allocatedAll || 0) - Number(existingInThisRack || 0));
    return Math.max(0, Number(total || 0) - effectiveAllocated);
  }

  // ---------- Autocomplete ----------
  function showSkuDropdown() {
    $("#skuSuggest").show();
  }
  function hideSkuDropdown() {
    $("#skuSuggest").hide().empty();
    SKU_ACTIVE_INDEX = -1;
  }

  function renderSkuDropdown(list) {
    const $dd = $("#skuSuggest");

    if (!list.length) {
      $dd.html(`<button type="button" class="dropdown-item disabled">No results</button>`);
      showSkuDropdown();
      return;
    }

    const html = list
      .map((s, idx) => {
        const color = norm(s.colors?.[0]?.raw || s.colors?.[0]?.normalized || s.color);
        const grp = norm(s.articleId?.categoryGroup || s.categoryGroup);
        const cat = norm(s.articleId?.category || s.category);

        const okMatch = skuMatchesRack(s);
        const active = idx === SKU_ACTIVE_INDEX ? "active" : "";
        const disabled = okMatch ? "" : "disabled";
        const disabledAttr = okMatch ? "" : 'data-disabled="1"';

        return `
          <button type="button"
            class="dropdown-item ${active} ${disabled}"
            ${disabledAttr}
            data-idx="${idx}"
            style="white-space:normal;"
          >
            <div style="font-weight:800;">${esc(s.skuCode || s.sku)}</div>
            <div style="font-size:12px;opacity:.75;">
              ${esc(s.brand)} • ${esc(s.articleName)} • ${esc(color)} • ${esc(s.size)} • ${esc(grp || "-")} ${cat ? "• " + esc(cat) : ""}
              ${okMatch ? "" : ` • <span style="color:#c00;font-weight:800;">MISMATCH</span>`}
            </div>
          </button>
        `;
      })
      .join("");

    $dd.html(html);
    showSkuDropdown();
  }

  async function fetchSkuSuggestions(q) {
    const qq = (q || "").trim();
    if (qq.length < 2) return [];

    const url = `${API_SKU_SEARCH}?q=${encodeURIComponent(qq)}&limit=20`;
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    const list = j.data || j.items || j || [];
    return Array.isArray(list) ? list : [];
  }

  function bindSkuAutocomplete() {
    const $inp = $("#skuSearch");

    $inp.on("input", function () {
      const q = $(this).val();
      SKU_PICKED = null;

      $("#rs_availableQty").val("0");
      $("#rs_totalQty").val("0");

      if (SKU_DEBOUNCE) clearTimeout(SKU_DEBOUNCE);
      SKU_DEBOUNCE = setTimeout(async () => {
        const text = (q || "").trim();
        if (text.length < 2) return hideSkuDropdown();
        if (text === SKU_LAST_Q) return;
        SKU_LAST_Q = text;

        try {
          const list = await fetchSkuSuggestions(text);
          SKU_SUGGESTIONS = list;
          SKU_ACTIVE_INDEX = -1;
          renderSkuDropdown(list);
        } catch (e) {
          hideSkuDropdown();
        }
      }, 180);
    });

    // select item
    $(document).on("mousedown", "#skuSuggest .dropdown-item", async function (e) {
      e.preventDefault();

      const isDisabled = $(this).hasClass("disabled") || $(this).attr("data-disabled") === "1";
      if (isDisabled) return toastError("This SKU does not match this rack category/group.");

      const idx = Number($(this).data("idx"));
      const s = SKU_SUGGESTIONS[idx];
      if (!s) return;

      if (!skuMatchesRack(s)) return toastError("SKU category/group does not match this rack.");

      SKU_PICKED = s;
      $("#skuSearch").val(s.skuCode || s.sku || "");
      hideSkuDropdown();

      const sid = String(s._id);
      const existingRow = dt.rows().data().toArray().find((r) => String(r._skuId) === sid);
      const inThisRack = existingRow ? Number(existingRow.qty || 0) : 0;

      $("#rs_totalQty").val(inThisRack);

      const totalStock = await fetchTotalStockQty(s._id);
      const allocatedAll = await fetchAllocatedQtyAllRacks(s._id);

      const free = computeFreeToAssign(totalStock, allocatedAll, inThisRack);

      $("#rs_availableQty").val(free);
      $("#rs_qty").val(inThisRack);

      const note = `Total: ${withPairsLabel(totalStock)} • Allocated (all racks): ${withPairsLabel(allocatedAll)} • Free: ${withPairsLabel(free)}`;
      updateCapacityHint(note);
      $("#rs_qty").focus().select();
    });

    $inp.on("keydown", function (e) {
      if (!$("#skuSuggest").is(":visible")) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        SKU_ACTIVE_INDEX = Math.min(SKU_ACTIVE_INDEX + 1, SKU_SUGGESTIONS.length - 1);
        renderSkuDropdown(SKU_SUGGESTIONS);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        SKU_ACTIVE_INDEX = Math.max(SKU_ACTIVE_INDEX - 1, 0);
        renderSkuDropdown(SKU_SUGGESTIONS);
      } else if (e.key === "Escape") {
        hideSkuDropdown();
      }
    });

    $(document).on("click", function (e) {
      if (!$(e.target).closest("#skuSuggest").length && !$(e.target).closest("#skuSearch").length) {
        hideSkuDropdown();
      }
    });

    $inp.on("blur", function () {
      setTimeout(hideSkuDropdown, 180);
    });
  }

  // ---------- Modal + CRUD ----------
  function resetForm() {
    $("#rackItemForm")[0].reset();
    $("#rs_id").val("");
    $("#rs_qty").val(0);
    $("#rs_totalQty").val("0");
    $("#rs_availableQty").val("0");
    $("#skuSearch").val("");
    SKU_PICKED = null;
    hideSkuDropdown();
    setRackMetaText();
    updateCapacityHint();
  }

  function openEditModal(rackStockId) {
    const row = dt.rows().data().toArray().find((r) => r._id === rackStockId);
    if (!row) return toastError("Row not found");

    $("#rs_id").val(row._id);
    $("#rs_qty").val(row.qty || 0);
    $("#rs_totalQty").val(row.qty || 0);
    $("#skuSearch").val(row._skuCode || "");

    SKU_PICKED = { _id: String(row._skuId) };

    Promise.all([fetchTotalStockQty(row._skuId), fetchAllocatedQtyAllRacks(row._skuId)])
      .then(([total, allocatedAll]) => {
        const free = computeFreeToAssign(total, allocatedAll, Number(row.qty || 0));
        $("#rs_availableQty").val(free);
        const note = `Total: ${withPairsLabel(total)} • Allocated(all racks): ${withPairsLabel(allocatedAll)} • Free: ${withPairsLabel(free)}`;
        updateCapacityHint(note);
      })
      .catch(() => $("#rs_availableQty").val("0"));

    $("#modalAddSku").modal("show");
  }

  async function saveItem(e) {
    e.preventDefault();

    if (!RACK_META_READY) return toastError("Rack meta not loaded yet. Please reopen modal.");

    try {
      const rackStockId = $("#rs_id").val();
      const qty = Math.max(0, Number($("#rs_qty").val() || 0));

      if (!SKU_PICKED || !SKU_PICKED._id) return toastError("Please pick a SKU from suggestions.");
      if (!isObjectId(SKU_PICKED._id)) return toastError("Invalid SKU selected.");

      const skuId = SKU_PICKED._id;

      const freeToAssign = Number($("#rs_availableQty").val() || 0);
      if (qty > freeToAssign) {
        return toastError(`Not enough free stock. Free to assign: ${freeToAssign}, you entered: ${qty}`);
      }

      const rack = getRackMeta();
      if (rack.capacity > 0) {
        const usedWithoutThis = getRackUsedQtyFromTable(rackStockId);
        const proposed = usedWithoutThis + qty;
        if (proposed > rack.capacity) {
          return toastError(`Rack capacity exceeded. Free space: ${Math.max(0, rack.capacity - usedWithoutThis)}`);
        }
      }

      if (!rackStockId) {
        await api(API_UPSERT, { method: "POST", body: JSON.stringify({ skuId, qty }) });
        toastSuccess("Saved");
      } else {
        await api(API_SETQTY(rackStockId), { method: "PATCH", body: JSON.stringify({ qty }) });
        toastSuccess("Updated");
      }

      // invalidate caches after write
      CACHE_ALLOC.delete(String(skuId));
      CACHE_TOTAL.delete(String(skuId));

      $("#modalAddSku").modal("hide");
      resetForm();
      await refreshTable();
    } catch (err) {
      toastError(err.message);
    }
  }

  async function confirmDelete(id) {
    const result = await Swal.fire({
      title: "Remove SKU from rack?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, remove",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;

    try {
      await api(API_DELETE(id), { method: "DELETE" });

      CACHE_ALLOC.clear();
      CACHE_TOTAL.clear();

      toastSuccess("Removed");
      await refreshTable();
    } catch (err) {
      toastError(err.message);
    }
  }

  // ---------- Init ----------
  async function init() {
    initDataTable();
    bindSkuAutocomplete();

    await loadRackMeta();

    // initial stats (table still empty until refresh)
    updateRackStatsUI();
    updateCapacityHint();

    await refreshTable();

    $("#modalAddSku").on("shown.bs.modal", function () {
      updateCapacityHint();
    });

    $("#rackItemForm").on("submit", saveItem);
    $("#modalAddSku").on("hidden.bs.modal", resetForm);
  }

  $(document).ready(function () {
    if (!rackId) return toastError("Missing rackId on page");
    init().catch((e) => toastError(e.message));
  });
})();
