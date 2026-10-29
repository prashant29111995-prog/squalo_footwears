/* global $, Swal */

(function () {
  const API_BASE = "/apis/footwears/stores";
  let dt = null;

  function toastSuccess(msg) {
    Swal.fire({ icon: "success", title: msg, timer: 1200, showConfirmButton: false });
  }

  function toastError(msg) {
    Swal.fire({ icon: "error", title: "Error", text: msg || "Something went wrong" });
  }

  function showDebugError(title, err) {
    const status = err?.status ? `HTTP ${err.status}` : "";
    const body = (err?.raw || err?.data?.raw || err?.message || "").toString();
    const snippet = body.length > 600 ? body.slice(0, 600) + "..." : body;

    console.error("[STORE API ERROR]", err);

    Swal.fire({
      icon: "error",
      title: title || "Request failed",
      html: `
        <div style="text-align:left">
          <div><b>${status}</b></div>
          <pre style="white-space:pre-wrap;word-break:break-word;margin-top:8px">${snippet}</pre>
        </div>
      `,
    });
  }

  // ✅ Robust API helper (supports 204 + non-json errors + captures raw)
  async function api(url, options = {}) {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });

    if (res.status === 204) return { ok: true };

    const raw = await res.text().catch(() => "");
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (e) {
      data = { raw };
    }

    if (!res.ok) {
      const msg = data?.message || data?.error || data?.raw || raw || "API request failed";
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      err.raw = raw;
      throw err;
    }

    return data;
  }

  function safe(v) {
    return v === null || v === undefined ? "" : String(v);
  }

  function buildRow(store) {
    const addr = store.address || {};
    return {
      _id: store._id,
      code: safe(store.code),
      name: safe(store.name),
      type: safe(store.type),
      city: safe(addr.city),
      isActive: store.isActive === false ? "No" : "Yes",
      actions: `
        <a class="btn btn-sm btn-outline-success" href="/su/footwear/stores/${store._id}/locations" title="Locations">
          <i class="la la-map-marker"></i>
        </a>
        <button type="button" class="btn btn-sm btn-outline-brand btn-edit" data-id="${store._id}" title="Edit">
          <i class="la la-edit"></i>
        </button>
        <button type="button" class="btn btn-sm btn-outline-danger btn-delete" data-id="${store._id}" title="Delete">
          <i class="la la-trash"></i>
        </button>
      `,
    };
  }

  async function loadStores() {
    const resp = await api(`${API_BASE}/`, { method: "GET" });
    const list = resp.data || resp || [];
    return list.map(buildRow);
  }

  async function refreshTable() {
    const rows = await loadStores();
    dt.clear();
    dt.rows.add(rows).draw(false);
  }

  function initDataTable() {
    dt = $("#storesTable").DataTable({
      responsive: true,
      processing: true,
      pageLength: 25,
      data: [],
      columns: [
        { data: "code" },
        { data: "name" },
        { data: "type" },
        { data: "city" },
        { data: "isActive" },
        { data: "actions", orderable: false, searchable: false },
      ],
    });

    $("#generalSearch").on("keyup", function () {
      dt.search(this.value).draw();
    });

    // ✅ IMPORTANT: bind to #storesTable (works for responsive child rows too)
    $("#storesTable").on("click", "button.btn-edit", async function (e) {
      e.preventDefault();
      e.stopPropagation();
      const id = $(this).attr("data-id");
      if (!id) return toastError("Missing store id");
      await openEditModal(id);
    });

    $("#storesTable").on("click", "button.btn-delete", async function (e) {
      e.preventDefault();
      e.stopPropagation();
      const id = $(this).attr("data-id");
      if (!id) return toastError("Missing store id");
      await confirmDelete(id);
    });
  }

  function getCreatePayload() {
    return {
      code: $("#store_code").val().trim(),
      name: $("#store_name").val().trim(),
      type: $("#store_type").val(),
      address: {
        line1: $("#store_addr1").val().trim(),
        city: $("#store_city").val().trim(),
        state: $("#store_state").val().trim(),
        pincode: $("#store_pincode").val().trim(),
      },
    };
  }

  function getEditPayload() {
    return {
      code: $("#edit_store_code").val().trim(),
      name: $("#edit_store_name").val().trim(),
      type: $("#edit_store_type").val(),
      isActive: $("#edit_store_active").val() === "true",
      address: {
        line1: $("#edit_store_addr1").val().trim(),
        city: $("#edit_store_city").val().trim(),
        state: $("#edit_store_state").val().trim(),
        pincode: $("#edit_store_pincode").val().trim(),
      },
    };
  }

  function resetCreateForm() {
    const form = $("#storeCreateForm")[0];
    if (form) form.reset();
  }

  async function createStore(e) {
    e.preventDefault();
    try {
      const payload = getCreatePayload();
      if (!payload.code || !payload.name) return toastError("Code and Name are required");

      await api(`${API_BASE}/`, { method: "POST", body: JSON.stringify(payload) });

      $("#modalStoreCreate").modal("hide");
      resetCreateForm();
      toastSuccess("Store created");
      await refreshTable();
    } catch (err) {
      showDebugError("Create failed", err);
    }
  }

  async function openEditModal(id) {
    try {
      const resp = await api(`${API_BASE}/${id}`, { method: "GET" });
      const store = resp.data || resp;

      $("#edit_store_id").val(store._id);
      $("#edit_store_code").val(store.code || "");
      $("#edit_store_name").val(store.name || "");
      $("#edit_store_type").val(store.type || "RETAIL");
      $("#edit_store_active").val(store.isActive === false ? "false" : "true");

      const addr = store.address || {};
      $("#edit_store_addr1").val(addr.line1 || "");
      $("#edit_store_city").val(addr.city || "");
      $("#edit_store_state").val(addr.state || "");
      $("#edit_store_pincode").val(addr.pincode || "");

      $("#modalStoreEdit").modal("show");
    } catch (err) {
      showDebugError("Load store failed", err);
    }
  }

  async function updateStore(e) {
    e.preventDefault();
    try {
      const id = $("#edit_store_id").val();
      if (!id) return toastError("Missing store id");

      const payload = getEditPayload();
      if (!payload.code || !payload.name) return toastError("Code and Name are required");

      await api(`${API_BASE}/${id}`, { method: "PATCH", body: JSON.stringify(payload) });

      $("#modalStoreEdit").modal("hide");
      toastSuccess("Store updated");
      await refreshTable();
    } catch (err) {
      showDebugError("Update failed", err);
    }
  }

  // ✅ Delete with clear error + soft delete fallback
  async function confirmDelete(id) {
    const result = await Swal.fire({
      title: "Delete store?",
      text: "We will try hard delete. If backend blocks it, we will deactivate.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes",
      cancelButtonText: "Cancel",
    });

    if (!result.value) return;

    // 1) hard delete
    try {
      await api(`${API_BASE}/${id}`, { method: "PATCH" , body: JSON.stringify("isActive: false")});
      toastSuccess("Store deleted");
      await refreshTable();
      return;
    } catch (err) {
      // 2) soft delete fallback
      try {
        
        await api(`${API_BASE}/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: false }),
        });
        toastSuccess("Store deactivated");
        await refreshTable();
        return;
      } catch (err2) {
        // show both errors
        const combined = new Error(
          `Hard delete: ${err?.message || "failed"} | Soft delete: ${err2?.message || "failed"}`
        );
        combined.status = err2.status || err.status;
        combined.raw =
          `--- HARD DELETE ---\n${(err?.raw || err?.message || "").slice(0, 600)}\n\n` +
          `--- SOFT DELETE ---\n${(err2?.raw || err2?.message || "").slice(0, 600)}`;
        showDebugError("Delete failed", combined);
      }
    }
  }

  async function init() {
    initDataTable();
    await refreshTable();

    $("#storeCreateForm").on("submit", createStore);
    $("#storeEditForm").on("submit", updateStore);
    $("#modalStoreCreate").on("hidden.bs.modal", resetCreateForm);
  }

  $(document).ready(function () {
    init();
  });
})();
