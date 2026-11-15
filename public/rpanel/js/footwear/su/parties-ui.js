/* global $, Swal */

(function () {
  "use strict";

  const API = "/apis/footwears/parties";
  const MAX_RECORDS = 200;

  const TEXT_FIELDS = [
    "name",
    "phone",
    "whatsapp",
    "address",
    "city",
    "area",
    "gstin",
    "notes",
  ];

  let table;
  let parties = [];
  let loaded = false;
  let loading = false;
  let refreshPending = false;
  let possiblyTruncated = false;

  let workspacePartyId = "";
  let workspaceRequest = 0;
  let workspaceSaving = false;

  let editRequest = 0;

  const savingForms = new Set();

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

  function normalizeParty(party) {
    return {
      ...party,
      ownershipType: party.ownershipType || "INDEPENDENT_BUYER",
      posEnabled: party.posEnabled === true,
      isActive: party.isActive !== false,
    };
  }

  function pill(label, color) {
    return (
      '<span class="party-pill party-pill-' +
      color +
      '">' +
      escapeHtml(label) +
      "</span>"
    );
  }

  function notify(message) {
    return Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: message,
      timer: 2200,
      showConfirmButton: false,
    });
  }

  function showError(title, error) {
    return Swal.fire({
      icon: "error",
      title,
      text: error.message || "Something went wrong. Please try again.",
    });
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

    const contentType = (
      response.headers.get("content-type") || ""
    ).toLowerCase();

    if (
      response.redirected ||
      !contentType.includes("application/json")
    ) {
      throw new Error(
        "Your session may have expired. Refresh the page and sign in again."
      );
    }

    let result;

    try {
      result = await response.json();
    } catch (error) {
      throw new Error("The server returned an invalid response.");
    }

    if (
      !result ||
      typeof result !== "object" ||
      Array.isArray(result)
    ) {
      throw new Error("The server returned an invalid response.");
    }

    // Older authentication middleware can return this with HTTP 200.
    if (result.redirect) {
      throw new Error(
        "Your session has expired. Please sign in again."
      );
    }

    if (!response.ok || result.ok === false) {
      const details = Array.isArray(result.errors)
        ? result.errors.filter(Boolean).join(". ")
        : "";

      throw new Error(
        details ||
          result.message ||
          result.error ||
          "The request could not be completed."
      );
    }

    return result;
  }

  // --------------------------------------------------
  // Party list and statistics
  // --------------------------------------------------

  function showListStatus(message, kind) {
    $("#partyLoadStatus")
      .removeClass(
        "d-none alert-info alert-success alert-warning alert-danger"
      )
      .addClass("alert-" + kind)
      .text(message);
  }

  function showListLimitWarning() {
    if (possiblyTruncated) {
      showListStatus(
        "The API limit was reached. Up to 200 active and 200 inactive " +
          "parties are loaded. Search, filters and counts cover loaded " +
          "records only. Server pagination is needed for the complete list.",
        "warning"
      );
    } else {
      $("#partyLoadStatus").addClass("d-none");
    }
  }

  function filteredParties() {
    const type = $("#partyTypeFilter").val() || "";
    const ownership = $("#ownershipFilter").val() || "";
    const pos = $("#posFilter").val() || "";
    const active = $("#activeFilter").val() || "true";

    return parties.filter(function (party) {
      if (type && party.partyType !== type) {
        return false;
      }

      if (ownership && party.ownershipType !== ownership) {
        return false;
      }

      if (pos !== "" && party.posEnabled !== (pos === "true")) {
        return false;
      }

      if (
        active !== "all" &&
        party.isActive !== (active === "true")
      ) {
        return false;
      }

      return true;
    });
  }

  function updateStats() {
    const rows = table
      .rows({ search: "applied" })
      .data()
      .toArray();

    $("#stat_total_parties").text(rows.length);

    $("#stat_total_customers").text(
      rows.filter(function (party) {
        return ["CUSTOMER", "BOTH"].includes(party.partyType);
      }).length
    );

    $("#stat_owned_outlets").text(
      rows.filter(function (party) {
        return party.ownershipType === "OWNED_OUTLET";
      }).length
    );

    $("#stat_pos_enabled").text(
      rows.filter(function (party) {
        return party.posEnabled;
      }).length
    );
  }

  function renderRows() {
    table.clear().rows.add(filteredParties()).draw();
  }

  async function refresh() {
    // Queue a fresh reload if a save completes during an existing load.
    if (loading) {
      refreshPending = true;
      return;
    }

    loading = true;

    $("#retryParties").addClass("d-none");
    $("#partiesTable").attr("aria-busy", "true");

    showListStatus("Loading parties...", "info");

    try {
      const results = await Promise.all([
        api(API + "?isActive=true&limit=" + MAX_RECORDS),
        api(API + "?isActive=false&limit=" + MAX_RECORDS),
      ]);

      if (
        results.some(function (result) {
          return !Array.isArray(result.data);
        })
      ) {
        throw new Error("The server returned an invalid party list.");
      }

      possiblyTruncated = results.some(function (result) {
        return result.data.length >= MAX_RECORDS;
      });

      const unique = new Map();

      results.forEach(function (result) {
        result.data.forEach(function (party) {
          if (party && validId(party._id)) {
            unique.set(party._id, normalizeParty(party));
          }
        });
      });

      parties = Array.from(unique.values());
      loaded = true;

      renderRows();
      showListLimitWarning();
    } catch (error) {
      const suffix = loaded
        ? " Previously loaded records may be outdated."
        : "";

      showListStatus(error.message + suffix, "danger");
      $("#retryParties").removeClass("d-none");
    } finally {
      loading = false;
      $("#partiesTable").attr("aria-busy", "false");

      if (refreshPending) {
        refreshPending = false;
        await refresh();
      }
    }
  }

  // --------------------------------------------------
  // Party forms
  // --------------------------------------------------

  function clearFormError(prefix) {
    $("#" + prefix + "error").addClass("d-none").text("");
  }

  function showFormError(prefix, message) {
    $("#" + prefix + "error")
      .removeClass("d-none")
      .text(message);
  }

  function syncPosSettings(prefix) {
    const partyType = $("#" + prefix + "partyType").val();
    const active = $("#" + prefix + "active").val() === "true";
    const supplierOnly = partyType === "SUPPLIER";

    const checkbox = $("#" + prefix + "posEnabled");
    const ownership = $("#" + prefix + "ownershipType");

    if (supplierOnly) {
      ownership.val("INDEPENDENT_BUYER");
    }

    ownership.prop("disabled", supplierOnly);

    const eligible = active && !supplierOnly;

    if (!eligible) {
      checkbox.prop("checked", false);
    }

    checkbox.prop("disabled", !eligible);

    let message = "Login requires workspace and staff account setup.";

    if (!active) {
      message = "Activate this party before enabling POS.";
    } else if (supplierOnly) {
      message =
        "POS is available to Customer and Customer & Supplier parties.";
    }

    $("#" + prefix + "posHelp").text(message);
  }

  function fillForm(prefix, party) {
    TEXT_FIELDS.forEach(function (field) {
      $("#" + prefix + field).val(party[field] || "");
    });

    $("#" + prefix + "id").val(party._id || "");
    $("#" + prefix + "partyType").val(
      party.partyType || "CUSTOMER"
    );
    $("#" + prefix + "ownershipType").val(
      party.ownershipType || "INDEPENDENT_BUYER"
    );
    $("#" + prefix + "active").val(
      String(party.isActive !== false)
    );
    $("#" + prefix + "posEnabled").prop(
      "checked",
      party.posEnabled === true
    );

    clearFormError(prefix);
    syncPosSettings(prefix);
  }

  function payloadFromForm(prefix) {
    const payload = {};

    TEXT_FIELDS.forEach(function (field) {
      payload[field] = str(
        $("#" + prefix + field).val()
      ).trim();
    });

    payload.partyType = $("#" + prefix + "partyType").val();
    payload.ownershipType = $(
      "#" + prefix + "ownershipType"
    ).val();
    payload.isActive =
      $("#" + prefix + "active").val() === "true";

    payload.posEnabled =
      !$("#" + prefix + "posEnabled").prop("disabled") &&
      $("#" + prefix + "posEnabled").prop("checked");

    return payload;
  }

  async function saveParty(form, prefix, editing) {
    if (savingForms.has(form.id)) {
      return;
    }

    if (!form.reportValidity()) {
      return;
    }

    clearFormError(prefix);

    const id = editing
      ? str($("#" + prefix + "id").val())
      : "";

    if (editing && !validId(id)) {
      showFormError(
        prefix,
        "Invalid party. Close this form and reopen it."
      );
      return;
    }

    const payload = payloadFromForm(prefix);

    if (!payload.name) {
      showFormError(prefix, "Party name is required.");
      return;
    }

    const submit = $(
      'button[form="' + form.id + '"][type="submit"]'
    );
    const modal = $(form).closest(".modal");
    const dismiss = modal.find('[data-dismiss="modal"]');
    const originalLabel = submit.text();

    savingForms.add(form.id);

    submit.prop("disabled", true).text("Saving...");
    dismiss.prop("disabled", true);

    let saved = false;

    try {
      await api(editing ? API + "/" + id : API, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });

      saved = true;
    } catch (error) {
      showFormError(prefix, error.message);
    } finally {
      savingForms.delete(form.id);
      submit.prop("disabled", false).text(originalLabel);
      dismiss.prop("disabled", false);
    }

    if (saved) {
      modal.modal("hide");
      notify(editing ? "Party updated" : "Party created");

      // A reload failure must not be presented as a failed save.
      await refresh();
    }
  }

  // --------------------------------------------------
  // Workspace popup
  // --------------------------------------------------

  function showWorkspaceMessage(message, kind) {
    $("#workspaceMessage")
      .removeClass(
        "alert-info alert-success alert-warning alert-danger"
      )
      .addClass("alert-" + kind)
      .text(message);
  }

  async function loadWorkspace() {
    const id = workspacePartyId;

    if (!validId(id) || workspaceSaving) {
      return;
    }

    const request = ++workspaceRequest;

    $("#createPartyWorkspace").prop("disabled", true);
    $("#retryWorkspace").addClass("d-none");

    $(
      "#workspacePartyName, #workspaceOwnership, " +
        "#workspaceStatus, #workspaceCode"
    ).text("—");

    showWorkspaceMessage("Loading workspace...", "info");

    try {
      const result = await api(API + "/" + id + "/workspace");

      if (
        request !== workspaceRequest ||
        id !== workspacePartyId
      ) {
        return;
      }

      const data = result.data;

      if (
        !data ||
        !data.party ||
        str(data.party._id).toLowerCase() !== id.toLowerCase()
      ) {
        throw new Error(
          "The server returned invalid workspace information."
        );
      }

      const party = data.party;
      const business = data.business || null;

      if (business && !validId(business._id)) {
        throw new Error(
          "The server returned an invalid business workspace."
        );
      }

      const statusLabels = {
        NOT_CREATED: "Not Created",
        ACTIVE: "Active",
        INACTIVE: "Inactive",
        NEEDS_REVIEW: "Needs Review",
      };

      const ownership =
        party.ownershipType === "OWNED_OUTLET"
          ? "Our Owned Outlet"
          : "Independent Buyer";

      $("#workspacePartyName").text(party.name || "—");
      $("#workspaceOwnership").text(
        party.partyType === "SUPPLIER"
          ? "Not applicable"
          : ownership
      );
      $("#workspaceStatus").text(
        statusLabels[data.status] || "Unknown"
      );
      $("#workspaceCode").text(
        business ? business.code || "—" : "—"
      );

      if (data.needsReview) {
        showWorkspaceMessage(
          "The workspace link or ownership needs administrator review.",
          "warning"
        );
      } else if (business) {
        showWorkspaceMessage(
          business.isActive
            ? "Workspace created. Store linking and staff login setup are next."
            : "This workspace is inactive. Reactivation is a separate action.",
          business.isActive ? "success" : "warning"
        );
      } else if (!party.isActive) {
        showWorkspaceMessage(
          "Edit this party and activate it before creating a workspace.",
          "warning"
        );
      } else if (
        !["CUSTOMER", "BOTH"].includes(party.partyType)
      ) {
        showWorkspaceMessage(
          "Only buying parties can have a POS workspace.",
          "warning"
        );
      } else if (!party.posEnabled) {
        showWorkspaceMessage(
          "Edit this party and enable POS before creating its workspace.",
          "warning"
        );
      } else {
        showWorkspaceMessage(
          "This party is ready. Create its workspace to continue setup.",
          "info"
        );
      }

      const canCreate =
        data.canCreate === true &&
        data.status === "NOT_CREATED" &&
        !business &&
        !data.needsReview;

      $("#createPartyWorkspace").prop("disabled", !canCreate);
    } catch (error) {
      if (
        request !== workspaceRequest ||
        id !== workspacePartyId
      ) {
        return;
      }

      $("#workspaceStatus").text("Could not load");
      showWorkspaceMessage(error.message, "danger");
      $("#retryWorkspace").removeClass("d-none");
    }
  }

  async function createWorkspace() {
    const button = $("#createPartyWorkspace");

    if (
      workspaceSaving ||
      !validId(workspacePartyId) ||
      button.prop("disabled")
    ) {
      return;
    }

    const id = workspacePartyId;
    const dismiss = $("#modalPartyWorkspace").find(
      '[data-dismiss="modal"]'
    );

    workspaceSaving = true;

    // Invalidate any earlier status response.
    workspaceRequest += 1;

    button.prop("disabled", true).text("Creating...");
    dismiss.prop("disabled", true);
    $("#retryWorkspace").addClass("d-none");

    showWorkspaceMessage("Creating workspace...", "info");

    let succeeded = false;

    try {
      const result = await api(API + "/" + id + "/workspace", {
        method: "POST",
        body: JSON.stringify({}),
      });

      succeeded = true;
      notify(result.message || "Workspace created");
    } catch (error) {
      showWorkspaceMessage(
        error.message +
          " Reload workspace status before attempting creation again.",
        "danger"
      );

      $("#retryWorkspace").removeClass("d-none");
    } finally {
      workspaceSaving = false;
      button.text("Create Workspace");
      dismiss.prop("disabled", false);
    }

    if (succeeded) {
      await loadWorkspace();
      await refresh();
    }
  }

  // --------------------------------------------------
  // DataTable
  // --------------------------------------------------

  function initTable() {
    table = $("#partiesTable").DataTable({
      responsive: false,
      scrollX: true,
      pageLength: 25,
      lengthMenu: [10, 25, 50, 100],
      dom: "rt<'row mt-3'<'col-md-4'l><'col-md-4'i><'col-md-4'p>>",
      order: [[0, "asc"]],
      data: [],
      language: {
        emptyTable: "No parties to display.",
        zeroRecords: "No parties match your search.",
      },
      columns: [
        {
          data: "name",
          render: function (value, type, row) {
            if (type !== "display") {
              return str(value) + " " + str(row.gstin);
            }

            return (
              '<div class="party-name-main">' +
              escapeHtml(value) +
              "</div>" +
              '<div class="party-name-sub">' +
              (row.gstin
                ? "GSTIN: " + escapeHtml(row.gstin)
                : "No GSTIN") +
              "</div>"
            );
          },
        },
        {
          data: "partyType",
          render: function (value, type) {
            if (type !== "display") {
              return str(value);
            }

            if (value === "CUSTOMER") {
              return pill("Customer", "green");
            }

            if (value === "SUPPLIER") {
              return pill("Supplier", "blue");
            }

            if (value === "BOTH") {
              return pill("Both", "amber");
            }

            return pill("Unknown", "gray");
          },
        },
        {
          data: "ownershipType",
          render: function (value, type, row) {
            const label =
              row.partyType === "SUPPLIER"
                ? "—"
                : value === "OWNED_OUTLET"
                  ? "Owned Outlet"
                  : "Independent Buyer";

            if (type !== "display") {
              return label;
            }

            return pill(
              label,
              row.partyType !== "SUPPLIER" &&
                value === "OWNED_OUTLET"
                ? "blue"
                : "gray"
            );
          },
        },
        {
          data: null,
          render: function (value, type, row) {
            const phone = str(row.phone);
            const whatsapp = str(row.whatsapp);

            if (type !== "display") {
              return phone + " " + whatsapp;
            }

            return (
              "<div>" +
              escapeHtml(phone || "—") +
              "</div>" +
              (whatsapp
                ? '<div class="party-name-sub">WhatsApp: ' +
                  escapeHtml(whatsapp) +
                  "</div>"
                : "")
            );
          },
        },
        {
          data: null,
          render: function (value, type, row) {
            const location = [row.area, row.city]
              .filter(Boolean)
              .join(", ");

            if (type !== "display") {
              return str(row.address) + " " + location;
            }

            return (
              "<div>" +
              escapeHtml(location || "—") +
              "</div>" +
              '<div class="party-name-sub">' +
              escapeHtml(row.address) +
              "</div>"
            );
          },
        },
        {
          data: "posEnabled",
          render: function (value, type) {
            if (type !== "display") {
              return value ? "Enabled" : "Disabled";
            }

            return (
              pill(
                value ? "Enabled" : "Disabled",
                value ? "green" : "gray"
              ) +
              (value
                ? '<div class="party-name-sub">Login setup is separate</div>'
                : "")
            );
          },
        },
        {
          data: "isActive",
          render: function (value, type) {
            const label = value ? "Active" : "Inactive";

            return type === "display"
              ? pill(label, value ? "green" : "red")
              : label;
          },
        },
        {
          data: "_id",
          orderable: false,
          searchable: false,
          render: function (id, type, row) {
            if (type !== "display") {
              return "";
            }

            const accountUrl =
              "/su/footwear/parties/" +
              encodeURIComponent(id);

            const escapedId = escapeHtml(id);

            return (
              '<div class="party-actions">' +
              '<a class="btn btn-sm btn-outline-brand" href="' +
              accountUrl +
              '">Account</a>' +
              '<button type="button" ' +
              'class="btn btn-sm btn-outline-brand workspace" ' +
              'data-id="' +
              escapedId +
              '">Workspace</button>' +
              '<button type="button" ' +
              'class="btn btn-sm btn-outline-primary edit" ' +
              'data-id="' +
              escapedId +
              '">Edit</button>' +
              (row.isActive
                ? '<button type="button" ' +
                  'class="btn btn-sm btn-outline-danger del" ' +
                  'data-id="' +
                  escapedId +
                  '">Deactivate</button>'
                : "") +
              "</div>"
            );
          },
        },
      ],
    });

    table.on("draw", function () {
      if (loaded) {
        updateStats();
      }
    });
  }

  // --------------------------------------------------
  // Event handlers
  // --------------------------------------------------

  function bindEvents() {
    $("#generalSearch").on("input", function () {
      table.search(this.value, false, true).draw();
    });

    $(
      "#partyTypeFilter, #ownershipFilter, #posFilter, #activeFilter"
    ).on("change", renderRows);

    $("#resetFilters").on("click", function () {
      $("#generalSearch").val("");
      $("#partyTypeFilter, #ownershipFilter, #posFilter").val("");
      $("#activeFilter").val("true");

      table.search("");
      renderRows();
    });

    $("#retryParties").on("click", function () {
      refresh();
    });

    ["party_", "edit_party_"].forEach(function (prefix) {
      $(
        "#" + prefix + "partyType, #" + prefix + "active"
      ).on("change", function () {
        syncPosSettings(prefix);
      });
    });

    $("#modalPartyCreate").on("show.bs.modal", function () {
      const form = document.getElementById("partyCreateForm");

      if (form) {
        form.reset();
      }

      fillForm("party_", {});
    });

    $("#modalPartyCreate, #modalPartyEdit")
      .on("hide.bs.modal", function (event) {
        const form = this.querySelector("form");

        if (form && savingForms.has(form.id)) {
          event.preventDefault();
        }
      })
      .on("shown.bs.modal", function () {
        $(this).find('input[name="name"]').trigger("focus");
      });

    $("#partyCreateForm").on("submit", function (event) {
      event.preventDefault();
      saveParty(this, "party_", false);
    });

    $("#partyEditForm").on("submit", function (event) {
      event.preventDefault();
      saveParty(this, "edit_party_", true);
    });

    // Edit party.
    $("#partiesTable").on("click", ".edit", async function () {
      const button = $(this);
      const id = button.attr("data-id");

      if (!validId(id) || button.prop("disabled")) {
        return;
      }

      const request = ++editRequest;
      button.prop("disabled", true);

      try {
        const result = await api(API + "/" + id);

        if (request !== editRequest) {
          return;
        }

        if (
          !result.data ||
          str(result.data._id).toLowerCase() !== id.toLowerCase()
        ) {
          throw new Error("The server returned an invalid party.");
        }

        fillForm(
          "edit_party_",
          normalizeParty(result.data)
        );

        $("#modalPartyEdit").modal("show");
      } catch (error) {
        if (request === editRequest) {
          showError("Could not open party", error);
        }
      } finally {
        button.prop("disabled", false);
      }
    });

    // Deactivate party.
    $("#partiesTable").on("click", ".del", async function () {
      const button = $(this);
      const id = button.attr("data-id");

      if (!validId(id) || button.prop("disabled")) {
        return;
      }

      const party = parties.find(function (item) {
        return item._id === id;
      });

      button.prop("disabled", true);

      try {
        const confirmation = await Swal.fire({
          icon: "warning",
          title: "Deactivate party?",
          text:
            str(party && party.name) +
            " will become inactive and its POS setting will be disabled. " +
            "Existing account records will be retained.",
          showCancelButton: true,
          confirmButtonText: "Deactivate",
          confirmButtonColor: "#c0394b",
        });

        if (!confirmation.isConfirmed) {
          return;
        }

        await api(API + "/" + id, {
          method: "DELETE",
        });

        notify("Party deactivated");
        await refresh();
      } catch (error) {
        showError("Could not deactivate party", error);
      } finally {
        button.prop("disabled", false);
      }
    });

    // Open workspace popup.
    $("#partiesTable").on("click", ".workspace", function () {
      if (workspaceSaving) {
        return;
      }

      const id = $(this).attr("data-id");

      if (!validId(id)) {
        return;
      }

      if (!$("#modalPartyWorkspace").length) {
        showError(
          "Workspace popup missing",
          new Error(
            "Add the workspace modal to parties.pug before using this action."
          )
        );
        return;
      }

      workspacePartyId = id;

      $("#modalPartyWorkspace").modal("show");
      loadWorkspace();
    });

    $("#retryWorkspace").on("click", function () {
      loadWorkspace();
    });

    $("#createPartyWorkspace").on("click", function () {
      createWorkspace();
    });

    $("#modalPartyWorkspace")
      .on("hide.bs.modal", function (event) {
        if (workspaceSaving) {
          event.preventDefault();
        }
      })
      .on("hidden.bs.modal", function () {
        workspacePartyId = "";
        workspaceRequest += 1;

        $("#createPartyWorkspace")
          .prop("disabled", true)
          .text("Create Workspace");

        $("#retryWorkspace").addClass("d-none");
      });
  }

  // --------------------------------------------------
  // Initialise
  // --------------------------------------------------

  $(function () {
    initTable();
    bindEvents();
    refresh();
  });
})();