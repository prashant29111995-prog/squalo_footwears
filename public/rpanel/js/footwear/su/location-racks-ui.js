/* global $, Swal */

(function () {
  const storeId = window.__STORE_ID__;
  const locationId = window.__LOCATION_ID__;
  const API_BASE = "/apis/footwears/assembly";

  // Categories master (group -> categories[])
  const API_CATEGORIES = "/apis/footwears/articles/categories";
  let CATEGORY_MAP = {};

  // Racks CRUD
  const API_LIST = `${API_BASE}/stores/${storeId}/locations/${locationId}/racks`;
  const API_UPDATE = (id) => `${API_BASE}/racks/${id}`;
  const API_DELETE = (id) => `${API_BASE}/racks/${id}`;

  // Local state
  let RACKS = [];       // full list
  let FILTERED = [];    // filtered list

  function toastSuccess(msg) {
    Swal.fire({ icon: "success", title: msg, timer: 1200, showConfirmButton: false });
  }
  function toastError(msg) {
    Swal.fire({ icon: "error", title: "Error", text: msg || "Something went wrong" });
  }

  async function api(url, options = {}) {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "API request failed");
    return data;
  }

  function safe(v) {
    return v === null || v === undefined ? "" : String(v);
  }
  function up(v) {
    return String(v || "").trim().toUpperCase();
  }

  function fmtPairs(n) {
    return `${Number(n || 0)} Pairs`;
  }

  function capText(cap) {
    const c = Number(cap || 0);
    return c > 0 ? fmtPairs(c) : "∞";
  }

  function pct(used, cap) {
    used = Number(used || 0);
    cap = Number(cap || 0);
    if (cap <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((used / cap) * 100)));
  }

  // -------------------------
  // Categories dropdown logic
  // -------------------------
  async function loadCategoryMap() {
    const resp = await api(API_CATEGORIES, { method: "GET" });
    CATEGORY_MAP = resp?.data || {};
  }

  function fillCategoryDropdown(group, selected = "") {
    const g = up(group);
    const list = CATEGORY_MAP[g] || [];
    const $cat = $("#rack_category");
    if (!$cat.length) return;

    $cat.empty();
    $cat.append(`<option value="">Select category...</option>`);

    list.forEach((c) => {
      const val = String(c || "").trim();
      const sel = selected && up(selected) === up(val) ? "selected" : "";
      $cat.append(`<option value="${val}" ${sel}>${val}</option>`);
    });

    if (g === "UNISEX" && list.length === 0) {
      $cat.append(`<option value="OTHER">OTHER</option>`);
    }

    if (selected && list.length > 0) {
      const exists = list.some((x) => up(x) === up(selected));
      if (!exists) {
        $cat.append(`<option value="${selected}" selected>${selected} (legacy)</option>`);
      }
    }
  }

  function hookCategoryEvents() {
    $("#rack_group").on("change", function () {
      fillCategoryDropdown(this.value, "");
    });

    $("#modalRack").on("shown.bs.modal", function () {
      const g = $("#rack_group").val() || "MEN";
      const selected = $("#rack_category").val() || "";
      fillCategoryDropdown(g, selected);
    });
  }

  // -------------------------
  // Load + render
  // -------------------------
  async function loadRacks() {
    const resp = await api(API_LIST, { method: "GET" });
    const list = resp.items || resp.data || [];
    return Array.isArray(list) ? list : [];
  }

  function computeStats(list) {
    const totalRacks = list.length;

    const capSum = list.reduce((s, r) => s + (Number(r.capacityPairs || 0) > 0 ? Number(r.capacityPairs || 0) : 0), 0);
    const usedSum = list.reduce((s, r) => s + Number(r.usedPairs || 0), 0);

    // if some racks are unlimited, total capacity isn't strictly meaningful
    const hasUnlimited = list.some((r) => Number(r.capacityPairs || 0) <= 0);

    const freeSum = list.reduce((s, r) => {
      const cap = Number(r.capacityPairs || 0);
      const used = Number(r.usedPairs || 0);
      if (cap > 0) return s + Math.max(0, cap - used);
      return s;
    }, 0);

    $("#statRacks").text(String(totalRacks));
    $("#statUsed").text(fmtPairs(usedSum));
    $("#statCap").text(hasUnlimited ? `${fmtPairs(capSum)} + ∞` : fmtPairs(capSum));
    $("#statFree").text(hasUnlimited ? `${fmtPairs(freeSum)} + ∞` : fmtPairs(freeSum));
  }

  function rackCardHTML(r) {
    const code = safe(r.rackCode || r.code);
    const name = safe(r.rackName || r.name);
    const grp = safe(r.categoryGroup);
    const cat = safe(r.category);

    const cap = Number(r.capacityPairs || 0);
    const used = Number(r.usedPairs || 0);
    const free = cap > 0 ? Math.max(0, cap - used) : null;

    const p = pct(used, cap);

    const capLabel = capText(cap);
    const usedLabel = fmtPairs(used);
    const freeLabel = free === null ? "∞" : fmtPairs(free);

    return `
      <div class="col-md-4 col-lg-3 mb-3" data-id="${r._id}">
        <div class="kt-portlet" style="border-radius:14px; border:1px solid #eef1f5; box-shadow:0 8px 18px rgba(0,0,0,.03); overflow:hidden;">
          <div style="padding:12px 12px 10px 12px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div>
                <div style="font-weight:900; font-size:14px; letter-spacing:.2px;">${code}</div>
                <div style="font-size:12px; opacity:.8;">${name || "-"}</div>
              </div>
              <span class="badge badge-light" style="font-weight:800;">${grp || "-"} • ${cat || "-"}</span>
            </div>

            <div style="margin-top:10px;">
              <div style="display:flex; justify-content:space-between; font-size:12px; opacity:.85;">
                <span><b>${usedLabel}</b> used</span>
                <span>${capLabel} cap</span>
              </div>
              <div class="progress" style="height:10px; border-radius:999px; margin-top:6px;">
                <div class="progress-bar" role="progressbar" style="width:${cap > 0 ? p : 100}%; border-radius:999px;"></div>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:12px; opacity:.75; margin-top:6px;">
                <span>${cap > 0 ? `${p}% utilized` : "Unlimited capacity"}</span>
                <span><b>${freeLabel}</b> free</span>
              </div>
            </div>

            <div style="display:flex; gap:8px; margin-top:12px;">
              <a class="btn btn-sm btn-outline-success" style="flex:1;" href="/su/footwear/racks/${r._id}/items" title="Rack Items">
                <i class="la la-list"></i> Items
              </a>
              <button class="btn btn-sm btn-outline-brand btn-edit" data-id="${r._id}" title="Edit">
                <i class="la la-edit"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${r._id}" title="Delete">
                <i class="la la-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderRacks(list) {
    computeStats(list);

    const $grid = $("#racksGrid");
    const $empty = $("#racksEmpty");

    if (!list.length) {
      $grid.empty();
      $empty.show();
      return;
    }

    $empty.hide();
    $grid.html(list.map(rackCardHTML).join(""));
  }

  function applySearch() {
    const q = up($("#rackSearch").val());
    if (!q) {
      FILTERED = [...RACKS];
      renderRacks(FILTERED);
      return;
    }

    FILTERED = RACKS.filter((r) => {
      const hay = [
        r.rackCode,
        r.rackName,
        r.categoryGroup,
        r.category,
      ].map((x) => up(x)).join(" ");
      return hay.includes(q);
    });

    renderRacks(FILTERED);
  }

  // -------------------------
  // Modal + CRUD
  // -------------------------
  function resetForm() {
    $("#rackForm")[0].reset();
    $("#rack_id").val("");
    $("#rack_active").val("true");
    $("#rack_capacity").val("");

    const g = $("#rack_group").val() || "MEN";
    fillCategoryDropdown(g, "");
  }

  function getPayload() {
    return {
      rackCode: $("#rack_code").val().trim(),
      rackName: $("#rack_name").val().trim(),
      categoryGroup: $("#rack_group").val(),
      category: $("#rack_category").val(),
      capacityPairs: Math.max(0, Number($("#rack_capacity").val() || 0)),
      isActive: $("#rack_active").val() === "true",
    };
  }

  function openEditModal(id) {
    const r = RACKS.find((x) => String(x._id) === String(id));
    if (!r) return toastError("Rack not found");

    $("#rack_id").val(r._id);
    $("#rack_code").val(r.rackCode || "");
    $("#rack_name").val(r.rackName || "");

    const g = r.categoryGroup || "MEN";
    $("#rack_group").val(g);

    fillCategoryDropdown(g, r.category || "");

    $("#rack_capacity").val(Number(r.capacityPairs || 0));
    $("#rack_active").val(r.isActive === false ? "false" : "true");

    $("#modalRack").modal("show");
  }

  async function saveRack(e) {
    e.preventDefault();
    try {
      const id = $("#rack_id").val();
      const payload = getPayload();

      if (!payload.rackCode) return toastError("Rack Code is required");
      if (!payload.rackName) return toastError("Rack Name is required");
      if (!payload.categoryGroup) return toastError("Category Group is required");
      if (!payload.category) return toastError("Category is required");

      if (!id) {
        await api(API_LIST, { method: "POST", body: JSON.stringify(payload) });
        toastSuccess("Rack created");
      } else {
        await api(API_UPDATE(id), { method: "PATCH", body: JSON.stringify(payload) });
        toastSuccess("Rack updated");
      }

      $("#modalRack").modal("hide");
      resetForm();
      await reloadAndRender();
    } catch (err) {
      toastError(err.message);
    }
  }

  async function confirmDelete(id) {
    const result = await Swal.fire({
      title: "Delete rack?",
      text: "This will deactivate the rack.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      await api(API_DELETE(id), { method: "DELETE" });
      toastSuccess("Rack deleted");
      await reloadAndRender();
    } catch (err) {
      toastError(err.message);
    }
  }

  // -------------------------
  // Bind actions from cards
  // -------------------------
  function bindCardActions() {
    // Edit
    $(document).on("click", ".btn-edit", function () {
      openEditModal($(this).data("id"));
    });

    // Delete
    $(document).on("click", ".btn-delete", async function () {
      await confirmDelete($(this).data("id"));
    });
  }

  async function reloadAndRender() {
    RACKS = await loadRacks();
    FILTERED = [...RACKS];
    applySearch();
  }

  // -------------------------
  // Init
  // -------------------------
  async function init() {
    // categories first for dropdown
    await loadCategoryMap();
    hookCategoryEvents();
    fillCategoryDropdown($("#rack_group").val() || "MEN", "");

    bindCardActions();

    // search
    $("#rackSearch").on("input", function () {
      applySearch();
    });

    await reloadAndRender();

    $("#rackForm").on("submit", saveRack);
    $("#modalRack").on("hidden.bs.modal", resetForm);
  }

  $(document).ready(function () {
    if (!storeId || !locationId) return toastError("Missing storeId/locationId on page");
    init();
  });
})();
