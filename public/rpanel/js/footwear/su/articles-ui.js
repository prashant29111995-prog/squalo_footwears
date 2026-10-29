/* global $, Swal */

(function () {
  const API = "/apis/footwears/articles";

  let articlesTable = null;
  let categoriesTable = null;

  // category meta from server config
  let CATEGORIES = {}; // { MEN:[...], WOMEN:[...], ... }
  const GROUPS = ["MEN", "WOMEN", "KIDS", "UNISEX"];

  async function api(url, opt = {}) {
    const r = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...opt,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.message || "API error");
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

  // -------------------- CATEGORY META --------------------
  async function loadCategoriesMeta() {
    const r = await api(`${API}/categories`);
    CATEGORIES = r.data || {};
  }

  function categoriesForGroup(group) {
    const g = norm(group);
    return Array.isArray(CATEGORIES[g]) ? CATEGORIES[g] : [];
  }

  function fillCategorySelect($select, group, selected = "", mode = "select") {
    // mode: "select" -> Select category
    // mode: "all" -> All Categories
    const g = norm(group);
    const list = g ? categoriesForGroup(g) : [];

    $select.empty();

    if (!g) {
      // no group -> disable
      $select
        .append(`<option value="">${mode === "all" ? "All Categories" : "Select category"}</option>`)
        .prop("disabled", true);
      return;
    }

    if (!list.length) {
      $select.append(`<option value="">No categories</option>`).prop("disabled", true);
      return;
    }

    // enable
    $select.prop("disabled", false);

    // placeholder
    if (mode === "all") {
      $select.append(`<option value="">All Categories</option>`);
    } else {
      $select.append(`<option value="" disabled ${selected ? "" : "selected"}>Select category</option>`);
    }

    list.forEach((c) => {
      const sel = norm(c) === norm(selected) ? "selected" : "";
      $select.append(`<option value="${c}" ${sel}>${c}</option>`);
    });
  }

  // -------------------- ARTICLES TABLE --------------------
  function mapArticleRow(a) {
    // Backward compatible mapping:
    // old records: { category: "MEN" } and no categoryGroup
    const oldGroup = GROUPS.includes(norm(a.category)) ? norm(a.category) : "";

    const categoryGroup = safe(a.categoryGroup || oldGroup);
    const category = oldGroup ? "" : safe(a.category); // if old "MEN" then show empty sub-category

    return {
      _id: a._id,
      brand: safe(a.brand),
      articleName: safe(a.articleName || a.name),
      categoryGroup,
      category,
      actions: `
        <button class="btn btn-sm btn-outline-brand btn-edit" data-id="${a._id}" title="Edit">
          <i class="la la-edit"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${a._id}" title="Delete">
          <i class="la la-trash"></i>
        </button>
      `,
    };
  }

  async function loadArticles() {
    const r = await api(`${API}?all=1`);
    const list = r.data || r || [];
    return list.map(mapArticleRow);
  }

  async function refreshArticles() {
    const rows = await loadArticles();
    articlesTable.clear().rows.add(rows).draw();
    applyFilters(); // keep filtering
  }

  function initArticlesTable() {
    articlesTable = $("#articlesTable").DataTable({
      responsive: true,
      pageLength: 25,
      data: [],
      columns: [
        { data: "brand" },
        { data: "articleName" },
        { data: "categoryGroup" },
        { data: "category" },
        { data: "actions", orderable: false, searchable: false },
      ],
    });

    $("#generalSearch").on("keyup", function () {
      articlesTable.search(this.value).draw();
    });

    $("#articlesTable").on("click", ".btn-edit", function () {
      openEditModal($(this).data("id"));
    });

    $("#articlesTable").on("click", ".btn-delete", function () {
      confirmDelete($(this).data("id"));
    });
  }

  // -------------------- FILTERS --------------------
  function applyFilters() {
    const brand = norm($("#filter_brand").val());
    const group = norm($("#filter_categoryGroup").val());
    const category = norm($("#filter_category").val());

    // columns: 0 brand, 1 articleName, 2 group, 3 category
    articlesTable.column(0).search(brand ? `^${brand}$` : "", true, false);
    articlesTable.column(2).search(group ? `^${group}$` : "", true, false);
    articlesTable.column(3).search(category ? `^${category}$` : "", true, false);

    articlesTable.draw();
  }

  function resetFilters() {
    $("#filter_brand").val("");
    $("#filter_categoryGroup").val(""); // All Groups
    fillCategorySelect($("#filter_category"), "", "", "all");
    applyFilters();
  }

  function wireFilters() {
    $("#filter_brand").on("keyup", applyFilters);

    $("#filter_categoryGroup").on("change", function () {
      const group = $(this).val();
      // only show categories when group selected
      fillCategorySelect($("#filter_category"), group, "", "all");
      $("#filter_category").val("");
      applyFilters();
    });

    $("#filter_category").on("change", applyFilters);

    $("#btnClearFilters").on("click", resetFilters);

    // IMPORTANT: default to ALL GROUPS
    $("#filter_categoryGroup").val("");
    fillCategorySelect($("#filter_category"), "", "", "all");
  }

  // -------------------- CREATE ARTICLE --------------------
  function resetCreateForm() {
    $("#articleCreateForm")[0].reset();
    $("#article_categoryGroup").val("");
    fillCategorySelect($("#article_category"), "", "");
  }

  function getCreatePayload() {
    return {
      brand: $("#article_brand").val().trim(),
      articleName: $("#article_name").val().trim(),
      categoryGroup: $("#article_categoryGroup").val(),
      category: $("#article_category").val(),
      meta: { notes: $("#article_notes").val().trim() },
    };
  }

  function wireCreateModal() {
    $("#article_categoryGroup").on("change", function () {
      const group = $(this).val();
      fillCategorySelect($("#article_category"), group, "");
    });

    $("#modalArticleCreate").on("shown.bs.modal", function () {
      // ensure category dropdown reflects group if already selected
      const group = $("#article_categoryGroup").val();
      fillCategorySelect($("#article_category"), group, "");
    });

    $("#modalArticleCreate").on("hidden.bs.modal", resetCreateForm);

    $("#articleCreateForm").on("submit", async function (e) {
      e.preventDefault();
      try {
        const payload = getCreatePayload();

        if (!payload.brand || !payload.articleName || !payload.categoryGroup || !payload.category) {
          return Swal.fire("Missing fields", "Brand, Article Name, Category Group, Category required", "warning");
        }

        await api(API, { method: "POST", body: JSON.stringify(payload) });

        $("#modalArticleCreate").modal("hide");
        toast("Article created");
        await refreshArticles();
      } catch (err) {
        toastErr(err.message);
      }
    });
  }

  // -------------------- EDIT ARTICLE --------------------
  function getEditPayload() {
    return {
      brand: $("#edit_article_brand").val().trim(),
      articleName: $("#edit_article_name").val().trim(),
      categoryGroup: $("#edit_article_categoryGroup").val(),
      category: $("#edit_article_category").val(),
      isActive: $("#edit_article_active").val() === "true",
      meta: { notes: $("#edit_article_notes").val().trim() },
    };
  }

  function wireEditModal() {
    $("#edit_article_categoryGroup").on("change", function () {
      const group = $(this).val();
      fillCategorySelect($("#edit_article_category"), group, "");
    });

    $("#articleEditForm").on("submit", async function (e) {
      e.preventDefault();
      try {
        const id = $("#edit_article_id").val();
        if (!id) return toastErr("Missing article id");

        const payload = getEditPayload();
        if (!payload.brand || !payload.articleName || !payload.categoryGroup || !payload.category) {
          return Swal.fire("Missing fields", "Brand, Article Name, Category Group, Category required", "warning");
        }

        await api(`${API}/${id}`, { method: "PATCH", body: JSON.stringify(payload) });

        $("#modalArticleEdit").modal("hide");
        toast("Article updated");
        await refreshArticles();
      } catch (err) {
        toastErr(err.message);
      }
    });
  }

  async function openEditModal(id) {
    try {
      const r = await api(`${API}/${id}`);
      const a = r.data || r;

      $("#edit_article_id").val(a._id);
      $("#edit_article_brand").val(a.brand || "");
      $("#edit_article_name").val(a.articleName || "");

      // group + category
      const group = a.categoryGroup || (GROUPS.includes(norm(a.category)) ? norm(a.category) : "");
      $("#edit_article_categoryGroup").val(group);

      // populate category select based on group
      fillCategorySelect($("#edit_article_category"), group, a.category);

      $("#edit_article_active").val(a.isActive === false ? "false" : "true");
      $("#edit_article_notes").val(a?.meta?.notes || "");

      $("#modalArticleEdit").modal("show");
    } catch (err) {
      toastErr(err.message);
    }
  }

  // -------------------- DELETE ARTICLE --------------------
  async function confirmDelete(id) {
    const ok = await Swal.fire({
      title: "Delete article?",
      text: "This will deactivate/delete the article.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
    });
    if (!ok.value) return;

    try {
      await api(`${API}/${id}`, { method: "DELETE" });
      toast("Article deleted");
      await refreshArticles();
    } catch (err) {
      toastErr(err.message);
    }
  }

  // -------------------- CATEGORIES MODAL (READ ONLY) --------------------
  function initCategoriesTable() {
    categoriesTable = $("#CategoryTable").DataTable({
      responsive: true,
      pageLength: 25,
      data: [],
      columns: [
        { data: "group" },
        { data: "category" },
        { data: "actions", orderable: false, searchable: false },
      ],
    });
  }

  function refreshCategoriesTable() {
    const rows = [];
    Object.keys(CATEGORIES || {}).forEach((g) => {
      (CATEGORIES[g] || []).forEach((c) => {
        rows.push({ group: g, category: c, actions: `<span class="text-muted">-</span>` });
      });
    });
    categoriesTable.clear().rows.add(rows).draw();
  }

  function wireCategoriesModal() {
    $("#modalCategory").on("shown.bs.modal", function () {
      refreshCategoriesTable();
    });
  }

  // -------------------- INIT --------------------
  $(async function () {
    try {
      await loadCategoriesMeta();

      initArticlesTable();
      initCategoriesTable();

      wireFilters();
      wireCreateModal();
      wireEditModal();
      wireCategoriesModal();

      await refreshArticles();
    } catch (err) {
      toastErr(err.message);
    }
  });
})();
