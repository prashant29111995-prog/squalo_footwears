/* global $, Swal */

(function () {
  const API = "/apis/footwears/parties";

  let table;

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
    Swal.fire({
      icon: "success",
      title: msg,
      timer: 1200,
      showConfirmButton: false,
    });
  }

  function safe(v) {
    return v === null || v === undefined ? "" : String(v);
  }

  function badgePartyType(v) {
    const value = safe(v).toUpperCase();

    if (value === "SUPPLIER") {
      return '<span class="kt-badge kt-badge--inline kt-badge--info">SUPPLIER</span>';
    }

    if (value === "CUSTOMER") {
      return '<span class="kt-badge kt-badge--inline kt-badge--success">CUSTOMER</span>';
    }

    if (value === "BOTH") {
      return '<span class="kt-badge kt-badge--inline kt-badge--warning">BOTH</span>';
    }

    return safe(v);
  }

  function badgeActive(v) {
    return v
      ? '<span class="kt-badge kt-badge--inline kt-badge--success">Yes</span>'
      : '<span class="kt-badge kt-badge--inline kt-badge--danger">No</span>';
  }

  function mapRow(p) {
  return {
    _id: p._id,

    name: `
      <div>
        <div class="party-name-main">${safe(p.name)}</div>
        ${
          p.gstin
            ? `<div class="party-name-sub">GSTIN: ${safe(p.gstin)}</div>`
            : `<div class="party-name-sub">No GSTIN</div>`
        }
      </div>
    `,

    partyType: badgePartyType(p.partyType),
    phone: safe(p.phone),
    address: safe(p.address),
    isActive: badgeActive(!!p.isActive),

    actions: `
      <div class="party-actions">

        <a
          class="btn btn-icon btn-outline-brand"
          href="/su/footwear/parties/${p._id}"
          title="Open Account">
          <i class="la la-book"></i>
        </a>

        <button
          class="btn btn-icon btn-outline-success payment"
          data-id="${p._id}"
          data-name="${safe(p.name)}"
          title="Add Payment">
          <i class="la la-money"></i>
        </button>

        <button
          class="btn btn-icon btn-outline-primary edit"
          data-id="${p._id}"
          title="Edit">
          <i class="la la-edit"></i>
        </button>

        <button
          class="btn btn-icon btn-outline-danger del"
          data-id="${p._id}"
          title="Deactivate">
          <i class="la la-trash"></i>
        </button>

      </div>
    `,
  };
}

  function buildListUrl() {
    const params = new URLSearchParams();

    const partyType = $("#partyTypeFilter").val();
    const active = $("#activeFilter").val();

    if (partyType) params.set("partyType", partyType);
    if (active && active !== "all") params.set("isActive", active);

    const qs = params.toString();
    return qs ? `${API}?${qs}` : API;
  }

  async function refresh() {
    const url = buildListUrl();
    const r = await api(url);
    const list = r.data || [];
    const mapped = list.map(mapRow);

table.clear().rows.add(mapped).draw();

updateStats(list);
  }

function updateStats(list = []) {
  const total = list.length;

  const customers = list.filter(
    (x) =>
      safe(x.partyType).toUpperCase() === "CUSTOMER"
  ).length;

  const suppliers = list.filter(
    (x) =>
      safe(x.partyType).toUpperCase() === "SUPPLIER"
  ).length;

  const inactive = list.filter(
    (x) => x.isActive === false
  ).length;

  $("#stat_total_parties").text(total);
  $("#stat_total_customers").text(customers);
  $("#stat_total_suppliers").text(suppliers);
  $("#stat_inactive").text(inactive);
}

  function initTable() {
    table = $("#partiesTable").DataTable({
      responsive: true,
      pageLength: 25,
      data: [],
      columns: [
        { data: "name" },
        { data: "partyType" },
        { data: "phone" },
        { data: "address" },
        { data: "isActive" },
        { data: "actions", orderable: false, searchable: false },
      ],
    });

    $("#generalSearch").on("keyup", function () {
      table.search(this.value).draw();
    });
    $("#partiesTable").on("click", ".payment", async function () {
  const id = $(this).data("id");
  const name = $(this).data("name");

  Swal.fire({
    icon: "info",
    title: "Coming Soon",
    text: `Quick payment for ${name} will open here.`,
  });
});
    $("#partyTypeFilter, #activeFilter").on("change", async function () {
      await refresh();
    });

    $("#resetFilters").on("click", async function () {
      $("#generalSearch").val("");
      $("#partyTypeFilter").val("");
      $("#activeFilter").val("true");
      table.search("").draw();
      await refresh();
    });

    $("#partiesTable tbody").on("click", "tr", function (e) {
      if ($(e.target).closest("button").length) return;
      const row = table.row(this).data();
      if (!row?._id) return;
      window.location.href = `/su/footwear/parties/${row._id}`;
    });

    $("#partiesTable").on("click", ".ledger", function () {
      const id = $(this).data("id");
      window.location.href = `/su/footwear/parties/${id}`;
    });

    $("#partiesTable").on("click", ".edit", async function () {
      const id = $(this).data("id");

      try {
        const r = await api(`${API}/${id}`);
        const p = r.data || r;

        $("#edit_party_id").val(p._id || "");
        $("#edit_party_name").val(p.name || "");
        $("#edit_party_partyType").val(p.partyType || "CUSTOMER");
        $("#edit_party_phone").val(p.phone || "");
        $("#edit_party_address").val(p.address || "");
        $("#edit_party_gstin").val(p.gstin || "");
        $("#edit_party_active").val(String(p.isActive !== false));

        $("#modalPartyEdit").modal("show");
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    });

    $("#partiesTable").on("click", ".del", async function () {
      const id = $(this).data("id");

      const result = await Swal.fire({
        title: "Deactivate this party?",
        text: "This will mark the party as inactive.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, deactivate",
      });

      if (!result.isConfirmed) return;

      try {
        await api(`${API}/${id}`, { method: "DELETE" });
        toast("Party deactivated");
        await refresh();
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    });
  }

  $(document).on("submit", "#partyCreateForm", async function (e) {
    e.preventDefault();

    try {
      const payload = {
        name: $("#party_name").val(),
        partyType: $("#party_partyType").val(),
        phone: $("#party_phone").val() || "",
        address: $("#party_address").val() || "",
        gstin: $("#party_gstin").val() || "",
      };

      await api(API, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      $("#modalPartyCreate").modal("hide");
      this.reset();
      $("#party_partyType").val("CUSTOMER");

      toast("Party created");
      await refresh();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  });

  $(document).on("submit", "#partyEditForm", async function (e) {
    e.preventDefault();

    try {
      const id = $("#edit_party_id").val();

      const payload = {
        name: $("#edit_party_name").val(),
        partyType: $("#edit_party_partyType").val(),
        phone: $("#edit_party_phone").val() || "",
        address: $("#edit_party_address").val() || "",
        gstin: $("#edit_party_gstin").val() || "",
        isActive: $("#edit_party_active").val() === "true",
      };

      await api(`${API}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      $("#modalPartyEdit").modal("hide");
      toast("Party updated");
      await refresh();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  });

  $(async function () {
    initTable();
    await refresh();
  });
})();