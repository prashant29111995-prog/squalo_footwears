/* global $, Swal */

(function () {
  const storeId = window.__STORE_ID__;
  const API_BASE = "/apis/footwears/assembly";

  const API_LIST = `${API_BASE}/stores/${storeId}/locations`;
  const API_UPDATE = (id) => `${API_BASE}/locations/${id}`;
  const API_DELETE = (id) => `${API_BASE}/locations/${id}`;

  let dt = null;

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
    if (!res.ok) throw new Error(data?.message || "API request failed");
    return data;
  }

  function safe(v) {
    return v === null || v === undefined ? "" : String(v);
  }

  function buildRow(loc) {
    return {
      _id: loc._id,
      name: safe(loc.name),
      code: safe(loc.code),
      // since your listByStore only returns active, this will always be Yes
      isActive: loc.isActive === false ? "No" : "Yes",
      actions: `
        <a class="btn btn-sm btn-outline-success" href="/su/footwear/stores/${storeId}/locations/${loc._id}/racks" title="Open Racks">
          <i class="la la-th-large"></i>
        </a>
        <button class="btn btn-sm btn-outline-brand btn-edit" data-id="${loc._id}">
          <i class="la la-edit"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${loc._id}">
          <i class="la la-trash"></i>
        </button>
      `,
    };
  }

  async function loadLocations() {
    const resp = await api(API_LIST, { method: "GET" });
    // ✅ controller returns {items}
    const list = resp.items || resp.data || [];
    return list.map(buildRow);
  }

  async function refreshTable() {
    const rows = await loadLocations();
    if (!dt) return;
    dt.clear();
    dt.rows.add(rows).draw();
  }

  function initDataTable() {
    dt = $("#locationsTable").DataTable({
      responsive: true,
      processing: true,
      pageLength: 25,
      data: [],
      columns: [
        { data: "name" },
        { data: "code" },
        { data: "isActive" },
        { data: "actions", orderable: false, searchable: false },
      ],
      order: [[0, "asc"]],
    });

    $("#locationsTable tbody").on("click", ".btn-edit", async function () {
      const id = $(this).data("id");
      await openEditModal(id);
    });

    $("#locationsTable tbody").on("click", ".btn-delete", async function () {
      const id = $(this).data("id");
      await confirmDelete(id);
    });
  }

  function resetForm() {
    $("#locationForm")[0].reset();
    $("#loc_id").val("");
    $("#loc_active").val("true");
  }

  function getPayload() {
    return {
      name: $("#loc_name").val().trim(),
      code: $("#loc_code").val().trim(),
      // your backend ignores isActive in create/update, so optional
      isActive: $("#loc_active").val() === "true",
    };
  }

  async function openEditModal(id) {
    const row = dt.rows().data().toArray().find((r) => r._id === id);
    if (!row) return toastError("Location not found in table");

    $("#loc_id").val(id);
    $("#loc_name").val(row.name);
    $("#loc_code").val(row.code);
    $("#loc_active").val(row.isActive === "Yes" ? "true" : "false");
    $("#modalLocationCreate").modal("show");
  }

  async function saveLocation(e) {
    e.preventDefault();
    try {
      const id = $("#loc_id").val();
      const payload = getPayload();

      if (!payload.name) return toastError("Name is required");

      if (!id) {
        await api(API_LIST, { method: "POST", body: JSON.stringify(payload) });
        toastSuccess("Location created");
      } else {
        await api(API_UPDATE(id), { method: "PATCH", body: JSON.stringify(payload) });
        toastSuccess("Location updated");
      }

      $("#modalLocationCreate").modal("hide");
      resetForm();
      await refreshTable();
    } catch (err) {
      toastError(err.message);
    }
  }

  async function confirmDelete(id) {
    const result = await Swal.fire({
      title: "Delete location?",
      text: "This will deactivate the location.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (!result.value) return;

    try {
      await api(API_DELETE(id), { method: "DELETE" });
      toastSuccess("Location deleted");
      await refreshTable();
    } catch (err) {
      toastError(err.message);
    }
  }

  async function init() {
    initDataTable();
    await refreshTable();

    $("#locationForm").on("submit", saveLocation);
    $("#modalLocationCreate").on("hidden.bs.modal", resetForm);
  }

  $(document).ready(function () {
    if (!storeId) return toastError("Missing storeId on page");
    init();
  });
})();
