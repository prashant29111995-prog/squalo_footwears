/* global $, Swal */

(function () {
  const BASE = "/apis/footwears";

  const API_BILLS = `${BASE}/bills`;
  const API_PARTIES = `${BASE}/parties`;
  const API_STORES = `${BASE}/stores`;
  const API_ARTICLES = `${BASE}/articles`;
  const API_STOCK_BALANCE = `${BASE}/stock-ledger/balance`;

  let billsTable;
  let linesTable;
  let CURRENT_BILL = null;

  async function api(url, opt = {}) {
    const method = (opt.method || "GET").toUpperCase();

    let res;
    let json;

    try {
      res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...opt,
      });

      json = await res.json().catch(() => ({}));
    } catch (e) {
      console.error("[API NETWORK ERROR]", { url, method, error: e });
      throw new Error("Network error");
    }

    if (!res.ok) {
      console.error("[API ERROR]", {
        url,
        method,
        status: res.status,
        response: json,
      });

      throw new Error(json?.error || json?.message || `API error (${res.status})`);
    }

    return json;
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

  function up(v) {
    return safe(v).trim().toUpperCase();
  }

  function oid(v) {
    if (!v) return "";
    if (typeof v === "string") return v;
    if (typeof v === "object" && v._id) return String(v._id);
    return "";
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function fmtDate(d) {
    if (!d) return "";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toISOString().slice(0, 10);
  }

  function money(n) {
    const x = Number(n || 0);
    return Number.isFinite(x) ? `₹${x.toFixed(2)}` : "₹0.00";
  }
function roundMoney(v) {
  return Math.round(num(v));
}

function moneyRound(v) {
  return `₹${roundMoney(v).toFixed(2)}`;
}
  function getCurrentStoreId() {
    return oid(CURRENT_BILL?.storeId);
  }

  function statusBadge(status) {
    const st = up(status);

    if (st === "FINAL") {
      return `<span class="badge-status badge-final">FINAL</span>`;
    }

    if (st === "DRAFT") {
      return `<span class="badge-status badge-draft">DRAFT</span>`;
    }

    if (st === "CANCELLED") {
      return `<span class="badge-status badge-cancelled">CANCELLED</span>`;
    }

    return `<span class="badge-status">${safe(status)}</span>`;
  }

  function setEditable(isEditable) {
  const status = up($("#bill_status_view").val());

  $("#articleSearch, #line_color, #line_batch, #line_qty, #line_mrp, #line_rate, #line_discount")
    .prop("disabled", !isEditable);

  $("#articleLineAddForm button[type=submit]").prop("disabled", !isEditable);

  $("#btnFinalizeBill").toggle(isEditable).prop("disabled", !isEditable);
  $("#btnCancelBill").toggle(status === "DRAFT").prop("disabled", status !== "DRAFT");

  $("#btnReverseBill")
    .toggle(status === "FINAL")
    .prop("disabled", status !== "FINAL");

  $("#bill_hint_badge")
    .removeClass("badge-info badge-dark badge-success")
    .addClass(isEditable ? "badge-info" : status === "FINAL" ? "badge-success" : "badge-dark")
    .text(isEditable ? "DRAFT editable" : status === "FINAL" ? "FINAL - can revert" : "Locked");
}


  function resetLineForm() {
    $("#articleSearch").val("");
    $("#articleIdHidden").val("");
    $("#articleDropdown").hide().empty();

    $("#line_color")
      .prop("disabled", true)
      .empty()
      .append(`<option value="">Select Article First</option>`);
    $("#line_batch")
  .prop("disabled", true)
  .empty()
  .append(`<option value="">Select Color First</option>`);

$("#batch_avail_label").text("Batch stock: -");
$("#line_purchase_cost").val("");
$("#line_purchase_discount").val("");
    $("#color_avail_label").text("Available: -");

    $("#line_qty").val(1);
    $("#line_mrp").val(0);
    $("#line_rate").val("");
    $("#line_discount").val(0);
  }

  async function loadStores() {
    const r = await api(API_STORES);
    const list = r.data || r || [];

    const $filter = $("#filter_store");
    const $create = $("#bill_store");

    $filter.empty().append(`<option value="">All Stores</option>`);
    $create.empty().append(`<option value="" selected disabled>Select Store</option>`);

    list.forEach((s) => {
      const label = `${safe(s.code)} - ${safe(s.name || s.storeName)}`.trim();

      $filter.append(`<option value="${s._id}">${label}</option>`);
      $create.append(`<option value="${s._id}">${label}</option>`);
    });
  }

  function mapBillRow(b) {
    const store = b?.storeId?.code
      ? `${b.storeId.code} - ${b.storeId.name || b.storeId.storeName || ""}`
      : safe(b.storeId);

    const party = b?.partyId?.name ? b.partyId.name : safe(b.partyName || b.partyId);
    const st = up(b.status);

    return {
      _id: b._id,
      date: fmtDate(b.billDate),
      store,
      party,
      billNo: safe(b.billNo || "-"),
      status: statusBadge(st),
      statusRaw: st,
      qty: b?.totals?.qtyTotal || 0,
      net: moneyRound(b?.totals?.payableTotal || b?.totals?.netTotal || 0),
      actions: `<button class="btn btn-sm btn-outline-brand open" data-id="${b._id}">Open</button>`,
    };
  }

  function initBillsTable() {
    billsTable = $("#billsTable").DataTable({
      responsive: true,
      pageLength: 25,
      data: [],
      columns: [
        { data: "date" },
        { data: "store" },
        { data: "party" },
        { data: "billNo" },
        { data: "status" },
        { data: "qty" },
        { data: "net" },
        { data: "actions", orderable: false, searchable: false },
      ],
      createdRow: function (row, data) {
        const st = data.statusRaw || "";

        row.classList.remove("bill-final", "bill-draft", "bill-cancelled");

        if (st === "FINAL") row.classList.add("bill-final");
        else if (st === "DRAFT") row.classList.add("bill-draft");
        else if (st === "CANCELLED") row.classList.add("bill-cancelled");
      },
      columnDefs: [{ targets: 4, render: (d) => d }],
    });

    $("#generalSearch").on("keyup", function () {
      billsTable.search(this.value).draw();
    });

    $("#billsTable").on("click", ".open", function () {
      openBill($(this).data("id"));
    });
  }

  function getListQuery() {
    const qs = new URLSearchParams();

    const storeId = $("#filter_store").val();
    const status = $("#filter_status").val();
    const from = $("#filter_from").val();
    const to = $("#filter_to").val();

    if (storeId) qs.set("storeId", storeId);
    if (status) qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);

    return qs.toString();
  }
const now = new Date();

const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  .toISOString()
  .slice(0, 10);

const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  .toISOString()
  .slice(0, 10);

$("#filter_from").val(firstDay);
$("#filter_to").val(lastDay);

  async function refreshBills() {
    const q = getListQuery();
    const r = await api(q ? `${API_BILLS}?${q}` : API_BILLS);
    const list = r.data || r || [];

    const mapped = list.map(mapBillRow);

billsTable.clear().rows.add(mapped).draw();

updateBillStats(list);
  }
function updateBillStats(list = []) {
  const today = new Date().toISOString().slice(0, 10);

  let todaySales = 0;
  let monthSales = 0;
  let totalBills = 0;
  let totalQty = 0;
  let draftBills = 0;

  list.forEach((b) => {
    const status = up(b.status);

    if (status === "CANCELLED") return;

    const net = roundMoney(b?.totals?.payableTotal || b?.totals?.netTotal || 0);
    const qty = Number(b?.totals?.qtyTotal || 0);

    monthSales += net;
    totalQty += qty;
    totalBills += 1;

    if (status === "DRAFT") {
      draftBills += 1;
    }

    if (fmtDate(b.billDate) === today) {
      todaySales += net;
    }
  });

  const avgBill =
    totalBills > 0
      ? monthSales / totalBills
      : 0;

  $("#stat_today_sales").text(money(todaySales));
  $("#stat_month_sales").text(money(monthSales));
  $("#stat_total_bills").text(totalBills);
  $("#stat_total_qty").text(totalQty);
  $("#stat_draft_bills").text(draftBills);
  $("#stat_avg_bill").text(money(avgBill));
}
  $("#modalBillCreate").on("shown.bs.modal", function () {
    const today = new Date().toISOString().slice(0, 10);

    if (!$("#bill_date").val()) {
      $("#bill_date").val(today);
    }

    $("#partySearch").trigger("focus");
  });

  $("#billCreateForm").on("submit", async function (e) {
  e.preventDefault();

  try {
    const storeId = $("#bill_store").val();
    const partyId = $("#bill_partyId").val();
    const billDate = $("#bill_date").val();
    const billNo = $("#bill_no").val() || "";
    const notes = $("#bill_notes").val() || "";

    if (!storeId) return Swal.fire("Missing", "Select Store", "warning");
    if (!partyId) return Swal.fire("Missing", "Select Party from suggestions", "warning");
    if (!billDate) return Swal.fire("Missing", "Select Bill Date", "warning");

    await api(API_BILLS, {
      method: "POST",
      body: JSON.stringify({
        storeId,
        partyId,
        billDate,
        billNo,
        notes,
      }),
    });

    $("#modalBillCreate").modal("hide");
    this.reset();

    $("#bill_partyId").val("");
    $("#partyDropdown").hide().empty();

    toast("Bill created");
    await refreshBills();
  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
});

  let partyTmr = null;

  async function searchParties(q) {
    const qs = new URLSearchParams();

    if (q) qs.set("q", q);
    qs.set("limit", "20");

    const r = await api(`${API_PARTIES}?${qs.toString()}`);
    return r.data || r || [];
  }

  function renderPartyDropdown(items) {
    const $dd = $("#partyDropdown");
    $dd.empty();

    if (!items.length) {
      $dd.append(`<button type="button" class="dropdown-item disabled">No parties found</button>`);
      $dd.show();
      return;
    }

    items.forEach((p) => {
      const label = `${safe(p.name)}${p.phone ? " - " + safe(p.phone) : ""}`;

      $dd.append(`
        <button type="button" class="dropdown-item party-item"
          data-id="${p._id}"
          data-label="${label.replace(/"/g, "&quot;")}">
          ${label}
        </button>
      `);
    });

    $dd.show();
  }

  $("#partySearch").on("keyup focus", function () {
    const q = safe(this.value).trim();

    clearTimeout(partyTmr);

    partyTmr = setTimeout(async () => {
      try {
        const items = await searchParties(q);
        renderPartyDropdown(items);
      } catch (e) {
        console.warn(e.message);
      }
    }, 250);
  });

  $(document).on("click", ".party-item", function () {
    $("#bill_partyId").val($(this).data("id"));
    $("#partySearch").val($(this).data("label"));
    $("#partyDropdown").hide().empty();
  });

  let articleTmr = null;

  async function searchArticles(q) {
    const qs = new URLSearchParams();

    if (q) qs.set("q", q);
    qs.set("limit", "15");

    const r = await api(`${API_ARTICLES}?${qs.toString()}`);
    return r.data || r || [];
  }

  function renderArticleDropdown(items) {
    const $dd = $("#articleDropdown");
    $dd.empty();

    if (!items.length) {
      $dd.append(`<button type="button" class="dropdown-item disabled">No articles found</button>`);
      $dd.show();
      return;
    }

    items.forEach((a) => {
      const articleName = safe(a.articleName || a.name);
      const brand = safe(a.brand || "");
      const label = `${brand} - ${articleName}`;

      $dd.append(`
        <button type="button" class="dropdown-item article-item"
          data-id="${a._id}"
          data-brand="${brand.replace(/"/g, "&quot;")}"
          data-article="${articleName.replace(/"/g, "&quot;")}"
          data-label="${label.replace(/"/g, "&quot;")}">
          ${label}
        </button>
      `);
    });

    $dd.show();
  }

  $("#articleSearch").on("keyup focus", function () {
    const q = safe(this.value).trim();

    clearTimeout(articleTmr);

    articleTmr = setTimeout(async () => {
      try {
        const items = await searchArticles(q);
        renderArticleDropdown(items);
      } catch (e) {
        console.warn(e.message);
      }
    }, 200);
  });

  async function fetchArticleColorStock(articleId) {
    const storeId = getCurrentStoreId();

    if (!articleId || !storeId) {
      return [];
    }

    const qs = new URLSearchParams();
    qs.set("storeId", storeId);
    qs.set("articleId", articleId);

    const r = await api(`${API_STOCK_BALANCE}?${qs.toString()}`);
    return r.data || [];
  }

  
function buildPrintableBillHtml(bill) {
  const b = bill || CURRENT_BILL;
  if (!b) return "";

  const GST_RATE = 5;

  const companyName = "Squalo Footwears (P) LTD.";
  const companyGstin = "06ABGCS3320K1ZE";
  const companyPan = "ABGCS3320K";
  const companyAddress = "Shop No. 28,29, Old Capital Bus Stand, Ballabgarh, Faridabad, Haryana - 121004";
  const companyPhone = "+91 8800558497, 9818132852";
  const companyEmail = "Squalofootwears@gmail.com";
  const companyWebsite = "thesqualo.com";

  const party = b.partyId || {};
  const store = b.storeId || {};

  const billNo = safe(b.billNo || b._id || "");
  const billDate = fmtDate(b.billDate);
  const partyName = safe(party.name || b.partyName || "");
  const partyPhone = safe(party.phone || "");
  const partyGstin = safe(party.gstin || "");
  const partyAddress = safe(party.address || "");
  const storeName = safe(store.name || store.storeName || store.code || "Squalo Footwears");

  let totalQty = 0;
  let grossTotal = 0;
  let discountTotal = 0;
  let taxableTotal = 0;
  let gstTotal = 0;
  let netTotal = 0;

  const rows = (b.lines || [])
    .map((l, i) => {
      const articleName = safe(
        l.articleName ||
          l.articleId?.articleName ||
          l.snap?.articleName ||
          "-"
      );

      const brand = safe(
        l.brand ||
          l.articleId?.brand ||
          l.snap?.brand ||
          "-"
      );

      const color = safe(l.color || l.colorRaw || l.snap?.color || "-");

      const qty = num(l.qty);
      const mrp = num(l.mrp);
      const rate = num(l.rate || l.price);
      const discount = num(l.discount);
      const amount = num(l.amount || qty * rate);

      const gross = qty * mrp;
      const discountAmount = Math.max(gross - amount, 0);

      const taxable = amount / (1 + GST_RATE / 100);
      const gst = amount - taxable;

      totalQty += qty;
      grossTotal += gross;
      discountTotal += discountAmount;
      taxableTotal += taxable;
      gstTotal += gst;
      netTotal += amount;

      return `
        <tr>
          <td class="center">${i + 1}</td>
          <td>
            <b>${articleName}</b>
            <div class="muted">${brand} / ${color}</div>
          </td>
          <td class="center">PAIR</td>
          <td class="right">${qty}</td>
          <td class="right">₹${mrp.toFixed(2)}</td>
          <td class="right">${discount.toFixed(2)}%</td>
          <td class="right">₹${rate.toFixed(2)}</td>
          <td class="right">₹${taxable.toFixed(2)}</td>
          <td class="right">₹${gst.toFixed(2)}<br><small>5%</small></td>
          <td class="right"><b>₹${amount.toFixed(2)}</b></td>
        </tr>
      `;
    })
    .join("");

  const cgst = gstTotal / 2;
  const sgst = gstTotal / 2;
  const roundOff = Math.round(netTotal) - netTotal;
  const payable = Math.round(netTotal);

  return `
<!doctype html>
<html>
<head>
  <title>Tax Invoice ${billNo}</title>
  <style>
    *{box-sizing:border-box}
    body{
      font-family:Arial, sans-serif;
      color:#1f2937;
      margin:0;
      padding:24px;
      font-size:12px;
      background:#fff;
    }
    .invoice{
      max-width:900px;
      margin:0 auto;
      background:#fff;
    }
    .top{
      display:flex;
      justify-content:space-between;
      gap:20px;
      border-bottom:3px solid #2563eb;
      padding-bottom:14px;
    }
    .blue-title{
      color:#2563eb;
      letter-spacing:4px;
      font-weight:900;
      font-size:14px;
      margin-bottom:8px;
    }
    h1{
      margin:0 0 6px;
      font-size:25px;
      color:#111827;
    }
    .company-info{
      line-height:1.45;
    }
    .copy-text{
      text-align:right;
      font-size:11px;
      font-weight:800;
      color:#374151;
    }
    .logo-mark{
      margin-top:28px;
      font-size:54px;
      color:#60a5fa;
      font-weight:900;
    }
    .info-grid{
      display:grid;
      grid-template-columns:1fr 1fr 1fr;
      gap:18px;
      margin-top:18px;
      padding-bottom:12px;
      border-bottom:1px solid #d1d5db;
    }
    .info-box h4{
      margin:0 0 6px;
      color:#111827;
      font-size:13px;
    }
    .info-box{
      line-height:1.5;
    }
    table{
      width:100%;
      border-collapse:collapse;
      margin-top:18px;
    }
    th{
      border-top:2px solid #2563eb;
      border-bottom:2px solid #2563eb;
      padding:8px 6px;
      text-align:left;
      color:#111827;
      font-size:11px;
    }
    td{
      border-bottom:1px solid #e5e7eb;
      padding:8px 6px;
      vertical-align:top;
    }
    .center{text-align:center}
    .right{text-align:right}
    .muted{
      color:#6b7280;
      font-size:11px;
      margin-top:2px;
    }
    .summary-wrap{
      display:flex;
      justify-content:flex-end;
      margin-top:8px;
    }
    .summary{
      width:360px;
      border-collapse:collapse;
      margin-top:0;
    }
    .summary td{
      border:0;
      padding:5px 4px;
    }
    .summary .total-row td{
      border-top:2px solid #111827;
      font-size:20px;
      font-weight:900;
      padding-top:8px;
    }
    .bottom-line{
      border-top:2px solid #2563eb;
      margin-top:10px;
      padding:10px 0;
      font-size:12px;
    }
    .footer-grid{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:50px;
      margin-top:24px;
    }
    .bank-box{
      line-height:1.7;
    }
    .sign-box{
      text-align:center;
      padding-top:40px;
    }
    .terms{
      margin-top:24px;
      font-size:11px;
      line-height:1.5;
      color:#374151;
    }
    .badge{
      display:inline-block;
      background:#eff6ff;
      color:#2563eb;
      padding:3px 8px;
      border-radius:999px;
      font-weight:800;
      font-size:10px;
    }
    @media print{
      @page{size:A4;margin:10mm}
      body{padding:0}
      .invoice{max-width:none}
    }
  </style>
</head>
<body>
  <div class="invoice">

    <div class="top">
      <div class="company-info">
        <div class="blue-title">TAX INVOICE</div>
        <h1>${companyName}</h1>
        <b>GSTIN:</b> ${companyGstin} &nbsp;&nbsp; <b>PAN:</b> ${companyPan}<br>
        ${companyAddress}<br>
        <b>Mobile:</b> ${companyPhone}<br>
        <b>Email:</b> ${companyEmail} &nbsp;&nbsp; <b>Website:</b> ${companyWebsite}<br>
        <b>Store:</b> ${storeName}
      </div>

      <div class="copy-text">
        ORIGINAL FOR RECIPIENT
        <div class="logo-mark">SQUALO</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <h4>Invoice Details</h4>
        <b>Invoice No:</b> INV-${billNo}<br>
        <b>Invoice Date:</b> ${billDate}<br>
        <b>Due Date:</b> ${billDate}<br>
        <span class="badge">GST 5% INCLUDED</span>
      </div>

      <div class="info-box">
        <h4>Customer Details</h4>
        <b>${partyName || "-"}</b><br>
        ${partyPhone ? `Phone: ${partyPhone}<br>` : ""}
        ${partyGstin ? `GSTIN: ${partyGstin}<br>` : ""}
        <b>Place of Supply:</b> 06-HARYANA
      </div>

      <div class="info-box">
        <h4>Billing Address</h4>
        ${partyAddress || "-"}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="center">#</th>
          <th>Item</th>
          <th class="center">Unit</th>
          <th class="right">Qty</th>
          <th class="right">MRP</th>
          <th class="right">Disc</th>
          <th class="right">Rate</th>
          <th class="right">Taxable</th>
          <th class="right">GST</th>
          <th class="right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${
          rows ||
          `<tr><td colspan="10" class="center">No items found</td></tr>`
        }
      </tbody>
    </table>

    <div class="summary-wrap">
      <table class="summary">
        <tr>
          <td class="right">Gross Amount</td>
          <td class="right"><b>₹${grossTotal.toFixed(2)}</b></td>
        </tr>
        <tr>
          <td class="right">Discount</td>
          <td class="right"><b>₹${discountTotal.toFixed(2)}</b></td>
        </tr>
        <tr>
          <td class="right">Taxable Amount</td>
          <td class="right"><b>₹${taxableTotal.toFixed(2)}</b></td>
        </tr>
        <tr>
          <td class="right">CGST 2.5%</td>
          <td class="right"><b>₹${cgst.toFixed(2)}</b></td>
        </tr>
        <tr>
          <td class="right">SGST 2.5%</td>
          <td class="right"><b>₹${sgst.toFixed(2)}</b></td>
        </tr>
        <tr>
          <td class="right">Round Off</td>
          <td class="right"><b>₹${roundOff.toFixed(2)}</b></td>
        </tr>
        <tr class="total-row">
          <td class="right">Total</td>
          <td class="right">₹${payable.toFixed(2)}</td>
        </tr>
      </table>
    </div>

    <div class="bottom-line">
      <b>Total Items:</b> ${(b.lines || []).length}
      &nbsp;&nbsp; | &nbsp;&nbsp;
      <b>Total Qty:</b> ${totalQty}
      <span style="float:right">
        <b>Amount Payable:</b> ₹${payable.toFixed(2)}
      </span>
    </div>

    <div class="footer-grid">
      <div class="bank-box">
        <h4>Bank Details</h4>
        Bank: <b>HDFC FIRST Bank</b><br>
        Account No: <b>50200118357642</b><br>
        IFSC Code: <b>HDFC0002445</b><br>
        Branch: <b>NIT-II, Faridabad</b>
      </div>

      <div class="sign-box">
        For <b>${companyName}</b><br><br><br><br>
        Authorized Signatory
      </div>
    </div>

    <div class="terms">
      <b>Terms & Conditions:</b><br>
      1. Goods once sold will not be returned.<br>
      2. Exchange only allowed for unused products after verification.<br>
      3. No cash refund. Only exchange/adjustment as per company policy.<br>
      4. All disputes subject to Faridabad jurisdiction.
    </div>

  </div>
</body>
</html>
`;
}

function printCurrentBill() {
  if (!CURRENT_BILL) {
    return Swal.fire("Missing", "Open a bill first", "warning");
  }

  const html = buildPrintableBillHtml(CURRENT_BILL);
  const w = window.open("", "_blank", "width=900,height=700");

  if (!w) {
    return Swal.fire("Popup blocked", "Allow popups to print bill", "warning");
  }

  w.document.open();
  w.document.write(html);
  w.document.close();

  w.onload = function () {
    w.focus();
    w.print();
  };
}

  async function populateColorSelect(articleId) {
  const $color = $("#line_color");
  const $label = $("#color_avail_label");

  $color.prop("disabled", true);
  $color.empty().append(`<option value="">Loading colors...</option>`);
  $label.text("Available: -");

  $("#line_batch")
    .prop("disabled", true)
    .empty()
    .append(`<option value="">Select Color First</option>`);

  try {
    const rows = await fetchArticleColorStock(articleId);
    const availableRows = rows.filter((x) => Number(x.balanceQty || 0) > 0);

    const colorMap = {};

    availableRows.forEach((x) => {
      const c = up(x.color);
      colorMap[c] = (colorMap[c] || 0) + Number(x.balanceQty || 0);
    });

    const colors = Object.keys(colorMap).sort();

    $color.empty();

    if (!colors.length) {
      $color.append(`<option value="">No stock available</option>`);
      $color.prop("disabled", true);
      $label.text("Available: 0");
      return;
    }

    $color.append(`<option value="">Select Color</option>`);

    colors.forEach((color) => {
      $color.append(`
        <option value="${color}" data-qty="${colorMap[color]}">
          ${color} — Total Available ${colorMap[color]}
        </option>
      `);
    });

    $color.prop("disabled", false);
  } catch (err) {
    console.error("populateColorSelect error:", err);
    $color.empty().append(`<option value="">Failed to load colors</option>`);
    $color.prop("disabled", true);
    $label.text("Available: -");
  }
}

async function populateBatchSelect(articleId, color) {
  const storeId = getCurrentStoreId();
  const $batch = $("#line_batch");

  $batch.prop("disabled", true);
  $batch.empty().append(`<option value="">Loading batches...</option>`);
  $("#batch_avail_label").text("Batch stock: -");

  const qs = new URLSearchParams();
  qs.set("storeId", storeId);
  qs.set("articleId", articleId);
  qs.set("color", color);

  const r = await api(`${API_STOCK_BALANCE}?${qs.toString()}`);
  const rows = (r.data || []).filter((x) => Number(x.balanceQty || 0) > 0);

  if (!rows.length) {
    $batch.empty().append(`<option value="">No batch stock</option>`);
    return;
  }

  $batch.empty().append(`<option value="">Select MRP Batch</option>`);

  rows.forEach((x, idx) => {
    const mrp = Number(x.mrp || 0);
    const cost = Number(x.lastCost || x.cost || 0);
    const purchaseDiscount = Number(x.purchaseDiscount || x.purchaseDiscountPercent || 0);
    const qty = Number(x.balanceQty || 0);

    $batch.append(`
      <option
        value="${idx}"
        data-mrp="${mrp}"
        data-cost="${cost}"
        data-purchase-discount="${purchaseDiscount}"
        data-qty="${qty}">
        MRP ₹${mrp} | Cost ₹${cost} | Avl ${qty}
      </option>
    `);
  });

  $batch.prop("disabled", false);
}

let PRICE_EDIT_MODE = "discount";

function calculateRateFromDiscount() {
  const mrp = Number($("#line_mrp").val() || 0);
  const discount = Number($("#line_discount").val() || 0);

  if (!Number.isFinite(mrp) || mrp <= 0) {
    $("#line_rate").val("");
    return;
  }

  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    $("#line_rate").val("");
    return;
  }

  const rate = mrp - (mrp * discount) / 100;
  $("#line_rate").val(rate.toFixed(2));
}

function calculateDiscountFromRate() {
  const mrp = Number($("#line_mrp").val() || 0);
  const rate = Number($("#line_rate").val() || 0);

  if (!Number.isFinite(mrp) || mrp <= 0) {
    $("#line_discount").val(0);
    return;
  }

  if (!Number.isFinite(rate) || rate < 0) {
    $("#line_discount").val(0);
    return;
  }

  const discount = ((mrp - rate) / mrp) * 100;
  const safeDiscount = Math.max(0, Math.min(discount, 100));

  $("#line_discount").val(safeDiscount.toFixed(2));
}

function calculateBillingRate() {
  if (PRICE_EDIT_MODE === "rate") {
    calculateDiscountFromRate();
  } else {
    calculateRateFromDiscount();
  }
}
$("#btnPrintBill").on("click", function () {
  printCurrentBill();
});

  $(document).on("click", ".article-item", async function () {
    const articleId = $(this).data("id");
    const label = $(this).data("label");

    $("#articleIdHidden").val(articleId);
    $("#articleSearch").val(label);
    $("#articleDropdown").hide().empty();

    $("#line_color")
      .prop("disabled", true)
      .empty()
      .append(`<option value="">Loading colors...</option>`);

    $("#color_avail_label").text("Available: -");

    await populateColorSelect(articleId);

    $("#line_color").trigger("focus");
  });



$("#line_color").off("change").on("change", async function () {
  const articleId = $("#articleIdHidden").val();
  const color = up($(this).val());
  const qty = Number($("#line_color option:selected").data("qty") || 0);

  $("#color_avail_label").text(`Total Available: ${qty}`);

  $("#line_mrp").val(0);
  $("#line_rate").val("");
  $("#line_purchase_cost").val("");
  $("#line_purchase_discount").val("");

  $("#line_batch")
    .prop("disabled", true)
    .empty()
    .append(`<option value="">Select Color First</option>`);

  $("#batch_avail_label").text("Batch stock: -");

  if (!articleId || !color) return;

  await populateBatchSelect(articleId, color);
});


$("#line_batch").off("change").on("change", function () {
  const $opt = $("#line_batch option:selected");

  const qty = Number($opt.data("qty") || 0);
  const mrp = Number($opt.data("mrp") || 0);
  const cost = Number($opt.data("cost") || 0);
  const purchaseDiscount = Number($opt.data("purchase-discount") || 0);

  $("#batch_avail_label").text(`Batch stock: ${qty}`);
  $("#line_mrp").val(mrp);
  $("#line_purchase_cost").val(cost);
  $("#line_purchase_discount").val(purchaseDiscount);
  PRICE_EDIT_MODE = "discount";
  calculateRateFromDiscount();
});


$("#line_discount").on("input change", function () {
  PRICE_EDIT_MODE = "discount";
  calculateRateFromDiscount();
});

$("#line_rate").on("input change", function () {
  PRICE_EDIT_MODE = "rate";
  calculateDiscountFromRate();
});

$("#line_mrp").on("input change", function () {
  calculateBillingRate();
});


  $(document).on("click", function (e) {
    if (!$(e.target).closest("#partySearch, #partyDropdown").length) {
      $("#partyDropdown").hide();
    }

    if (!$(e.target).closest("#articleSearch, #articleDropdown").length) {
      $("#articleDropdown").hide();
    }
  });

  function mapLineRow(l) {
    const articleObj = l.articleId && typeof l.articleId === "object" ? l.articleId : null;

    const articleName = safe(l.articleName || articleObj?.articleName || l.snap?.articleName);
    const brand = safe(l.brand || articleObj?.brand || l.snap?.brand);
    const color = safe(l.color || l.colorRaw || l.snap?.color);
    const qty = num(l.qty);
    const mrp = num(l.mrp);
    const rate = num(l.rate);
    const discount = num(l.discount);
    const amount = num(l.amount);

    return {
      _id: l._id,
      articleName,
      brand,
      color,
      qty,
      mrp: money(mrp),
      rate: money(rate),
      discount: `${discount.toFixed(2)}%`,
      amount: money(amount),
      actions: `<button class="btn btn-sm btn-outline-danger del-line" data-id="${l._id}">
        <i class="la la-trash"></i>
      </button>`,
    };
  }

  function initLinesTable() {
    linesTable = $("#billLinesTable").DataTable({
      responsive: true,
      paging: false,
      searching: false,
      info: false,
      ordering: false,
      data: [],
      columns: [
        { data: "articleName" },
        { data: "brand" },
        { data: "color" },
        { data: "qty" },
        { data: "mrp" },
        { data: "rate" },
        { data: "discount" },
        { data: "amount" },
        { data: "actions", orderable: false, searchable: false },
      ],
    });

    $("#billLinesTable").on("click", ".del-line", async function () {
      const billId = $("#bill_id").val();
      const lineId = $(this).data("id");
      const status = up($("#bill_status_view").val());

      if (status !== "DRAFT") {
        return Swal.fire("Not allowed", "Bill is not editable", "warning");
      }

      const ok = await Swal.fire({
        title: "Delete this line?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes",
      });

      if (!ok.isConfirmed) return;

      try {
        await api(`${API_BILLS}/${billId}/lines/${lineId}`, {
          method: "DELETE",
        });

        toast("Line deleted");
        await openBill(billId);
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    });
  }

  async function openBill(id) {
    const r = await api(`${API_BILLS}/${id}`);
    const b = r.data || r;

    CURRENT_BILL = b;

    $("#bill_id").val(b._id);

    const storeLabel = b?.storeId?.code
      ? `${b.storeId.code} - ${b.storeId.name || b.storeId.storeName || ""}`
      : safe(b.storeId);

    const partyLabel = b?.partyId?.name
      ? `${b.partyId.name}${b.partyId.phone ? " - " + b.partyId.phone : ""}`
      : safe(b.partyName || b.partyId);

    $("#bill_store_view").val(storeLabel);
    $("#bill_party_view").val(partyLabel);
    $("#bill_status_view").val(safe(b.status));
    $("#bill_date_view").val(fmtDate(b.billDate));
    $("#bill_no_view").val(safe(b.billNo || ""));

    const t = b.totals || {};

    $("#bill_qtyTotal").text(t.qtyTotal || 0);
    $("#bill_subTotal").text(money(t.subTotal || 0));
    $("#bill_discountTotal").text(money(t.discountTotal || 0));
    $("#bill_netTotal").text(moneyRound(t.payableTotal || t.netTotal || 0));

    const editable = up(b.status) === "DRAFT";
    setEditable(editable);

    resetLineForm();

    linesTable.clear().rows.add((b.lines || []).map(mapLineRow)).draw();

    $("#modalBillDetail").modal("show");

    setTimeout(() => linesTable.columns.adjust().draw(false), 150);
  }

  $("#articleLineAddForm").on("submit", async function (e) {
  e.preventDefault();

  const billId = $("#bill_id").val();
  const status = up($("#bill_status_view").val());

  if (status !== "DRAFT") {
    return Swal.fire("Not allowed", "Bill is not editable", "warning");
  }

  const articleId = $("#articleIdHidden").val();
  const color = up($("#line_color").val());
  const qty = Number($("#line_qty").val());
  const mrp = Number($("#line_mrp").val() || 0);
  const rate = Number($("#line_rate").val());
  const discount = Number($("#line_discount").val() || 0);

  const cost = Number($("#line_purchase_cost").val() || 0);
  const purchaseDiscountPercent = Number($("#line_purchase_discount").val() || 0);
  const batchAvailableQty = Number($("#line_batch option:selected").data("qty") || 0);

  if (!articleId) return Swal.fire("Missing", "Select Article from suggestions", "warning");
  if (!color) return Swal.fire("Missing", "Select Color", "warning");
  if (!$("#line_batch").val()) return Swal.fire("Missing", "Select MRP Batch", "warning");

  if (!Number.isFinite(qty) || qty <= 0) {
    return Swal.fire("Invalid qty", "", "warning");
  }

  if (batchAvailableQty > 0 && qty > batchAvailableQty) {
    return Swal.fire(
      "Not enough stock",
      `Batch Available: ${batchAvailableQty}, Requested: ${qty}`,
      "warning"
    );
  }

  if (!Number.isFinite(mrp) || mrp <= 0) {
    return Swal.fire("Invalid MRP", "Select valid MRP batch", "warning");
  }

  if (!Number.isFinite(rate) || rate < 0) {
    return Swal.fire("Invalid rate", "", "warning");
  }

  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    return Swal.fire("Invalid discount", "Discount must be 0-100%", "warning");
  }

  if (!Number.isFinite(cost) || cost < 0) {
    return Swal.fire("Invalid cost", "Selected batch cost missing", "warning");
  }

  try {
    await api(`${API_BILLS}/${billId}/lines`, {
      method: "POST",
      body: JSON.stringify({
        articleId,
        color,
        qty,
        mrp,
        cost,
        purchaseDiscountPercent,
        discount,
      }),
    });

    toast("Line added");
    await openBill(billId);
  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
});

  $("#btnFinalizeBill").on("click", async function () {
    const billId = $("#bill_id").val();
    const status = up($("#bill_status_view").val());

    if (status !== "DRAFT") return;

    const ok = await Swal.fire({
      title: "Finalize Bill?",
      text: "This will post SALE entries in StockLedger.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Finalize",
    });

    if (!ok.isConfirmed) return;

    try {
      await api(`${API_BILLS}/${billId}/finalize`, {
        method: "POST",
      });

      toast("Bill finalized");
      $("#modalBillDetail").modal("hide");
      await refreshBills();
    } catch (err) {
  console.error("Finalize error:", err);
  Swal.fire("Finalize Failed", err.message || "Failed to finalize bill", "error");
}
  });

  $("#btnReverseBill").on("click", async function () {
  const billId = $("#bill_id").val();
  const status = up($("#bill_status_view").val());

  if (status !== "FINAL") {
    return Swal.fire("Not allowed", "Only FINAL bill can be reverted", "warning");
  }

  const ok = await Swal.fire({
    title: "Revert Final Bill?",
    text: "This will restore stock and move bill back to DRAFT for correction.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Yes, Revert",
  });

  if (!ok.isConfirmed) return;

  try {
    await api(`${API_BILLS}/${billId}/reverse`, {
      method: "POST",
    });

    toast("Bill reverted to draft");

    await openBill(billId);
    await refreshBills();
  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
});

  $("#btnCancelBill").on("click", async function () {
    const billId = $("#bill_id").val();
    const status = up($("#bill_status_view").val());

    if (status !== "DRAFT") {
      return Swal.fire("Not allowed", "Only DRAFT bill can be cancelled", "warning");
    }

    const ok = await Swal.fire({
      title: "Cancel Bill?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Cancel",
    });

    if (!ok.isConfirmed) return;

    try {
      await api(`${API_BILLS}/${billId}/cancel`, {
        method: "POST",
      });

      toast("Bill cancelled");
      $("#modalBillDetail").modal("hide");
      await refreshBills();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  });

  function bindFilters() {
    $("#filter_store, #filter_status, #filter_from, #filter_to").on("change", async function () {
      await refreshBills();
    });
  }

  $(async function () {
    initBillsTable();
    initLinesTable();

    await loadStores();

    bindFilters();
    await refreshBills();
  });
})();