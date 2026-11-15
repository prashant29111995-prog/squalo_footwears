/* global $, Swal */

(function () {
  "use strict";

  const STORES_API = "/apis/footwears/stores";
  const BUSINESS_API = "/apis/footwears/businesses";

  let table;
  let businesses = [];
  let dataReady = false;

  let refreshPromise = null;
  let refreshQueued = false;

  let editingBusinessId = "";
  let editRequest = 0;

  let staffBusiness = null;
  let staffStores = [];
  let staffRequest = 0;
  let staffSaving = false;
  let staffReady = false;

  const savingForms = new Set();
  const pendingDeactivations = new Set();

  // --------------------------------------------------
  // Helpers
  // --------------------------------------------------

  function str(value) {
    return String(value == null ? "" : value);
  }

  function validId(value) {
    return /^[a-f\d]{24}$/i.test(str(value));
  }

  function escapeHtml(value) {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return str(value).replace(/[&<>"']/g, function (character) {
      return entities[character];
    });
  }

  function success(message) {
    return Swal.fire({
      icon: "success",
      title: message,
      timer: 1800,
      showConfirmButton: false,
    });
  }

  function showError(message) {
    return Swal.fire({
      icon: "error",
      title: "Unable to complete action",
      text: message || "Please try again.",
    });
  }

  function documentId(value) {
    if (typeof value === "string") return value;
    return value && value._id ? String(value._id) : "";
  }

  function errorText(value) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(errorText).filter(Boolean).join("; ");
  }

  if (value && typeof value === "object") {
    if (typeof value.message === "string") return value.message;
    if (typeof value.msg === "string") return value.msg;

    return JSON.stringify(value);
  }

  return "";
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(options.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...(options.headers || {}),
    },
  });

  const raw = await response.text();
  let result;

  try {
    result = JSON.parse(raw);
  } catch (error) {
    console.error("Non-JSON API response", {
      url,
      status: response.status,
      redirected: response.redirected,
      responseURL: response.url,
    });

    throw new Error(
      `${response.status} — ${url}: ` +
      "Expected JSON but received another response. " +
      "Check your login session and API route."
    );
  }

  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result)
  ) {
    throw new Error(
      `${response.status} — ${url}: Invalid API response`
    );
  }

  if (
    response.redirected ||
    result.redirect ||
    !response.ok ||
    result.ok === false ||
    result.error
  ) {
    const message =
      errorText(result.errors) ||
      errorText(result.message) ||
      errorText(result.error) ||
      "Request failed";

    console.error("Store API request failed", {
      url,
      status: response.status,
      response: result,
    });

    throw new Error(
      `${response.status} — ${url}: ${message}`
    );
  }

  return result;
}

  // Fetch every page instead of silently loading only 25 records.
  async function allPages(baseUrl) {
    const items = [];
    let page = 1;

    while (page <= 1000) {
      const separator = baseUrl.includes("?") ? "&" : "?";

      const response = await api(
        baseUrl + separator + "page=" + page + "&limit=200"
      );

      if (
        !Array.isArray(response.data) ||
        !response.meta ||
        !Number.isInteger(response.meta.pages) ||
        response.meta.pages < 0
      ) {
        throw new Error("The server returned invalid pagination.");
      }

      items.push(...response.data);

      if (page >= response.meta.pages) {
        return items;
      }

      page += 1;
    }

    throw new Error(
      "Too many records to load at once. Server-side table pagination is required."
    );
  }

  // --------------------------------------------------
  // Store list
  // --------------------------------------------------

  function businessFor(id) {
    return businesses.find(function (business) {
      return business._id === id;
    });
  }

  function businessLabel(business) {
    return (
      business.name +
      " — " +
      business.code +
      (business.isActive ? "" : " (Inactive)")
    );
  }

  function populateBusinesses(selector, selectedId, locked) {
    const select = $(selector).empty();

    select.append(new Option("Select workspace", ""));

    businesses.forEach(function (business) {
      const option = new Option(
        businessLabel(business),
        business._id
      );

      option.disabled = !business.isActive;
      select.append(option);
    });

    if (selectedId && !businessFor(selectedId)) {
      select.append(
        new Option("Linked workspace: " + selectedId, selectedId)
      );
    }

    select.val(selectedId || "");
    select.prop("disabled", !!locked);
  }

  function buildRow(store) {
    const businessId = documentId(store.businessId);
    const business = businessFor(businessId);
    const escapedId = escapeHtml(store._id);

    const staffButton =
      business && business.businessType === "PARTY"
        ? '<button type="button" ' +
          'class="btn btn-sm btn-outline-primary btn-staff" ' +
          'data-business-id="' +
          escapeHtml(businessId) +
          '">Staff &amp; Logins</button>'
        : "";

    return {
      _id: store._id,
      code: str(store.code),
      name: str(store.name),
      business: businessId
        ? business
          ? businessLabel(business)
          : "Linked workspace unavailable"
        : "Not linked",
      type: str(store.type),
      city: str(store.address && store.address.city),
      isActive: store.isActive === false ? "Inactive" : "Active",
      actions:
        '<div class="d-flex flex-wrap" style="gap:6px">' +
        '<a class="btn btn-sm btn-outline-success" href="' +
        "/su/footwear/stores/" +
        encodeURIComponent(store._id) +
        '/locations">Locations</a>' +
        staffButton +
        '<button type="button" ' +
        'class="btn btn-sm btn-outline-brand btn-edit" ' +
        'data-id="' +
        escapedId +
        '">Edit</button>' +
        (store.isActive !== false
          ? '<button type="button" ' +
            'class="btn btn-sm btn-outline-danger btn-delete" ' +
            'data-id="' +
            escapedId +
            '">Deactivate</button>'
          : "") +
        "</div>",
    };
  }

  async function refreshTable() {
    if (refreshPromise) {
      refreshQueued = true;
      return refreshPromise;
    }

    refreshPromise = (async function () {
      $("#storesTable").attr("aria-busy", "true");

      try {
        const results = await Promise.all([
          allPages(BUSINESS_API),
          allPages(STORES_API + "?isActive=all"),
        ]);

        businesses = results[0];
        const stores = results[1].filter(function (store) {
          return store && validId(store._id);
        });

        dataReady = true;

        table.clear().rows.add(stores.map(buildRow)).draw(false);
      } catch (error) {
        await showError(
          error.message +
            " Any previously displayed records may be outdated."
        );
      } finally {
        $("#storesTable").attr("aria-busy", "false");
      }
    })();

    await refreshPromise;
    refreshPromise = null;

    if (refreshQueued) {
      refreshQueued = false;
      await refreshTable();
    }
  }

  function initTable() {
    const textRenderer = $.fn.dataTable.render.text();

    table = $("#storesTable").DataTable({
      responsive: false,
      scrollX: true,
      pageLength: 25,
      lengthMenu: [10, 25, 50, 100],
      data: [],
      order: [[0, "asc"]],
      dom: "rt<'row mt-3'<'col-md-4'l><'col-md-4'i><'col-md-4'p>>",
      language: {
        emptyTable: "No stores to display.",
        zeroRecords: "No stores match your search.",
      },
      columns: [
        { data: "code", render: textRenderer },
        { data: "name", render: textRenderer },
        { data: "business", render: textRenderer },
        { data: "type", render: textRenderer },
        { data: "city", render: textRenderer },
        { data: "isActive", render: textRenderer },
        {
          data: "actions",
          orderable: false,
          searchable: false,
        },
      ],
    });
  }

  // --------------------------------------------------
  // Store forms
  // --------------------------------------------------

  function storePayload(prefix) {
    return {
      code: str($("#" + prefix + "code").val()).trim(),
      name: str($("#" + prefix + "name").val()).trim(),
      type: $("#" + prefix + "type").val(),
      address: {
        line1: str($("#" + prefix + "addr1").val()).trim(),
        city: str($("#" + prefix + "city").val()).trim(),
        state: str($("#" + prefix + "state").val()).trim(),
        pincode: str($("#" + prefix + "pincode").val()).trim(),
      },
    };
  }

  async function saveStore(form, editing) {
    if (savingForms.has(form.id) || !form.reportValidity()) {
      return;
    }

    const prefix = editing ? "edit_store_" : "store_";
    const payload = storePayload(prefix);
    const id = editing ? $("#edit_store_id").val() : "";

    if (!payload.code || !payload.name) {
      showError("Store code and name are required.");
      return;
    }

    if (editing && !validId(id)) {
      showError("Invalid store. Close the form and reopen it.");
      return;
    }

    if (editing) {
      payload.isActive =
        $("#edit_store_active").val() === "true";

      // Existing ownership is never reassigned through this form.
      if (!editingBusinessId) {
        const selected = $("#edit_store_businessId").val();

        if (selected) {
          payload.businessId = selected;
        }
      }
    } else {
      payload.businessId = $("#store_businessId").val();

      if (!validId(payload.businessId)) {
        showError("Select a business workspace.");
        return;
      }
    }

    const modal = $(form).closest(".modal");
    const submit = $('button[form="' + form.id + '"]');
    const dismiss = modal.find('[data-dismiss="modal"]');
    const originalLabel = submit.text();

    let saved = false;

    // Lock before confirmation to prevent repeated submissions.
    savingForms.add(form.id);
    submit.prop("disabled", true);
    dismiss.prop("disabled", true);

    try {
      if (editing && payload.businessId) {
        const confirmation = await Swal.fire({
          icon: "warning",
          title: "Assign store ownership?",
          text:
            "Link this store only if its stock, racks and historical " +
            "records belong to the selected business. Its owner cannot " +
            "be changed through this form afterwards.",
          showCancelButton: true,
          confirmButtonText: "Link this store",
        });

        if (!confirmation.isConfirmed) {
          return;
        }
      }

      submit.text("Saving...");

      await api(
        editing ? STORES_API + "/" + id : STORES_API,
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        }
      );

      saved = true;
    } catch (error) {
      await showError(error.message);
    } finally {
      savingForms.delete(form.id);
      submit.prop("disabled", false).text(originalLabel);
      dismiss.prop("disabled", false);
    }

    if (saved) {
      modal.modal("hide");
      success(editing ? "Store updated" : "Store created");

      // Refresh failures are reported separately from successful saves.
      await refreshTable();
    }
  }

  async function openEdit(id) {
    const request = ++editRequest;

    try {
      const response = await api(STORES_API + "/" + id);

      if (request !== editRequest) return;

      const store = response.data;

      if (!store || store._id !== id) {
        throw new Error("The server returned an invalid store.");
      }

      editingBusinessId = documentId(store.businessId);

      $("#edit_store_id").val(store._id);
      $("#edit_store_code").val(store.code || "");
      $("#edit_store_name").val(store.name || "");
      $("#edit_store_type").val(store.type || "RETAIL");
      $("#edit_store_active").val(
        String(store.isActive !== false)
      );

      const address = store.address || {};

      $("#edit_store_addr1").val(address.line1 || "");
      $("#edit_store_city").val(address.city || "");
      $("#edit_store_state").val(address.state || "");
      $("#edit_store_pincode").val(address.pincode || "");

      populateBusinesses(
        "#edit_store_businessId",
        editingBusinessId,
        !!editingBusinessId
      );

      $("#storeOwnershipHelp").text(
        editingBusinessId
          ? "Ownership is locked. Changing it requires a separate migration."
          : "Select the correct owner to link this existing store. Leave blank to keep it unlinked."
      );

      $("#modalStoreEdit").modal("show");
    } catch (error) {
      if (request === editRequest) {
        showError(error.message);
      }
    }
  }

  async function deactivateStore(id, button) {
    if (pendingDeactivations.has(id)) return;

    pendingDeactivations.add(id);
    button.prop("disabled", true);

    try {
      const confirmation = await Swal.fire({
        icon: "warning",
        title: "Deactivate store?",
        text:
          "The store will become inactive. Its existing stock, " +
          "racks and records will be retained.",
        showCancelButton: true,
        confirmButtonText: "Deactivate",
      });

      if (!confirmation.isConfirmed) return;

      await api(STORES_API + "/" + id, {
        method: "DELETE",
      });

      success("Store deactivated");
      await refreshTable();
    } catch (error) {
      showError(error.message);
    } finally {
      pendingDeactivations.delete(id);
      button.prop("disabled", false);
    }
  }

  // --------------------------------------------------
  // Staff setup
  // --------------------------------------------------

  function staffMessage(message, kind) {
    $("#staffLoadMessage")
      .removeClass(
        "d-none alert-info alert-warning alert-danger alert-success"
      )
      .addClass("alert-" + kind)
      .text(message);
  }

  function staffError(message) {
    $("#staffCreateError")
      .removeClass("d-none")
      .text(message);
  }

  function syncStaffAccess() {
    const role = $("#staff_role").val();
    const canAccessAll = ["OWNER", "MANAGER"].includes(role);

    $("#staff_storeAccess option[value='ALL']")
      .prop("disabled", !canAccessAll);

    if (!canAccessAll) {
      $("#staff_storeAccess").val("ASSIGNED");
    }

    const all = $("#staff_storeAccess").val() === "ALL";

    $("#staffAssignedGroup").toggle(!all);
    $("#staff_storeIds").prop("disabled", all);

    const assigned = $("#staff_storeIds").val() || [];
    const previous = $("#staff_defaultStoreId").val();

    const permittedStores = all
      ? staffStores
      : staffStores.filter(function (store) {
          return assigned.includes(store._id);
        });

    const select = $("#staff_defaultStoreId").empty();

    select.append(new Option("No default store", ""));

    permittedStores.forEach(function (store) {
      select.append(
        new Option(store.code + " — " + store.name, store._id)
      );
    });

    if (
      permittedStores.some(function (store) {
        return store._id === previous;
      })
    ) {
      select.val(previous);
    }
  }

  function renderStaff(list) {
    const body = $("#staffTableBody").empty();

    if (!list.length) {
      const row = $("<tr>");

      row.append(
        $("<td>")
          .attr("colspan", 4)
          .addClass("text-muted")
          .text("No staff accounts yet. Create the Owner first.")
      );

      body.append(row);
      return;
    }

    list.forEach(function (membership) {
      const user = membership.userId;
      const row = $("<tr>");
      const identity = $("<td>");

      identity.append(
        $("<strong>").text(user ? user.name : "User unavailable"),
        $("<div>").text(user ? user.email : "")
      );

      if (user && user.mustChangePassword) {
        identity.append(
          $("<small>")
            .addClass("text-muted")
            .text("First-login password change required")
        );
      }

      const assignedStores = (membership.storeIds || [])
        .filter(Boolean)
        .map(function (store) {
          return (
            store.code +
            (store.isActive === false ? " (Inactive)" : "")
          );
        })
        .join(", ");

      const active =
        membership.isActive && user && user.is_active;

      row.append(
        identity,
        $("<td>").text(membership.role),
        $("<td>").text(
          membership.storeAccess === "ALL"
            ? "All business stores"
            : assignedStores || "No stores assigned"
        ),
        $("<td>").text(
          active ? "Active" : "Inactive / unavailable"
        )
      );

      body.append(row);
    });
  }

  async function loadStaffSetup() {
    if (!staffBusiness || staffSaving) return;

    const business = staffBusiness;
    const request = ++staffRequest;

    staffReady = false;

    $("#btnCreateStaff").prop("disabled", true);
    $("#staffRetry").addClass("d-none");
    $("#staffTableBody").empty();

    staffMessage("Loading stores and staff...", "info");

    try {
      const results = await Promise.all([
        allPages(
          STORES_API +
            "?businessId=" +
            encodeURIComponent(business._id) +
            "&isActive=true"
        ),
        allPages(
          BUSINESS_API + "/" + business._id + "/staff"
        ),
      ]);

      if (
        request !== staffRequest ||
        !staffBusiness ||
        staffBusiness._id !== business._id
      ) {
        return;
      }

      staffStores = results[0];

      const select = $("#staff_storeIds").empty();

      staffStores.forEach(function (store) {
        select.append(
          new Option(store.code + " — " + store.name, store._id)
        );
      });

      syncStaffAccess();
      renderStaff(results[1]);

      if (!business.isActive) {
        staffMessage(
          "This workspace is inactive. Staff creation is disabled.",
          "warning"
        );
        return;
      }

      staffReady = true;
      $("#btnCreateStaff").prop("disabled", false);

      staffMessage(
        staffStores.length
          ? "Create individual accounts and assign their store access."
          : "No active stores are linked. An Owner or Manager can be created for setup, but assigned store access remains empty.",
        staffStores.length ? "info" : "warning"
      );
    } catch (error) {
      if (request !== staffRequest) return;

      staffMessage(error.message, "danger");
      $("#staffRetry").removeClass("d-none");
    }
  }

  function openStaff(businessId) {
    if (staffSaving) return;

    const business = businessFor(businessId);

    if (!business || business.businessType !== "PARTY") {
      showError("Select a buying-party workspace.");
      return;
    }

    staffBusiness = business;
    staffStores = [];
    staffReady = false;

    document.getElementById("staffCreateForm").reset();

    $("#staff_role").val("OWNER");
    $("#staff_storeAccess").val("ASSIGNED");

    $("#staff_storeIds, #staff_defaultStoreId").empty();
    $("#staffCreateError").addClass("d-none").text("");

    $("#staffBusinessName").text(business.name);
    $("#staffWorkspaceCode").text(business.code);

    $("#modalBusinessStaff").modal("show");
    loadStaffSetup();
  }

  async function createStaff(form) {
    if (
      staffSaving ||
      !staffReady ||
      !staffBusiness ||
      !form.reportValidity()
    ) {
      return;
    }

    $("#staffCreateError").addClass("d-none").text("");

    const access = $("#staff_storeAccess").val();
    const role = $("#staff_role").val();

    const storeIds =
      access === "ALL"
        ? []
        : $("#staff_storeIds").val() || [];

    const password = str($("#staff_password").val());
    const name = str($("#staff_name").val()).trim();

    if (!name) {
      staffError("Staff name is required.");
      return;
    }

    if (
      password.length < 10 ||
      new TextEncoder().encode(password).length > 72 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      staffError(
        "Use at least 10 characters with a letter and a number. " +
          "Maximum length is 72 UTF-8 bytes."
      );
      return;
    }

    if (
      access === "ASSIGNED" &&
      !storeIds.length &&
      !["OWNER", "MANAGER"].includes(role)
    ) {
      staffError(
        "Assign at least one store to this staff member."
      );
      return;
    }

    const payload = {
      name,
      email: str($("#staff_email").val()).trim().toLowerCase(),
      phone: str($("#staff_phone").val()).trim(),
      role,
      storeAccess: access,
      storeIds,
      defaultStoreId:
        $("#staff_defaultStoreId").val() || null,
      temporaryPassword: password,
    };

    const businessId = staffBusiness._id;
    const button = $("#btnCreateStaff");

    const dismiss = $("#modalBusinessStaff").find(
      '[data-dismiss="modal"]'
    );

    staffSaving = true;

    button.prop("disabled", true).text("Creating...");
    dismiss.prop("disabled", true);

    let saved = false;

    try {
      await api(
        BUSINESS_API + "/" + businessId + "/staff",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      saved = true;

      form.reset();
      $("#staff_password").val("");
      $("#staff_role").val("OWNER");
      $("#staff_storeAccess").val("ASSIGNED");

      success("Staff login created");
    } catch (error) {
      staffError(error.message);
    } finally {
      staffSaving = false;

      button.text("Create Staff Login");
      dismiss.prop("disabled", false);

      if (!saved) {
        button.prop("disabled", !staffReady);
      }
    }

    if (saved) {
      await loadStaffSetup();
    }
  }

  // --------------------------------------------------
  // Events
  // --------------------------------------------------

  function bindEvents() {
    $("#generalSearch").on("input", function () {
      table.search(this.value, false, true).draw();
    });

    $("#modalStoreCreate").on(
      "show.bs.modal",
      function (event) {
        if (!dataReady) {
          event.preventDefault();

          showError(
            "Store and workspace data has not loaded. Refresh the page and try again."
          );
          return;
        }

        document.getElementById("storeCreateForm").reset();

        populateBusinesses(
          "#store_businessId",
          "",
          false
        );
      }
    );

    $("#storeCreateForm").on("submit", function (event) {
      event.preventDefault();
      saveStore(this, false);
    });

    $("#storeEditForm").on("submit", function (event) {
      event.preventDefault();
      saveStore(this, true);
    });

    $("#modalStoreCreate, #modalStoreEdit").on(
      "hide.bs.modal",
      function (event) {
        const form = this.querySelector("form");

        if (form && savingForms.has(form.id)) {
          event.preventDefault();
        }
      }
    );

    $("#storesTable").on(
      "click",
      ".btn-edit",
      function () {
        const id = $(this).attr("data-id");

        if (validId(id)) {
          openEdit(id);
        }
      }
    );

    $("#storesTable").on(
      "click",
      ".btn-delete",
      function () {
        const button = $(this);
        const id = button.attr("data-id");

        if (validId(id) && !button.prop("disabled")) {
          deactivateStore(id, button);
        }
      }
    );

    $("#storesTable").on(
      "click",
      ".btn-staff",
      function () {
        openStaff($(this).attr("data-business-id"));
      }
    );

    $(
      "#staff_role, #staff_storeAccess, #staff_storeIds"
    ).on("change", syncStaffAccess);

    $("#staffCreateForm").on("submit", function (event) {
      event.preventDefault();
      createStaff(this);
    });

    $("#staffRetry").on("click", function () {
      loadStaffSetup();
    });

    $("#modalBusinessStaff")
      .on("hide.bs.modal", function (event) {
        if (staffSaving) {
          event.preventDefault();
        }
      })
      .on("hidden.bs.modal", function () {
        staffRequest += 1;
        staffBusiness = null;
        staffStores = [];
        staffReady = false;

        document.getElementById("staffCreateForm").reset();

        $("#staff_password").val("");
        $("#btnCreateStaff").prop("disabled", true);
        $("#staffCreateError").addClass("d-none").text("");
      });
  }

  // --------------------------------------------------
  // Initialise
  // --------------------------------------------------

  $(function () {
    initTable();
    bindEvents();
    refreshTable();
  });
})();