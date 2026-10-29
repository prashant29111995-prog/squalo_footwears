/* global $, Swal */

(function () {
  const API = "/apis/footwears/skus";
  const ARTICLES_API = "/apis/footwears/articles?all=1";

  let table;
  let CATEGORY_META = {}; // from articles list: group -> Set(categories)

  async function api(url, opt = {}) {
    const r = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...opt,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || j?.message || "API error");
    return j;
  }

  function toast(msg) {
    Swal.fire({ icon: "success", title: msg, timer: 1200, showConfirmButton: false });
  }

  function toastErr(msg) {
    Swal.fire("Error", msg || "Something went wrong", "error");
  }

  function safe(v) {
    return v === null || v === undefined ? "" : String(v);
  }

  function norm(v) {
    return safe(v).trim().toUpperCase();
  }

  // ------------------------------
  // SKU ROW + columns
  // We keep "brand" and also add hidden columns: categoryGroup, category
  // ------------------------------
  function buildRow(s) {
  return {
    _id: s._id,
    skuCode: s.skuCode,
    brand: s.brand,
    article: s.articleName,
    color: s.colors?.[0]?.raw || "",
    size: s.size,

    // ✅ flatten
    category: s.articleId?.category || "",
    categoryGroup: s.articleId?.categoryGroup || "",

    actions: `
      <button class="btn btn-sm btn-outline-brand edit" data-id="${s._id}">
        <i class="la la-edit"></i>
      </button>
      <button class="btn btn-sm btn-outline-danger del" data-id="${s._id}">
        <i class="la la-trash"></i>
      </button>
    `,
  };
}

  async function loadSkus() {
    const res = await api(API);
    const list = res.data || res || [];
    return list.map(buildRow);
  }

  async function refresh() {
    const rows = await loadSkus();
    table.clear().rows.add(rows).draw();
    applyFilters(); // keep filters applied after refresh
  }

  function initTable() {
  table = $("#skusTable").DataTable({
    data: [],
    pageLength: 25,
    columns: [
      { data: "skuCode" },     // 0
      { data: "brand" },       // 1
      { data: "article" },     // 2
      { data: "color" },       // 3
      { data: "size" },        // 4
      { data: "category" },    // 5
      { data: "actions", orderable: false }, // 6

      // hidden filter col for group
      { data: "categoryGroup", visible: false, searchable: true }, // 7
    ],
  });

  $("#generalSearch").on("keyup", (e) => table.search(e.target.value).draw());
  $("#skusTable").on("click", ".edit", (e) => openEdit($(e.currentTarget).data("id")));
  $("#skusTable").on("click", ".del", (e) => confirmDelete($(e.currentTarget).data("id")));
}
  // ------------------------------
  // FILTERS (Group, Category, Brand)
  // Works via DataTables column searches:
  // brand -> column 1
  // categoryGroup -> hidden column 7
  // category -> hidden column 8
  // ------------------------------
  function applyFilters() {
    const brand = norm($("#filter_brand").val());
    const group = norm($("#filter_categoryGroup").val());
    const category = norm($("#filter_category").val());

    // exact match searches (regex)
    table.column(1).search(brand ? `^${brand}$` : "", true, false);
    table.column(7).search(group ? `^${group}$` : "", true, false);
    table.column(8).search(category ? `^${category}$` : "", true, false);

    table.draw();
  }

  function resetFilters() {
    $("#filter_brand").val("");
    $("#filter_categoryGroup").val("");
    $("#filter_category").prop("disabled", true).empty().append(`<option value="">All Categories</option>`);
    applyFilters();
  }

  function fillCategoryFilter(group) {
    const g = norm(group);
    const $cat = $("#filter_category");
    $cat.empty().append(`<option value="">All Categories</option>`);

    if (!g) {
      $cat.prop("disabled", true);
      return;
    }

    const list = Array.from(CATEGORY_META[g] || []).sort();
    if (!list.length) {
      $cat.prop("disabled", true);
      return;
    }

    $cat.prop("disabled", false);
    list.forEach((c) => $cat.append(`<option value="${c}">${c}</option>`));
  }

  function wireFilters() {
    $("#filter_brand").on("keyup", applyFilters);

    $("#filter_categoryGroup").on("change", function () {
      const group = $(this).val();
      fillCategoryFilter(group);
      $("#filter_category").val("");
      applyFilters();
    });

    $("#filter_category").on("change", applyFilters);

    $("#btnClearFilters").on("click", resetFilters);

    // start clean
    resetFilters();
  }

  // ------------------------------
  // EDIT SKU
  // ------------------------------
  async function openEdit(id) {
    const r = await api(`${API}/${id}`);
    const s = r.data || r;

    $("#edit_sku_id").val(s._id);
    $("#edit_sku_code").val(s.skuCode);
    $("#edit_sku_color").val(s.colors?.[0]?.raw || "");
    $("#edit_sku_size").val(s.size);
    $("#edit_sku_active").val(s.isActive ? "true" : "false");

    $("#modalSkuEdit").modal("show");
  }

  $("#skuEditForm").on("submit", async (e) => {
    e.preventDefault();
    const id = $("#edit_sku_id").val();

    try {
      await api(`${API}/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          size: Number($("#edit_sku_size").val()),
          isActive: $("#edit_sku_active").val() === "true",
        }),
      });

      $("#modalSkuEdit").modal("hide");
      toast("SKU updated");
      refresh();
    } catch (err) {
      toastErr(err.message);
    }
  });

  async function confirmDelete(id) {
    const ok = await Swal.fire({
      title: "Delete SKU?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes",
    });
    if (!ok.isConfirmed) return;

    try {
      await api(`${API}/${id}`, { method: "DELETE" });
      toast("SKU deleted");
      refresh();
    } catch (err) {
      toastErr(err.message);
    }
  }

  // ------------------------------
  // BULK MATRIX CREATE
  // - make article select live-search using Select2
  // - keep same submit logic
  // ------------------------------
  $(document).on("submit", "#bulkMatrixForm", async function (e) {
    e.preventDefault();

    try {
      const articleId = $("#bm_article").val();
      const colorsRaw = $("#bm_colors").val() || "";
      const sizesRaw = $("#bm_sizes").val() || "";

      const colorsList = colorsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      const sizes = sizesRaw.split(",").map((s) => s.trim()).filter(Boolean);

      if (!articleId) return Swal.fire("Select Article", "", "warning");
      if (!colorsList.length) return Swal.fire("Enter at least 1 color", "", "warning");
      if (!sizes.length) return Swal.fire("Enter at least 1 size", "", "warning");

      await api(`${API}/bulk-matrix`, {
        method: "POST",
        body: JSON.stringify({ articleId, colorsList, sizes }),
      });

      $("#modalBulkCreate").modal("hide");
      toast("Bulk SKUs created");
      refresh();
    } catch (err) {
      toastErr(err.message);
    }
  });

  async function loadArticlesForBulk() {
    const r = await fetch(ARTICLES_API).then((x) => x.json());
    const list = r.data || r || [];

    // build category meta for filters too
    CATEGORY_META = {};
    list.forEach((a) => {
      const g = norm(a.categoryGroup);
      const c = norm(a.category);
      if (g) {
        if (!CATEGORY_META[g]) CATEGORY_META[g] = new Set();
        if (c) CATEGORY_META[g].add(c);
      }
    });

    const $sel = $("#bm_article");
    $sel.empty().append(`<option value="" disabled selected>Select Article</option>`);

    list.forEach((a) => {
      const label = `${safe(a.brand)} - ${safe(a.articleName)} (${safe(a.categoryGroup)} / ${safe(a.category)})`;
      $sel.append(`<option value="${a._id}">${label}</option>`);
    });

    // ✅ enable live-search (Select2)
    if ($.fn.select2) {
      $sel.select2({
        dropdownParent: $("#modalBulkCreate"),
        width: "100%",
        placeholder: "Search Article...",
      });
    }
  }

  // ------------------------------
  // INIT
  // ------------------------------
  async function init() {
    initTable();
    await loadArticlesForBulk();
    wireFilters();
    await refresh();
  }

  $(init);
})();
