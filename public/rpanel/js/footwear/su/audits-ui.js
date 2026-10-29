/* global $, Swal */

(function () {
  // -------------------- UI helpers --------------------
  function setStatusBadge(status) {
    const s = (status || "").toUpperCase();
    const $b = $("#audit_status_badge");
    if (!$b.length) return;

    $b.removeClass("badge-secondary badge-warning badge-success badge-dark badge-info");

    if (s === "DRAFT") $b.addClass("badge-secondary").text("DRAFT");
    else if (s === "SUBMITTED") $b.addClass("badge-warning").text("SUBMITTED");
    else if (s === "APPROVED") $b.addClass("badge-success").text("APPROVED");
    else if (s === "LOCKED") $b.addClass("badge-dark").text("LOCKED");
    else $b.addClass("badge-info").text(s || "-");
  }

  function setWorkflowButtons(status) {
    const s = (status || "").toUpperCase();

    $("#btnSubmitAudit").prop("disabled", s !== "DRAFT");
    $("#btnApproveAudit").prop("disabled", s !== "SUBMITTED");
    $("#btnLockAudit").prop("disabled", s !== "APPROVED");

    const editable = s === "DRAFT";
    $("#btnAddLine").prop("disabled", !editable);
    $("#skuSearch").prop("disabled", !editable);
    $("#countedQty").prop("disabled", !editable);
  }

  function toast(msg) {
    Swal.fire({ icon: "success", title: msg, timer: 1200, showConfirmButton: false });
  }

  function safe(v) {
    return v === null || v === undefined ? "" : String(v);
  }

  function norm(v) {
    return safe(v).trim().toUpperCase();
  }

  function fmtDate(d) {
    if (!d) return "";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toLocaleString();
  }

  // -------------------- APIs --------------------
  const API = "/apis/footwears/audits";
  const STORE_API = "/apis/footwears/stores";
  const CATS_API = "/apis/footwears/articles/categories";

  let auditsTable, linesTable;
  let CURRENT_AUDIT_ID = null;

  // category meta from server config
  let CATEGORIES = {}; // { MEN:[], WOMEN:[], ... }

  async function api(url, opt = {}) {
    const r = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...opt,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.message || "API error");
    return j;
  }

  // -------------------- Load Stores --------------------
  async function loadStores() {
    const r = await fetch(STORE_API);
    const j = await r.json();
    const stores = j.data || j || [];

    const $sel = $("#audit_store");
    $sel.empty().append(`<option value="" disabled selected>Select Store</option>`);

    stores.forEach((s) => {
      $sel.append(`<option value="${s._id}">${safe(s.code)} - ${safe(s.name)}</option>`);
    });
  }

  // -------------------- Load Categories Meta --------------------
  async function loadCategories() {
    const r = await api(CATS_API);
    CATEGORIES = r.data || {};
  }

  function fillCategorySelect($select, group, selected = "", placeholder = "Select category") {
    const g = norm(group);
    $select.empty();

    if (!g) {
      $select
        .append(`<option value="" disabled selected>${placeholder}</option>`)
        .prop("disabled", true);
      return;
    }

    const list = Array.isArray(CATEGORIES[g]) ? CATEGORIES[g] : [];
    if (!list.length) {
      $select
        .append(`<option value="" disabled selected>No categories</option>`)
        .prop("disabled", true);
      return;
    }

    $select.prop("disabled", false);
    $select.append(`<option value="" disabled ${selected ? "" : "selected"}>${placeholder}</option>`);

    list.forEach((c) => {
      const sel = norm(c) === norm(selected) ? "selected" : "";
      $select.append(`<option value="${c}" ${sel}>${c}</option>`);
    });
  }

  // wire create modal group -> category
  function wireCreateCategoryCascade() {
    $(document).on("change", "#audit_categoryGroup", function () {
      fillCategorySelect($("#audit_category"), $(this).val(), "", "Select category");
    });

    $("#modalAuditCreate").on("shown.bs.modal", function () {
      const today = new Date().toISOString().slice(0, 10);
      if (!$("#audit_date").val()) $("#audit_date").val(today);

      // reset group + category each time modal opens
      $("#audit_categoryGroup").val("");
      fillCategorySelect($("#audit_category"), "", "", "Select category");
    });
  }

  // -------------------- AUDITS LIST --------------------
  function mapAuditRow(a) {
    const categoryGroup = a?.scope?.categoryGroup || "";
    const category = a?.scope?.category || "";

    const store =
      a?.storeName ||
      a?.store?.name ||
      a?.store?.code ||
      a?.storeId ||
      "";

    return {
      _id: a._id,
      date: fmtDate(a.auditDate),
      store,
      categoryGroup,
      category,
      type: safe(a.auditType),
      status: safe(a.status),
      actions: `<button class="btn btn-sm btn-outline-brand open" data-id="${a._id}">Open</button>`,
    };
  }

  async function loadAudits() {
    const r = await api(API);
    const list = r.data || r || [];
    return list.map(mapAuditRow);
  }

  async function refreshAudits() {
    const rows = await loadAudits();
    auditsTable.clear().rows.add(rows).draw();
  }

  function initAuditsTable() {
    auditsTable = $("#auditsTable").DataTable({
      responsive: true,
      pageLength: 25,
      data: [],
      columns: [
        { data: "date" },
        { data: "store" },
        { data: "categoryGroup" },
        { data: "category" },
        { data: "type" },
        { data: "status" },
        { data: "actions", orderable: false, searchable: false },
      ],
    });

    $("#generalSearch").on("keyup", function () {
      auditsTable.search(this.value).draw();
    });

    $("#auditsTable").on("click", ".open", function () {
      openAudit($(this).data("id"));
    });
  }

  // -------------------- CREATE AUDIT --------------------
  $(document).on("submit", "#auditCreateForm", async function (e) {
    e.preventDefault();

    try {
      const storeId = $("#audit_store").val();
      const categoryGroup = $("#audit_categoryGroup").val();
      const category = $("#audit_category").val();
      const auditType = $("#audit_type").val();
      const auditDate = $("#audit_date").val();
      const notes = $("#audit_notes").val() || "";

      if (!storeId || !auditType || !categoryGroup || !category || !auditDate) {
        return Swal.fire(
          "Missing fields",
          "Store, Type, Category Group, Category, Date required",
          "warning"
        );
      }

      await api(API, {
        method: "POST",
        body: JSON.stringify({
          storeId,
          auditType,
          auditDate,
          scope: { categoryGroup, category },
          notes,
        }),
      });

      $("#modalAuditCreate").modal("hide");
      toast("Audit created");
      await refreshAudits();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  });

  // -------------------- AUDIT DETAIL --------------------
  async function openAudit(id) {
    try {
      $("#audit_id").val(id);

      const r = await api(`${API}/${id}`);
      const a = r.data || r;

      const storeName =
        a?.storeName ||
        a?.store?.name ||
        a?.store?.code ||
        a?.storeId ||
        "";

      $("#audit_store_view").val(storeName);
      $("#audit_categoryGroup_view").val(a?.scope?.categoryGroup || "");
      $("#audit_category_view").val(a?.scope?.category || "");
      $("#audit_type_view").val(a?.auditType || "");
      $("#audit_status_view").val(a?.status || "");
      $("#audit_date_view").val(fmtDate(a?.auditDate));

      setStatusBadge(a?.status);
      setWorkflowButtons(a?.status);

      $("#modalAuditDetail").modal("show");
      CURRENT_AUDIT_ID = id;

      $("#btnAddLine").data("mode", "add").data("lineId", null);
      $("#last_action_text").text("-");

      await renderLines(id);

      setTimeout(() => {
        if (linesTable) linesTable.columns.adjust().draw(false);
      }, 200);
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  }

  // -------------------- AUDIT LINES --------------------
  function normalizeSkuCode(input) {
    return (input || "").trim().toUpperCase();
  }

  async function resolveSkuExact(skuCode) {
    const code = normalizeSkuCode(skuCode);
    const url = `/apis/footwears/skus?skuCode=${encodeURIComponent(code)}`;
    const r = await fetch(url);
    const j = await r.json();
    const list = j.data || j || [];

    const exact = list.find((s) => normalizeSkuCode(s.skuCode) === code);
    if (!exact) throw new Error("SKU not found (exact match).");
    return exact;
  }

  function mapLineRow(line) {
    const skuObj = line?.skuId || line?.sku || {};
    const skuCode = line?.skuCode || skuObj?.skuCode || "";
    const brand = line?.brand || skuObj?.brand || "";
    const articleName = line?.articleName || skuObj?.articleName || "";
    const color =
      line?.color ||
      skuObj?.color ||
      skuObj?.colors?.[0]?.raw ||
      line?.colors?.[0]?.raw ||
      "";
    const size = line?.size || skuObj?.size || "";
    const countedQty = line?.countedQty ?? 0;

    return {
      _id: line._id,
      skuCode: safe(skuCode),
      brand: safe(brand),
      articleName: safe(articleName),
      color: safe(color),
      size: safe(size),
      countedQty,
      actions: `
        <button class="btn btn-sm btn-outline-primary edit-line" data-id="${line._id}">Edit</button>
        <button class="btn btn-sm btn-outline-danger del-line" data-id="${line._id}">Delete</button>
      `,
    };
  }

  async function fetchLines(auditId) {
    const r = await api(`${API}/${auditId}/lines`);
    return r.data || r || [];
  }

  async function renderLines(auditId) {
    const list = await fetchLines(auditId);
    const rows = list.map(mapLineRow);
    linesTable.clear().rows.add(rows).draw();
    $("#lines_count").text(rows.length);
  }

  function initLinesTable() {
    linesTable = $("#auditLinesTable").DataTable({
      responsive: true,
      paging: false,
      searching: false,
      info: false,
      ordering: false,
      data: [],
      columns: [
        { data: "skuCode" },
        { data: "brand" },
        { data: "articleName" },
        { data: "color" },
        { data: "size" },
        { data: "countedQty" },
        { data: "actions", orderable: false, searchable: false },
      ],
    });

    $("#auditLinesTable").on("click", ".del-line", async function () {
      const lineId = $(this).data("id");
      const auditId = CURRENT_AUDIT_ID;
      const status = ($("#audit_status_view").val() || "").toUpperCase();
      if (status !== "DRAFT") return Swal.fire("Not allowed", "Audit is not editable", "warning");

      const ok = await Swal.fire({
        title: "Delete this line?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, delete",
      });
      if (!ok.isConfirmed) return;

      try {
        await api(`${API}/${auditId}/lines/${lineId}`, { method: "DELETE" });
        toast("Line deleted");
        await renderLines(auditId);
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    });

    $("#auditLinesTable").on("click", ".edit-line", async function () {
      const lineId = $(this).data("id");
      const auditId = CURRENT_AUDIT_ID;

      try {
        const list = await fetchLines(auditId);
        const line = list.find((x) => x._id === lineId);
        if (!line) return;

        const skuObj = line?.skuId || line?.sku || {};
        const skuCode = line?.skuCode || skuObj?.skuCode || "";

        $("#skuSearch").val(skuCode);
        $("#countedQty").val(line.countedQty ?? 0);

        $("#btnAddLine").data("mode", "edit").data("lineId", lineId);
        $("#last_action_text").text(`Editing: ${skuCode}`);
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    });
  }

  async function addOrUpdateLine() {
    const auditId = CURRENT_AUDIT_ID;
    const skuCodeInput = ($("#skuSearch").val() || "").trim();
    const countedQty = Number($("#countedQty").val());

    if (!auditId) return Swal.fire("Error", "Missing audit id", "error");
    if (!skuCodeInput) return Swal.fire("Enter SKU Code", "", "warning");
    if (Number.isNaN(countedQty) || countedQty < 0) return Swal.fire("Invalid Qty", "", "warning");

    const mode = $("#btnAddLine").data("mode") || "add";
    const lineId = $("#btnAddLine").data("lineId") || null;

    try {
      const sku = await resolveSkuExact(skuCodeInput);

      if (mode === "edit" && lineId) {
        await api(`${API}/${auditId}/lines/${lineId}`, {
          method: "PATCH",
          body: JSON.stringify({ countedQty }),
        });
        toast("Line updated");
      } else {
        await api(`${API}/${auditId}/lines`, {
          method: "POST",
          body: JSON.stringify({
            skuId: sku._id,
            skuCode: sku.skuCode,
            countedQty,
          }),
        });
        toast("Line saved");
      }

      $("#skuSearch").val("").focus();
      $("#countedQty").val(0);
      $("#btnAddLine").data("mode", "add").data("lineId", null);

      await renderLines(auditId);
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  }

  $(document).on("click", "#btnAddLine", addOrUpdateLine);

  $(document).on("keydown", "#skuSearch, #countedQty", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addOrUpdateLine();
    }
  });

  // -------------------- WORKFLOW --------------------
  async function runWorkflow(action) {
    const id = $("#audit_id").val();
    if (!id) return Swal.fire("Error", "No audit selected", "error");

    const actionMeta = {
      submit: {
        title: "Submit Audit?",
        text: "After submit, you cannot add/update lines until admin approves.",
        url: `${API}/${id}/submit`,
        nextHint: "Audit submitted",
      },
      approve: {
        title: "Approve Audit?",
        text: "Approving will generate consumption ledger entries (Phase-1).",
        url: `${API}/${id}/approve`,
        nextHint: "Audit approved",
      },
      lock: {
        title: "Lock Audit?",
        text: "Locking makes this audit final and uneditable forever.",
        url: `${API}/${id}/lock`,
        nextHint: "Audit locked",
      },
    };

    const meta = actionMeta[action];
    if (!meta) return;

    const ok = await Swal.fire({
      title: meta.title,
      text: meta.text,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes",
    });
    if (!ok.isConfirmed) return;

    try {
      await api(meta.url, { method: "POST" });
      toast(meta.nextHint);

      await refreshAudits();
      await openAudit(id);
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  }

  $(document).on("click", "#btnSubmitAudit", () => runWorkflow("submit"));
  $(document).on("click", "#btnApproveAudit", () => runWorkflow("approve"));
  $(document).on("click", "#btnLockAudit", () => runWorkflow("lock"));

  // -------------------- EXCEL UPLOAD --------------------
 // -------------------- EXCEL UPLOAD --------------------
$("#btnUploadAuditExcel").on("click", async () => {
  const auditId = $("#audit_id").val();
  const f = $("#auditExcelFile")[0].files[0];
  if (!f) return Swal.fire("Select file", "Please choose an Excel file", "warning");

  const fd = new FormData();
  fd.append("file", f); // keep this unless backend expects different field name

  try {
    const r = await fetch(`/apis/footwears/audits/${auditId}/upload-lines`, {
      method: "POST",
      body: fd,
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || "Upload failed");

    const linesUpserted =
      j?.data?.linesUpserted ??
      j?.linesUpserted ??
      j?.data?.lines ??
      j?.lines ??
      0;

    const skusCreated =
      j?.data?.skusCreated ??
      j?.skusCreated ??
      j?.data?.skus ??
      j?.skus ??
      0;

    Swal.fire("Uploaded", `Lines: ${linesUpserted}, SKUs: ${skusCreated}`, "success");
    await renderLines(auditId);
  } catch (e) {
    Swal.fire("Error", e.message, "error");
  }
});
let SKU_SUGGESTIONS = [];
let SKU_ACTIVE_INDEX = -1;
let SKU_LAST_Q = "";
let SKU_PICKED = null; // optional: store selected sku object

function showSkuDropdown() {
  const $dd = $("#skuSuggest");
  if (!$dd.length) return;
  $dd.show();
}

function hideSkuDropdown() {
  const $dd = $("#skuSuggest");
  if (!$dd.length) return;
  $dd.hide().empty();
  SKU_ACTIVE_INDEX = -1;
}

function renderSkuDropdown(list) {
  const $dd = $("#skuSuggest");
  if (!$dd.length) return;

  if (!list.length) {
    $dd.html(`<button type="button" class="dropdown-item disabled">No results</button>`);
    showSkuDropdown();
    return;
  }

  const html = list
    .map((s, idx) => {
      const color = (s.colors?.[0]?.raw || s.colors?.[0]?.normalized || "").toUpperCase();
      const cat = (s.articleId?.category || "");
      const grp = (s.articleId?.categoryGroup || "");
      const active = idx === SKU_ACTIVE_INDEX ? "active" : "";

      return `
        <button type="button"
          class="dropdown-item ${active}"
          data-idx="${idx}"
          style="white-space:normal;"
        >
          <div style="font-weight:700;">${s.skuCode}</div>
          <div style="font-size:12px;opacity:.75;">
            ${s.brand || ""} • ${s.articleName || ""} • ${color} • ${s.size || ""} • ${grp || ""} ${cat ? "• " + cat : ""}
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

  // ✅ use q search your controller supports: /skus?q=
  // add small limit to keep dropdown fast
  const url = `/apis/footwears/skus?q=${encodeURIComponent(qq)}&limit=20`;
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  const list = j.data || j || [];
  return Array.isArray(list) ? list : [];
}

let SKU_DEBOUNCE = null;

function bindSkuAutocomplete() {
  const $inp = $("#skuSearch");
  if (!$inp.length) return;

  // typing
  $inp.on("input", function () {
    const q = $(this).val();

    SKU_PICKED = null;

    if (SKU_DEBOUNCE) clearTimeout(SKU_DEBOUNCE);
    SKU_DEBOUNCE = setTimeout(async () => {
      const text = (q || "").trim();
      if (text.length < 2) {
        hideSkuDropdown();
        return;
      }

      // avoid repeat calls
      if (text === SKU_LAST_Q) return;
      SKU_LAST_Q = text;

      try {
        const list = await fetchSkuSuggestions(text);
        SKU_SUGGESTIONS = list;
        SKU_ACTIVE_INDEX = -1;
        renderSkuDropdown(list);
      } catch (e) {
        console.warn("SKU suggest failed:", e.message);
        hideSkuDropdown();
      }
    }, 180);
  });

  // click suggestion
  $(document).on("click", "#skuSuggest .dropdown-item:not(.disabled)", function () {
    const idx = Number($(this).data("idx"));
    const s = SKU_SUGGESTIONS[idx];
    if (!s) return;

    SKU_PICKED = s;
    $("#skuSearch").val(s.skuCode);
    hideSkuDropdown();

    // focus qty for fast entry
    $("#countedQty").focus().select();
  });

  // keyboard navigation
  $inp.on("keydown", function (e) {
    const $dd = $("#skuSuggest");
    const isOpen = $dd.is(":visible");

    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      SKU_ACTIVE_INDEX = Math.min(SKU_ACTIVE_INDEX + 1, SKU_SUGGESTIONS.length - 1);
      renderSkuDropdown(SKU_SUGGESTIONS);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      SKU_ACTIVE_INDEX = Math.max(SKU_ACTIVE_INDEX - 1, 0);
      renderSkuDropdown(SKU_SUGGESTIONS);
    } else if (e.key === "Enter") {
      // if dropdown open and an item active -> pick it
      if (SKU_ACTIVE_INDEX >= 0 && SKU_SUGGESTIONS[SKU_ACTIVE_INDEX]) {
        e.preventDefault();
        const s = SKU_SUGGESTIONS[SKU_ACTIVE_INDEX];
        SKU_PICKED = s;
        $("#skuSearch").val(s.skuCode);
        hideSkuDropdown();
        $("#countedQty").focus().select();
      }
    } else if (e.key === "Escape") {
      hideSkuDropdown();
    }
  });

  // click outside closes
  $(document).on("click", function (e) {
    if (
      !$(e.target).closest("#skuSuggest").length &&
      !$(e.target).closest("#skuSearch").length
    ) {
      hideSkuDropdown();
    }
  });

  // blur closes (small delay so click still works)
  $inp.on("blur", function () {
    setTimeout(hideSkuDropdown, 120);
  });
}
  // -------------------- INIT --------------------
  $(async function () {
    initAuditsTable();
    initLinesTable();
    await loadStores();
    await loadCategories();
    wireCreateCategoryCascade();
    await refreshAudits();
     bindSkuAutocomplete();
  });
})();
