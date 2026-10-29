/* global $, Swal */

(function () {
  const API = "/apis/footwears/stockin";
  const PARTY_API = "/apis/footwears/parties?partyType=SUPPLIER";
  const STORE_API = "/apis/footwears/stores";
  const ARTICLE_API = "/apis/footwears/articles";
  const CATEGORY_API = "/apis/footwears/articles/categories";

  let table;
  let currentLines = [];
  let scannedLines = [];

  async function api(url, opt = {}) {
    const r = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...opt,
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.message || "API error");
    return j;
  }

  async function apiWithTimeout(url, opt = {}, timeoutMs = 300000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const r = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      ...opt,
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.message || "API error");

    return j;
  } finally {
    clearTimeout(timer);
  }
}
async function loadArticleColors(articleId) {
  const $select = $("#line_color_select");
  const $input = $("#line_color");
  const $help = $("#color_help");

  $select.prop("disabled", true);
  $select.empty().append(`<option value="">Loading colors...</option>`);
  $input.hide().val("");

  try {
    const r = await api(`${API}/article-colors/${articleId}`);
    const colors = r.data || [];

    $select.empty();

    if (colors.length) {
      $select.append(`<option value="">Select Existing Color</option>`);

      colors.forEach((c) => {
        $select.append(`<option value="${c}">${c}</option>`);
      });
    } else {
      $select.append(`<option value="">No existing color</option>`);
    }

    $select.append(`<option value="__ADD_NEW__">+ Add New Color</option>`);
    $select.prop("disabled", false);

    $help.text(colors.length ? `${colors.length} existing colors found.` : "No previous colors. Add new color.");
  } catch (err) {
    $select.empty().append(`<option value="">Failed to load colors</option>`);
    $select.prop("disabled", true);
    $help.text("Color load failed.");
  }
}
  async function uploadApi(url, formData) {
  const r = await fetch(url, {
    method: "POST",
    body: formData,
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message || "Upload API error");
  return j;
  }

  function safe(v) {
    return v === null || v === undefined ? "" : String(v);
  }

  function up(v) {
    return safe(v).trim().toUpperCase();
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function money(v) {
    return "₹" + num(v).toFixed(2);
  }

  function toast(msg) {
    Swal.fire({
      icon: "success",
      title: msg,
      timer: 1300,
      showConfirmButton: false,
    });
  }

  function formatDate(v) {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return safe(v);
    return d.toLocaleDateString("en-GB");
  }

  function toInputDate(v) {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function badgeStatus(v) {
    const value = up(v);

    if (value === "DRAFT") {
      return '<span class="kt-badge kt-badge--inline kt-badge--warning">DRAFT</span>';
    }

    if (value === "CONFIRMED") {
      return '<span class="kt-badge kt-badge--inline kt-badge--success">CONFIRMED</span>';
    }

    if (value === "CANCELLED") {
      return '<span class="kt-badge kt-badge--inline kt-badge--danger">CANCELLED</span>';
    }

    return safe(v);
  }

  function statusChip(v) {
    const value = up(v);

    if (value === "CONFIRMED") {
      return '<span class="bill-status-chip bill-status-confirmed">CONFIRMED</span>';
    }

    if (value === "CANCELLED") {
      return '<span class="bill-status-chip bill-status-cancelled">CANCELLED</span>';
    }

    return '<span class="bill-status-chip bill-status-draft">DRAFT</span>';
  }

function setCurrentMonthFilter() {
  const now = new Date();

  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  $("#fromDate").val(firstDay);
  $("#toDate").val(lastDay);
}


  function buildListUrl() {
    const params = new URLSearchParams();

    const status = $("#statusFilter").val();
    const from = $("#fromDate").val();
    const to = $("#toDate").val();

    if (status) params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const qs = params.toString();
    return qs ? `${API}?${qs}` : API;
  }

  function mapRow(b) {
    const status = up(b.status);
    const isDraft = status === "DRAFT";

    return {
      _id: b._id,
      billDate: formatDate(b.billDate),
      billNo: safe(b.billNo),
      supplierName: safe(b.supplierName),
      status: badgeStatus(b.status),
      totalQty: num(b.totalQty),
      totalLines: num(b.totalLines),
      amount: money(
        b?.totals?.netTotal ||
        b?.totals?.subTotal ||
        b?.totals?.purchaseTotal ||
        b?.totalAmount ||
        b?.billAmount ||
        b?.amount ||
        b?.totalPurchase ||
        0
      ),

      attachment: b.attachment
        ? `<a href="${b.attachment}" target="_blank" class="btn btn-sm btn-outline-info" title="View Bill File">
            <i class="la la-file-pdf-o"></i>
          </a>`
        : "-",
      actions: `
        <div class="btn-group btn-group-sm" role="group">
          <button class="btn btn-outline-brand lines" data-id="${b._id}" title="Open Lines">Lines</button>

          <button class="btn btn-outline-primary edit" data-id="${b._id}" title="Edit" ${!isDraft ? "disabled" : ""}>
            <i class="la la-edit"></i>
          </button>

          <button class="btn btn-outline-success confirm" data-id="${b._id}" title="Confirm" ${!isDraft ? "disabled" : ""}>
            <i class="la la-check"></i>
          </button>

          <button class="btn btn-outline-danger cancel" data-id="${b._id}" title="Cancel" ${!isDraft ? "disabled" : ""}>
            <i class="la la-close"></i>
          </button>
        </div>
      `,
    };
  }

  async function loadSuppliers(selectId, selected = "") {
    const r = await api(PARTY_API);
    const items = r.data || [];
    const $el = $(selectId);

    $el.html(
      '<option value="">Select Supplier</option>' +
        items.map((x) => `<option value="${x._id}">${safe(x.name)}</option>`).join("")
    );

    if (selected) $el.val(selected);
  }

  async function loadStores(selectId, selected = "") {
    try {
      const r = await api(STORE_API);
      const items = r.data || [];
      const $el = $(selectId);

      $el.html(
        '<option value="">Select Store</option>' +
          items
            .map((x) => `<option value="${x._id}">${safe(x.name || x.storeName || x.code)}</option>`)
            .join("")
      );

      if (selected) $el.val(selected);
    } catch (err) {
      $(selectId).html('<option value="">No Store API Found</option>');
    }
  }
let CATEGORY_MAP = {};

async function loadCategoriesForQuickArticle() {
  const r = await api(CATEGORY_API);
  CATEGORY_MAP = r.data || r || {};
}

function populateQuickArticleCategories(group) {
  const categories = CATEGORY_MAP[group] || [];

  $("#qa_category").html(
    `<option value="">Select Category</option>` +
      categories.map((x) => `<option value="${up(x)}">${up(x)}</option>`).join("")
  );
}

function getCurrentArticleSearchText() {
  const selected = $("#line_articleId").select2("data");
  if (selected && selected[0] && selected[0].text) {
    return selected[0].text;
  }

  const $search = $(".select2-container--open .select2-search__field");
  return $search.val() || "";
}

function selectArticleInLine(article) {
  const articleName = safe(article.articleName || article.name);
  const brand = safe(article.brand);
  const label = `${brand} - ${articleName}`;

  const option = new Option(label, article._id, true, true);
  $("#line_articleId").append(option).trigger("change");

  const selected = $("#line_articleId").select2("data");
  if (selected && selected[0]) {
    selected[0].brand = brand;
    selected[0].articleName = articleName;
  }

  $("#line_brand").val(brand);
  $("#line_articleName").val(articleName);
}
  async function fetchArticleById(articleId) {
    if (!articleId) return null;

    try {
      const r = await api(`${ARTICLE_API}/${articleId}`);
      return r.data || r;
    } catch (err) {
      return null;
    }
  }

  function resetLineForm() {
    const form = $("#lineForm")[0];
    if (form) form.reset();
$("#line_color_select")
  .prop("disabled", true)
  .empty()
  .append(`<option value="">Select Article First</option>`);

$("#line_color").hide().val("");
$("#color_help").text("Select existing color or add new.");
    $("#line_id").val("");
    $("#line_amount").val("0.00");
    $("#line_brand").val("");
    $("#line_articleName").val("");
    $("#lineSaveBtn").html('<i class="la la-plus"></i> Add Line');

    if ($("#line_articleId").hasClass("select2-hidden-accessible")) {
      $("#line_articleId").val(null).trigger("change");
    } else {
      $("#line_articleId").html('<option value="">Search Article</option>');
    }
  }

  function calculateLineAmount() {
  const qty = num($("#line_qty").val());
  const mrp = num($("#line_mrp").val());
  const discountPercent = num($("#line_discountPercent").val());

  const cost = mrp - (mrp * discountPercent) / 100;
  const amount = qty * cost;

  $("#line_cost").val(cost.toFixed(2));
  $("#line_amount").val(amount.toFixed(2));
}

  function initArticleSearch() {
    const $el = $("#line_articleId");

    if ($el.hasClass("select2-hidden-accessible")) {
      $el.select2("destroy");
    }

    $el.html('<option value="">Search Article</option>');

    $el.select2({
      width: "100%",
      dropdownParent: $("#modalBillLines"),
      placeholder: "Search article...",
      minimumInputLength: 1,
      ajax: {
        delay: 250,
        transport: async function (params, success, failure) {
          try {
            const term = (params.data && params.data.term) || "";
            const r = await api(`${ARTICLE_API}?q=${encodeURIComponent(term)}`);
            const items = r.data || [];

            success({
              results: items.map((x) => {
                const articleName = safe(x.articleName || x.name);
                const brand = safe(x.brand);

                return {
                  id: x._id,
                  text: `${brand} - ${articleName}`,
                  brand,
                  articleName,
                };
              }),
            });
          } catch (err) {
            failure(err);
          }
        },
        processResults: function (data) {
          return data;
        },
      },
    });
  }

  async function setSelectedArticle(articleId, fallbackLine = null) {
    if (!articleId) return;

    let article = await fetchArticleById(articleId);

    if (!article && fallbackLine) {
      article = {
        _id: fallbackLine.articleId,
        articleName: fallbackLine.articleName,
        brand: fallbackLine.brand,
      };
    }

    if (!article) return;

    const articleName = safe(article.articleName || article.name);
    const brand = safe(article.brand);

    const option = new Option(`${brand} - ${articleName}`, article._id, true, true);
    $("#line_articleId").append(option).trigger("change");

    const selected = $("#line_articleId").select2("data");
    if (selected && selected[0]) {
      selected[0].brand = brand;
      selected[0].articleName = articleName;
    }

    $("#line_brand").val(brand);
    $("#line_articleName").val(articleName);
  }

  function updateSummary(lines, status) {
    const totalQty = (lines || []).reduce((sum, x) => sum + num(x.qty), 0);
    const totalAmount = (lines || []).reduce((sum, x) => sum + num(x.amount), 0);

    $("#summary_status").replaceWith(`<span id="summary_status">${statusChip(status)}</span>`);
    $("#summary_total_qty").text(totalQty);
    $("#summary_total_lines").text((lines || []).length);
    $("#summary_total_amount").text(money(totalAmount));
  }

  function renderLinesTable(lines, status) {
  const isDraft = up(status) === "DRAFT";

  const html = (lines || [])
    .map((x, idx) => {
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${safe(x.articleName)}</td>
          <td>${safe(x.brand)}</td>
          <td>${safe(x.color)}</td>
          <td>${safe(x.qty)}</td>
          <td>${money(x.mrp)}</td>
          <td>${num(x.discountPercent).toFixed(2)}%</td>
          <td>${money(x.cost)}</td>
          <td>${money(x.amount)}</td>
          <td>${safe(x.remarks)}</td>
          <td>
            ${
              isDraft
                ? `
                  <button class="btn btn-sm btn-outline-primary line-edit" data-id="${x._id}" title="Edit">
                    <i class="la la-edit"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-danger line-del" data-id="${x._id}" title="Delete">
                    <i class="la la-trash"></i>
                  </button>
                `
                : "-"
            }
          </td>
        </tr>
      `;
    })
    .join("");

  $("#lineTable tbody").html(
    html || `<tr><td colspan="11" class="text-center text-muted">No lines added</td></tr>`
  );

  updateSummary(lines, status);
}

  function toggleLineControls(status) {
    const isDraft = up(status) === "DRAFT";

    $("#btnAddLine").prop("disabled", !isDraft);
    $("#btnConfirmBill").prop("disabled", !isDraft);
    $("#btnCancelBill").prop("disabled", !isDraft);

    // revert only for confirmed bills
    $("#btnRevertBill").prop("disabled", up(status) !== "CONFIRMED");

    $("#lineForm :input").prop("disabled", !isDraft);
    $("#btnQuickAddArticle").prop("disabled", !isDraft);

    if (!isDraft) {
      $("#lineSaveBtn").prop("disabled", true);
    }
  }
function updateStockInStats(list = []) {
  let totalAmount = 0;
  let totalQty = 0;
  let bills = 0;
  let confirmed = 0;
  let draft = 0;

  list.forEach((b) => {
    const status = up(b.status);

    if (status === "CANCELLED") return;

   totalAmount += num(
      b?.totals?.netTotal ||
      b?.totals?.subTotal ||
      b?.totals?.purchaseTotal ||
      b?.totalAmount ||
      b?.billAmount ||
      b?.amount ||
      b?.totalPurchase ||
      0
    );
    totalQty += num(b.totalQty);
    bills += 1;

    if (status === "CONFIRMED") confirmed += 1;
    if (status === "DRAFT") draft += 1;
  });

  $("#stat_month_amount").text(money(totalAmount));
  $("#stat_month_qty").text(totalQty);
  $("#stat_month_bills").text(bills);
  $("#stat_confirmed_bills").text(confirmed);
  $("#stat_draft_bills").text(draft);
}
  async function refresh() {
    const r = await api(buildListUrl());
    const list = r.data || [];

    table.clear().rows.add(list.map(mapRow)).draw();
updateStockInStats(list);
  }

  function initTable() {
    table = $("#stockInTable").DataTable({
      responsive: true,
      pageLength: 25,
      data: [],
     columns: [
      { data: "billDate" },
      { data: "billNo" },
      { data: "supplierName" },
      { data: "status" },
      { data: "totalQty" },
      { data: "totalLines" },
      { data: "amount" },
      { data: "attachment", orderable: false, searchable: false },
      { data: "actions", orderable: false, searchable: false },
    ],
    });

    $("#generalSearch").on("keyup", function () {
      table.search(this.value).draw();
    });

    $("#statusFilter, #fromDate, #toDate").on("change", async function () {
      await refresh();
    });

    $("#resetFilters").on("click", async function () {
      $("#generalSearch").val("");
      $("#statusFilter").val("");
      setCurrentMonthFilter();

      table.search("").draw();
      await refresh();
    });

    $("#stockInTable").on("click", ".edit", async function () {
      const id = $(this).data("id");

      try {
        await loadSuppliers("#edit_bill_supplierId");
        await loadStores("#edit_bill_storeId");

        const r = await api(`${API}/${id}`);
        const b = r.data || r;

        if (up(b.status) !== "DRAFT") {
          throw new Error("Only draft bills can be edited");
        }

        $("#edit_bill_id").val(b._id || "");
        $("#edit_bill_supplierId").val(b.supplierId || "");
        $("#edit_bill_billNo").val(b.billNo || "");
        $("#edit_bill_billDate").val(toInputDate(b.billDate));
        $("#edit_bill_storeId").val(b.storeId || "");
        $("#edit_bill_attachment").val(b.attachment || "");
$("#edit_bill_attachment_status").html(
  b.attachment
    ? `<a href="${b.attachment}" target="_blank">View current uploaded bill</a>`
    : "No file uploaded"
);
        $("#modalBillEdit").modal("show");
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    });

    $("#stockInTable").on("click", ".lines", async function () {
      await openLinesModal($(this).data("id"));
    });

    $("#stockInTable").on("click", ".confirm", async function () {
      await confirmBill($(this).data("id"));
    });

    $("#stockInTable").on("click", ".cancel", async function () {
      await cancelBill($(this).data("id"));
    });

    
  }
  function renderScanPreview(lines) {
    scannedLines = lines || [];

    const html = scannedLines
      .map((x, idx) => {
        return `
          <tr data-idx="${idx}">
            <td class="text-center">
              <input type="checkbox" class="scan-use" checked>
            </td>
            <td><input class="form-control scan-brand" value="${safe(x.brand)}"></td>
            <td><input class="form-control scan-articleName" value="${safe(x.articleName)}"></td>
            <td><input class="form-control scan-color" value="${safe(x.color)}"></td>
            <td><input type="number" class="form-control scan-qty" value="${num(x.qty)}"></td>
            <td><input type="number" class="form-control scan-mrp" value="${num(x.mrp)}"></td>
            <td><input type="number" class="form-control scan-discountPercent" value="${num(x.discountPercent)}"></td>
            <td><input type="number" class="form-control scan-cost" value="${num(x.cost)}"></td>
            <td><input type="number" class="form-control scan-amount" value="${num(x.amount)}"></td>
            <td><input class="form-control scan-remarks" value="${safe(x.remarks)}"></td>
          </tr>
        `;
      })
      .join("");

    $("#scanPreviewTable tbody").html(
      html || `<tr><td colspan="10" class="text-center text-muted">No scanned lines found</td></tr>`
    );
  }

  function collectScannedLines() {
    const lines = [];

    $("#scanPreviewTable tbody tr").each(function () {
      const $tr = $(this);

      if (!$tr.find(".scan-use").is(":checked")) return;

      lines.push({
        brand: up($tr.find(".scan-brand").val()),
        articleName: up($tr.find(".scan-articleName").val()),
        color: up($tr.find(".scan-color").val()),
        qty: Number($tr.find(".scan-qty").val()),
        mrp: Number($tr.find(".scan-mrp").val()),
        discountPercent: Number($tr.find(".scan-discountPercent").val()),
        cost: Number($tr.find(".scan-cost").val()),
        amount: Number($tr.find(".scan-amount").val()),
        remarks: $tr.find(".scan-remarks").val() || "",
      });
    });

    return lines;
  }
  async function openLinesModal(id) {
    try {
      const r = await api(`${API}/${id}`);
      const b = r.data || r;

      $("#lines_bill_id").val(b._id || "");
      $("#lines_bill_status").val(b.status || "");
      $("#lines_bill_title").text(`${safe(b.billNo)} / ${safe(b.supplierName)}`);

      currentLines = b.lines || [];

      resetLineForm();
      $("#line_bill_id").val(b._id || "");

      renderLinesTable(currentLines, b.status);
      toggleLineControls(b.status);
      initArticleSearch();

      $("#modalBillLines").modal("show");
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  }

  async function confirmBill(id) {
    const result = await Swal.fire({
      title: "Confirm this bill?",
      text: "Stock will be posted into ledger. Editing will stop after confirmation.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, confirm",
    });

    if (!result.isConfirmed) return;

    try {
      await api(`${API}/${id}/confirm`, { method: "PATCH" });
      toast("Bill confirmed");
      $("#modalBillLines").modal("hide");
      await refresh();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  }

  async function cancelBill(id) {
    const result = await Swal.fire({
      title: "Cancel this bill?",
      text: "This will mark the draft bill as cancelled.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, cancel",
    });

    if (!result.isConfirmed) return;

    try {
      await api(`${API}/${id}/cancel`, { method: "PATCH" });
      toast("Bill cancelled");
      $("#modalBillLines").modal("hide");
      await refresh();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  }

  function bindLineEvents() {

    $("#line_color_select").on("change", function () {
  const value = $(this).val();

  if (value === "__ADD_NEW__") {
    $("#line_color").show().val("").focus();
    $("#color_help").text("Type new color exactly. Example: WHT-BK, BLUSH, BLACK.");
    return;
  }

  $("#line_color").hide().val(value || "");
  $("#color_help").text(value ? `Selected color: ${value}` : "Select existing color or add new.");
});
    $("#btnAddLine").on("click", function () {
      const billId = $("#lines_bill_id").val();
      resetLineForm();
      $("#line_bill_id").val(billId);
      initArticleSearch();
    });

    $("#btnConfirmBill").on("click", async function () {
      const billId = $("#lines_bill_id").val();
      if (!billId) return;
      await confirmBill(billId);
    });

    $("#btnCancelBill").on("click", async function () {
      const billId = $("#lines_bill_id").val();
      if (!billId) return;
      await cancelBill(billId);
    });
$("#btnRevertBill").on("click", async function () {
  const billId = $("#lines_bill_id").val();
  const status = up($("#lines_bill_status").val());

  if (!billId) return;

  if (status !== "CONFIRMED") {
    return Swal.fire(
      "Not Allowed",
      "Only CONFIRMED bill can be reverted",
      "warning"
    );
  }

  const result = await Swal.fire({
    title: "Revert confirmed bill?",
    html: `
      <div style="text-align:left">
        <p>This will:</p>
        <ul>
          <li>Remove PURCHASE_IN stock ledger entries</li>
          <li>Move bill back to DRAFT</li>
          <li>Allow editing again</li>
        </ul>
      </div>
    `,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Yes, Revert",
    confirmButtonColor: "#ffb822",
  });

  if (!result.isConfirmed) return;

  try {
    Swal.fire({
      title: "Reverting Bill...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    await api(`${API}/${billId}/revert-confirmed`, {
      method: "PATCH",
    });

    Swal.close();

    toast("Bill reverted to draft");

    await openLinesModal(billId);
    await refresh();
  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
});
   $(document).on("change", "#line_articleId", async function () {
  const selected = $("#line_articleId").select2("data");
  const article = selected && selected[0] ? selected[0] : null;

  if (!article || !article.id) {
    $("#line_brand").val("");
    $("#line_articleName").val("");

    $("#line_color_select")
      .prop("disabled", true)
      .empty()
      .append(`<option value="">Select Article First</option>`);

    $("#line_color").hide().val("");
    $("#color_help").text("Select existing color or add new.");
    return;
  }

  $("#line_brand").val(article.brand || "");
  $("#line_articleName").val(article.articleName || "");

  await loadArticleColors(article.id);
});

    $("#btnQuickAddArticle").on("click", async function () {
  try {
    await loadCategoriesForQuickArticle();

    const searchText = up(getCurrentArticleSearchText());

    $("#quickArticleForm")[0].reset();
    $("#qa_category").html(`<option value="">Select Group First</option>`);

    $("#qa_brand").val(up($("#line_brand").val()));
    $("#qa_articleName").val(searchText);

    $("#modalQuickArticle").modal("show");

    setTimeout(() => {
      if (!$("#qa_brand").val()) $("#qa_brand").focus();
      else $("#qa_articleName").focus();
    }, 300);
  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
});
$("#qa_categoryGroup").on("change", function () {
  populateQuickArticleCategories(up($(this).val()));
});

$("#quickArticleForm").on("submit", async function (e) {
  e.preventDefault();

  const payload = {
    brand: up($("#qa_brand").val()),
    articleName: up($("#qa_articleName").val()),
    categoryGroup: up($("#qa_categoryGroup").val()),
    category: up($("#qa_category").val()),
    meta: {
      notes: $("#qa_notes").val() || "",
    },
  };

  if (!payload.brand) return Swal.fire("Error", "Brand required", "error");
  if (!payload.articleName) return Swal.fire("Error", "Article name required", "error");
  if (!payload.categoryGroup) return Swal.fire("Error", "Category group required", "error");
  if (!payload.category) return Swal.fire("Error", "Category required", "error");

  try {
    const r = await api(ARTICLE_API, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const article = r.data || r;

    selectArticleInLine(article);
    await loadArticleColors(article._id);

    $("#modalQuickArticle").modal("hide");
    toast("Article created and selected");
  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
});
    $("#line_qty, #line_mrp, #line_discountPercent").on("input", calculateLineAmount);

    $("#lineTable").on("click", ".line-edit", async function () {
      const lineId = $(this).data("id");
      const line = currentLines.find((x) => String(x._id) === String(lineId));
      if (!line) return;

      resetLineForm();
      initArticleSearch();

      $("#line_bill_id").val($("#lines_bill_id").val());
      $("#line_id").val(line._id || "");
      $("#line_color").val(line.color || "");
      $("#line_qty").val(line.qty || "");
      $("#line_cost").val(line.cost || "");
      $("#line_amount").val(num(line.amount).toFixed(2));
      $("#line_remarks").val(line.remarks || "");
      $("#lineSaveBtn").html('<i class="la la-save"></i> Update');

      await setSelectedArticle(line.articleId || "", line);
      await loadArticleColors(line.articleId || "");

setTimeout(() => {
  $("#line_color_select").val(line.color || "").trigger("change");

  if (!$("#line_color_select").val()) {
    $("#line_color_select").val("__ADD_NEW__").trigger("change");
    $("#line_color").val(line.color || "");
  }
}, 300);
    });

    $("#lineTable").on("click", ".line-del", async function () {
      const billId = $("#lines_bill_id").val();
      const lineId = $(this).data("id");

      const result = await Swal.fire({
        title: "Delete this line?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, delete",
      });

      if (!result.isConfirmed) return;

      try {
        await api(`${API}/${billId}/lines/${lineId}`, {
          method: "DELETE",
        });

        toast("Line deleted");
        await openLinesModal(billId);
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    });

    $("#btnScanBill").on("click", function () {
      const billId = $("#lines_bill_id").val();
      const status = $("#lines_bill_status").val();

      if (!billId) return;

      if (up(status) !== "DRAFT") {
        Swal.fire("Error", "Only draft bill can be scanned", "error");
        return;
      }

      $("#billScanFile").val("");
      $("#billScanFile").trigger("click");
    });

    $("#billScanFile").on("change", async function () {
      const billId = $("#lines_bill_id").val();
      const file = this.files && this.files[0];

      if (!billId || !file) return;

      try {
        Swal.fire({
          title: "Uploading bill...",
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading(),
        });

        const fd = new FormData();
        fd.append("billFile", file);

        await uploadApi(`${API}/${billId}/upload-bill`, fd);

        Swal.fire({
          title: "Scanning bill...",
          text: "This may take some time.",
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading(),
        });

       const scanned = await apiWithTimeout(`${API}/${billId}/scan-bill`, {
  method: "POST",
  body: JSON.stringify({}),
}, 300000);
        Swal.close();

        renderScanPreview(scanned.data || []);
        $("#scan_preview_bill_id").val(billId);
        $("#modalScanPreview").modal("show");
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    });

    $("#btnImportScannedLines").on("click", async function () {
      const billId = $("#scan_preview_bill_id").val();
      const lines = collectScannedLines();

      if (!billId) return;

      if (!lines.length) {
        Swal.fire("Error", "No selected lines to import", "error");
        return;
      }

      try {
        await api(`${API}/${billId}/import-scanned-lines`, {
          method: "POST",
          body: JSON.stringify({ lines }),
        });

        $("#modalScanPreview").modal("hide");
        toast("Scanned lines imported");
        await openLinesModal(billId);
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    });
  }
async function uploadStockInAttachment(file) {
  const fd = new FormData();
  fd.append("billFile", file);

  const r = await fetch(`${API}/upload-attachment`, {
    method: "POST",
    body: fd,
  });

  const j = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(j.error || j.message || "Attachment upload failed");
  }

  return j.data?.path || "";
}$("#bill_attachment_file").on("change", async function () {
  const file = this.files && this.files[0];
  if (!file) return;

  try {
    $("#bill_attachment_status").text("Uploading...");

    const path = await uploadStockInAttachment(file);

    $("#bill_attachment").val(path);
    $("#bill_attachment_status").html(
      `<a href="${path}" target="_blank">View uploaded bill</a>`
    );

    toast("Attachment uploaded");
  } catch (err) {
    $("#bill_attachment").val("");
    $("#bill_attachment_status").text("Upload failed");
    Swal.fire("Error", err.message, "error");
  }
});

$("#edit_bill_attachment_file").on("change", async function () {
  const file = this.files && this.files[0];
  if (!file) return;

  try {
    $("#edit_bill_attachment_status").text("Uploading...");

    const path = await uploadStockInAttachment(file);

    $("#edit_bill_attachment").val(path);
    $("#edit_bill_attachment_status").html(
      `<a href="${path}" target="_blank">View uploaded bill</a>`
    );

    toast("Attachment uploaded");
  } catch (err) {
    $("#edit_bill_attachment").val("");
    $("#edit_bill_attachment_status").text("Upload failed");
    Swal.fire("Error", err.message, "error");
  }
});
  $(document).on("submit", "#billCreateForm", async function (e) {
    e.preventDefault();

    try {
      const payload = {
        supplierId: $("#bill_supplierId").val(),
        billNo: $("#bill_billNo").val(),
        billDate: $("#bill_billDate").val(),
        storeId: $("#bill_storeId").val(),
        attachment: $("#bill_attachment").val() || "",
      };

      await api(API, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      $("#modalBillCreate").modal("hide");
      this.reset();

      toast("Draft bill created");
      await refresh();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  });

  $(document).on("submit", "#billEditForm", async function (e) {
    e.preventDefault();

    try {
      const id = $("#edit_bill_id").val();

      const payload = {
        supplierId: $("#edit_bill_supplierId").val(),
        billNo: $("#edit_bill_billNo").val(),
        billDate: $("#edit_bill_billDate").val(),
        storeId: $("#edit_bill_storeId").val(),
        attachment: $("#edit_bill_attachment").val() || "",
      };

      await api(`${API}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      $("#modalBillEdit").modal("hide");
      toast("Bill updated");
      await refresh();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  });

  $(document).on("submit", "#lineForm", async function (e) {
    e.preventDefault();

    try {
      const billId = $("#line_bill_id").val();
      const lineId = $("#line_id").val();
const selectedColor = $("#line_color_select").val();
const typedColor = $("#line_color").val();

if (!selectedColor) {
  throw new Error("Select existing color or add new color");
}

if (selectedColor === "__ADD_NEW__" && !typedColor.trim()) {
  throw new Error("Enter new color");
}

const finalColor =
  selectedColor === "__ADD_NEW__"
    ? up(typedColor)
    : up(selectedColor);
      const payload = {
  articleId: $("#line_articleId").val(),
  articleName: $("#line_articleName").val(),
  brand: $("#line_brand").val(),
  color: finalColor,
  qty: Number($("#line_qty").val()),
  mrp: Number($("#line_mrp").val()),
  discountPercent: Number($("#line_discountPercent").val()),
  cost: Number($("#line_cost").val()),
  amount: Number($("#line_amount").val()),
  remarks: $("#line_remarks").val() || "",
};

      if (!payload.articleId) throw new Error("Please select an article");
      if (!payload.articleName) throw new Error("Article name missing");
      if (!payload.brand) throw new Error("Brand missing");
      if (!payload.color) throw new Error("Please enter color");
      if (!payload.qty || payload.qty <= 0) throw new Error("Enter valid quantity");
      if (Number.isNaN(payload.cost) || payload.cost < 0) throw new Error("Enter valid cost");

      if (lineId) {
        await api(`${API}/${billId}/lines/${lineId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });

        toast("Line updated");
      } else {
        await api(`${API}/${billId}/lines`, {
          method: "POST",
          body: JSON.stringify({ lines: [payload] }),
        });

        toast("Line added");
      }

      await openLinesModal(billId);
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  });

  $("#modalBillLines").on("hidden.bs.modal", function () {
    resetLineForm();
    currentLines = [];
  });

  $(async function () {
    initTable();
    bindLineEvents();
    initArticleSearch();

    await loadSuppliers("#bill_supplierId");
    await loadSuppliers("#edit_bill_supplierId");
    await loadStores("#bill_storeId");
    await loadStores("#edit_bill_storeId");
setCurrentMonthFilter();
    await refresh();
  });
})();