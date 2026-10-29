/* global $, Swal */

(function () {
  const BASE = "/apis/footwears";

  const PARTY_API = `${BASE}/parties`;
  const LEDGER_API = `${BASE}/party-ledger`;
  const PAYMENT_API = `${BASE}/party-payments`;
  const BILL_API = `${BASE}/bills`;

  const PARTY_ID = $("#partyId").val();

  let PARTY = null;
  let LEDGER_ROWS = [];
  let BILL_ROWS = [];
  let PAYMENT_ROWS = [];

 function balanceLabel(v) {
  const amount = num(v);

  if (amount > 0) return `${money(amount)} Dr`;
  if (amount < 0) return `${money(Math.abs(amount))} Cr`;

  return "₹0.00";
}

  async function api(url, opt = {}) {
    const r = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...opt,
    });

    const j = await r.json().catch(() => ({}));

    if (!r.ok) {
      throw new Error(j.error || j.message || "API error");
    }

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

  function fmtDate(v) {
    if (!v) return "-";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-IN");
  }

  function todayInput() {
    return new Date().toISOString().slice(0, 10);
  }

  function toast(msg) {
    Swal.fire({
      icon: "success",
      title: msg,
      timer: 1200,
      showConfirmButton: false,
    });
  }

  function statusBadge(status) {
    const s = up(status);

    if (["FINAL", "CONFIRMED", "ACTIVE"].includes(s)) {
      return `<span class="kt-badge kt-badge--inline kt-badge--success">${s}</span>`;
    }

    if (["DRAFT", "PENDING"].includes(s)) {
      return `<span class="kt-badge kt-badge--inline kt-badge--warning">${s}</span>`;
    }

    if (["CANCELLED", "REVERSED"].includes(s)) {
      return `<span class="kt-badge kt-badge--inline kt-badge--danger">${s}</span>`;
    }

    return `<span class="kt-badge kt-badge--inline kt-badge--dark">${s || "-"}</span>`;
  }

  function typeBadge(type) {
  let t = up(type);

  if (t === "PAYMENT_RECEIVED") t = "PAYMENT";
  if (t === "BILL_SALE") t = "BILL";

  const cls =
    t === "BILL"
      ? "danger"
      : t === "PAYMENT"
      ? "success"
      : t === "RETURN"
      ? "info"
      : t === "ADJUSTMENT"
      ? "warning"
      : "brand";

  return `<span class="kt-badge kt-badge--inline kt-badge--${cls}">${t}</span>`;
}

  function getDebit(x) {
    return num(x.debit || x.debitAmount || x.amountDebit || 0);
  }

  function getCredit(x) {
    return num(x.credit || x.creditAmount || x.amountCredit || 0);
  }

  function getBalance(x) {
    return num(x.balance || x.balanceAfter || x.runningBalance || 0);
  }

  function getDate(x) {
    return x.txnDate || x.entryDate || x.date || x.createdAt;
  }

  function getType(x) {
    return x.entryType || x.type || x.txnType || "";
  }

  function getRef(x) {
    return x.refNo || x.documentNo || x.billNo || x.paymentNo || x.ref?.documentNo || "-";
  }

  function getNotes(x) {
    return x.notes || x.note || x.ref?.note || "";
  }

  function getBillAmount(b) {
    return num(b?.totals?.netTotal || b.netTotal || b.amount || 0);
  }

  function getBillQty(b) {
    return num(b?.totals?.qtyTotal || b.qtyTotal || 0);
  }

  function getBillProfit(b) {
    let profit = 0;

    (b.lines || []).forEach((line) => {
      const qty = num(line.qty);
      const rate = num(line.rate);
      const cost = num(line.cost);
      profit += qty * (rate - cost);
    });

    return profit;
  }

  function getBillCost(b) {
    let cost = 0;

    (b.lines || []).forEach((line) => {
      cost += num(line.qty) * num(line.cost);
    });

    return cost;
  }

  function daysSince(dateValue) {
    if (!dateValue) return "-";

    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return "-";

    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "1 day";
    return `${days} days`;
  }

  function updatePartyInfo() {
    $("#partyNameTitle").text(PARTY?.name || "Party Account");
    $("#partyName").val(PARTY?.name || "");
    $("#partyPhone").val(PARTY?.phone || "");
    $("#partyType").val(PARTY?.partyType || "");
    $("#partyGstin").val(PARTY?.gstin || "");
  }

  function buildLedgerQuery() {
    const qs = new URLSearchParams();

    qs.set("partyId", PARTY_ID);

    if ($("#filter_from").val()) qs.set("from", $("#filter_from").val());
    if ($("#filter_to").val()) qs.set("to", $("#filter_to").val());
    if ($("#filter_type").val()) qs.set("type", $("#filter_type").val());

    return qs.toString();
  }

function calculateAnalytics() {
  const activeBills = BILL_ROWS.filter((b) => up(b.status) !== "CANCELLED");

  const totalBills = activeBills.length;

  const totalSales = activeBills.reduce((s, b) => {
    return s + getBillAmount(b);
  }, 0);

  const totalPayments = PAYMENT_ROWS.reduce((s, p) => {
    const status = up(p.status || (p.isReversed ? "REVERSED" : "ACTIVE"));
    if (status === "REVERSED") return s;
    return s + num(p.amount);
  }, 0);

  const totalProfit = activeBills.reduce((s, b) => {
    return s + getBillProfit(b);
  }, 0);

  const totalCost = activeBills.reduce((s, b) => {
    return s + getBillCost(b);
  }, 0);

  // ✅ REAL outstanding should come from ledger, including:
  // SALE_BILL + PAYMENT_RECEIVED + ADJUSTMENT + REVERSALS
  let ledgerSignedBalance = 0;

  LEDGER_ROWS.forEach((x) => {
    ledgerSignedBalance += getDebit(x);
    ledgerSignedBalance -= getCredit(x);
  });

  const outstanding = ledgerSignedBalance;

  const profitPercent = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

  const avgBill = totalBills ? totalSales / totalBills : 0;

  const lastSaleBill = activeBills
    .slice()
    .sort((a, b) => new Date(b.billDate) - new Date(a.billDate))[0];

  const lastPayment = PAYMENT_ROWS
    .filter((p) => up(p.status || (p.isReversed ? "REVERSED" : "ACTIVE")) !== "REVERSED")
    .slice()
    .sort(
      (a, b) =>
        new Date(b.paymentDate || b.date || b.createdAt) -
        new Date(a.paymentDate || a.date || a.createdAt)
    )[0];

  return {
    totalDebit: totalSales,
    totalCredit: totalPayments,
    balance: outstanding,
    totalBills,
    totalSales,
    totalPayments,
    totalProfit,
    totalCost,
    profitPercent,
    avgBill,
    lastSaleDate: lastSaleBill?.billDate,
    lastPaymentDate: lastPayment?.paymentDate || lastPayment?.date || lastPayment?.createdAt,
  };
}

  function updateDashboard() {
    const a = calculateAnalytics();

    $("#stat_balance").text(balanceLabel(a.balance));
    $("#stat_debit").text(money(a.totalDebit || a.totalSales));
    $("#stat_credit").text(money(a.totalCredit));
    $("#stat_profit").text(money(a.totalProfit));
    $("#stat_profit_percent").text(`${a.profitPercent.toFixed(2)}%`);
    $("#stat_total_bills").text(a.totalBills);
    $("#stat_avg_bill").text(money(a.avgBill));
    $("#stat_last_sale").text(daysSince(a.lastSaleDate));
    $("#stat_last_payment").text(daysSince(a.lastPaymentDate));

    updateRisk(a);
    updateOverview(a);
  }

  function updateRisk(a) {
    let risk = "LOW RISK";
    let cls = "risk-low";
    let action = "Party is healthy. Continue normal billing.";

    if (a.balance > 50000 && !a.lastPaymentDate) {
      risk = "HIGH RISK";
      cls = "risk-high";
      action = "Collect payment before giving more credit.";
    } else if (a.balance > 50000 || daysSince(a.lastPaymentDate).includes("days")) {
      risk = "MEDIUM RISK";
      cls = "risk-medium";
      action = "Follow up payment before next large bill.";
    }

    $("#creditRiskChip")
      .removeClass("risk-low risk-medium risk-high")
      .addClass(cls)
      .text(risk);

    $("#insight_payment_delay").text(
      `Last payment: ${daysSince(a.lastPaymentDate)}`
    );

    $("#insight_profitability").text(
      `Profit margin: ${a.profitPercent.toFixed(2)}%`
    );

    $("#insight_action").text(action);
  }

  function updateOverview(a) {
    $("#overview_buying_frequency").text(
      a.totalBills >= 10 ? "Regular buyer" : a.totalBills >= 3 ? "Occasional buyer" : "New / low activity"
    );

    $("#overview_payment_behaviour").text(
      a.balance <= 0 ? "Clear / advance balance" : a.balance > 50000 ? "High outstanding" : "Manageable outstanding"
    );

    $("#overview_best_month").text(calculateBestMonth());

    $("#overview_credit_recommendation").text(
      a.balance > 50000 ? "Hold fresh credit" : "Credit allowed with monitoring"
    );
  }

  function calculateBestMonth() {
    const monthMap = {};

    BILL_ROWS.forEach((b) => {
      if (up(b.status) === "CANCELLED") return;

      const d = new Date(b.billDate);
      if (Number.isNaN(d.getTime())) return;

      const key = d.toLocaleString("en-IN", {
        month: "short",
        year: "numeric",
      });

      monthMap[key] = (monthMap[key] || 0) + getBillAmount(b);
    });

    let best = "-";
    let max = 0;

    Object.entries(monthMap).forEach(([month, value]) => {
      if (value > max) {
        best = `${month} (${money(value)})`;
        max = value;
      }
    });

    return best;
  }

  function renderLedger() {
    const html = LEDGER_ROWS.map((x) => {
      const type = getType(x);
      const canReverse = up(type) === "ADJUSTMENT" && up(x.status) !== "REVERSED";

      return `
        <tr>
          <td>${fmtDate(getDate(x))}</td>
          <td>${typeBadge(type)}</td>
          <td>${safe(getRef(x))}</td>
          <td class="amount-debit">${getDebit(x) ? money(getDebit(x)) : "-"}</td>
          <td class="amount-credit">${getCredit(x) ? money(getCredit(x)) : "-"}</td>
          <td class="balance-amt">${balanceLabel(getBalance(x))}</td>
          <td>${safe(getNotes(x))}</td>
          <td>
            ${
              canReverse
                ? `<button class="btn btn-sm btn-outline-danger reverse-adjustment" data-id="${x._id}">
                    <i class="la la-undo"></i>
                  </button>`
                : "-"
            }
          </td>
        </tr>
      `;
    }).join("");

    $("#ledgerTable tbody").html(
      html || `<tr><td colspan="8" class="text-center text-muted">No ledger found</td></tr>`
    );
  }

  function renderBills() {
    const html = BILL_ROWS.map((b) => {
      const profit = getBillProfit(b);

      return `
        <tr>
          <td>${fmtDate(b.billDate)}</td>
          <td>${safe(b.billNo || b._id)}</td>
          <td>${statusBadge(b.status)}</td>
          <td>${getBillQty(b)}</td>
          <td><b>${money(getBillAmount(b))}</b></td>
          <td class="${profit >= 0 ? "amount-credit" : "amount-debit"}">${money(profit)}</td>
          <td>
            <button class="btn btn-sm btn-outline-brand open-bill" data-id="${b._id}">
              Open
            </button>
          </td>
        </tr>
      `;
    }).join("");

    $("#billsTable tbody").html(
      html || `<tr><td colspan="7" class="text-center text-muted">No bills found</td></tr>`
    );
  }

  function renderPayments() {
    const html = PAYMENT_ROWS.map((p) => {
      const status = up(p.status || (p.isReversed ? "REVERSED" : "ACTIVE"));
      const canReverse = status !== "REVERSED";

      return `
        <tr>
          <td>${fmtDate(p.paymentDate || p.date || p.createdAt)}</td>
          <td>${safe(p.mode || p.paymentMode || "-")}</td>
          <td class="amount-credit">${money(p.amount)}</td>
          <td>${safe(p.refNo || p.referenceNo || "-")}</td>
          <td>${statusBadge(status)}</td>
          <td>${safe(p.notes || p.note || "")}</td>
          <td>
            ${
              canReverse
                ? `<button class="btn btn-sm btn-outline-danger reverse-payment" data-id="${p._id}">
                    <i class="la la-undo"></i>
                  </button>`
                : "-"
            }
          </td>
        </tr>
      `;
    }).join("");

    $("#paymentsTable tbody").html(
      html || `<tr><td colspan="7" class="text-center text-muted">No payments found</td></tr>`
    );
  }

  function renderProducts() {
    const map = new Map();

    BILL_ROWS.forEach((b) => {
      if (up(b.status) === "CANCELLED") return;

      (b.lines || []).forEach((line) => {
        const key = `${line.articleName}_${line.brand}_${line.color}`;
        const qty = num(line.qty);
        const sales = qty * num(line.rate);
        const profit = qty * (num(line.rate) - num(line.cost));

        if (!map.has(key)) {
          map.set(key, {
            articleName: line.articleName,
            brand: line.brand,
            color: line.color,
            qty: 0,
            sales: 0,
            profit: 0,
          });
        }

        const item = map.get(key);
        item.qty += qty;
        item.sales += sales;
        item.profit += profit;
      });
    });

    const rows = Array.from(map.values()).sort((a, b) => b.sales - a.sales);

    const html = rows.map((x) => {
      const margin = x.sales > 0 ? (x.profit / x.sales) * 100 : 0;

      return `
        <tr>
          <td><b>${safe(x.articleName)}</b></td>
          <td>${safe(x.brand)}</td>
          <td>${safe(x.color)}</td>
          <td>${x.qty}</td>
          <td><b>${money(x.sales)}</b></td>
          <td class="${x.profit >= 0 ? "amount-credit" : "amount-debit"}">${money(x.profit)}</td>
          <td>${margin.toFixed(2)}%</td>
        </tr>
      `;
    }).join("");

    $("#productsTable tbody").html(
      html || `<tr><td colspan="7" class="text-center text-muted">No product data found</td></tr>`
    );
  }

  async function loadParty() {
    const r = await api(`${PARTY_API}/${PARTY_ID}`);
    PARTY = r.data || r;
    updatePartyInfo();
  }

  async function loadLedger() {
    const r = await api(`${LEDGER_API}?${buildLedgerQuery()}`);
    LEDGER_ROWS = r.data || [];
    renderLedger();
    updateDashboard();
  }

  async function loadBills() {
    const qs = new URLSearchParams();
    qs.set("partyId", PARTY_ID);
    qs.set("limit", "0");

    const r = await api(`${BILL_API}?${qs.toString()}`);
    BILL_ROWS = r.data || [];
    renderBills();
    renderProducts();
    updateDashboard();
  }

  async function loadPayments() {
    const qs = new URLSearchParams();
    qs.set("partyId", PARTY_ID);
    qs.set("limit", "0");

    const r = await api(`${PAYMENT_API}?${qs.toString()}`);
    PAYMENT_ROWS = r.data || [];
    renderPayments();
    updateDashboard();
  }

  async function refreshAll() {
    await loadParty();
    await Promise.all([loadLedger(), loadBills(), loadPayments()]);
    updateDashboard();
  }

  function resetPaymentForm() {
    $("#paymentForm")[0]?.reset();
    $("#payment_date").val(todayInput());
    $("#payment_mode").val("CASH");
  }

  function resetAdjustmentForm() {
    $("#adjustmentForm")[0]?.reset();
    $("#adjustment_date").val(todayInput());
    $("#adjustment_type").val("DEBIT");
  }

  function printableType(type) {
  let t = up(type);

  if (t === "SALE_BILL") return "BILL";
  if (t === "PAYMENT_RECEIVED") return "PAYMENT";
  if (t === "PAYMENT_REVERSED") return "PAYMENT REVERSED";
  if (t === "SALE_REVERSED") return "SALE REVERSED";
  if (t === "ADJUSTMENT") return "ADJUSTMENT";

  return t || "-";
}

function buildPrintableLedgerHtml() {
  const partyName = PARTY?.name || "Party";
  const partyPhone = PARTY?.phone || "-";
  const partyAddress = PARTY?.address || "-";

  const from = $("#filter_from").val();
  const to = $("#filter_to").val();

  const periodText =
    from || to
      ? `${from || "Start"} to ${to || "Today"}`
      : "Complete Statement";

  const analytics = calculateAnalytics();

  const rows = LEDGER_ROWS.map((x) => {
    return `
      <tr>
        <td>${fmtDate(getDate(x))}</td>
        <td>${printableType(getType(x))}</td>
        <td>${safe(getRef(x))}</td>
        <td class="right">${getDebit(x) ? money(getDebit(x)) : "-"}</td>
        <td class="right">${getCredit(x) ? money(getCredit(x)) : "-"}</td>
        <td class="right"><b>${balanceLabel(getBalance(x))}</b></td>
        <td>${safe(getNotes(x))}</td>
      </tr>
    `;
  }).join("");

  return `
<!doctype html>
<html>
<head>
  <title>${partyName} Ledger</title>
  <style>
    *{box-sizing:border-box}
    body{
      font-family:Arial,sans-serif;
      margin:0;
      padding:24px;
      color:#222;
      font-size:12px;
    }
    .page{max-width:900px;margin:0 auto}
    .header{
      display:flex;
      justify-content:space-between;
      border-bottom:3px solid #214a91;
      padding-bottom:12px;
      margin-bottom:18px;
    }
    h1{margin:0;font-size:24px;color:#214a91}
    h2{margin:6px 0 0;font-size:18px}
    .muted{color:#666}
    .summary{
      display:grid;
      grid-template-columns:repeat(4,1fr);
      gap:10px;
      margin:16px 0;
    }
    .card{
      border:1px solid #ddd;
      padding:10px;
      border-radius:6px;
    }
    .label{font-size:11px;color:#666;text-transform:uppercase}
    .value{font-size:16px;font-weight:bold;margin-top:4px}
    table{
      width:100%;
      border-collapse:collapse;
      margin-top:14px;
    }
    th{
      background:#f3f6fb;
      border:1px solid #d6dbe7;
      padding:8px;
      text-align:left;
    }
    td{
      border:1px solid #e1e5ef;
      padding:7px;
      vertical-align:top;
    }
    .right{text-align:right}
    .footer{
      margin-top:28px;
      display:flex;
      justify-content:space-between;
      font-size:11px;
      color:#555;
    }
    .sign{
      margin-top:40px;
      text-align:right;
      font-weight:bold;
    }
    @media print{
      @page{size:A4;margin:10mm}
      body{padding:0}
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <h1>Squalo Footwears</h1>
        <div class="muted">Party Ledger Statement</div>
      </div>
      <div style="text-align:right">
        <b>Generated:</b> ${fmtDate(new Date())}<br>
        <b>Period:</b> ${periodText}
      </div>
    </div>

    <h2>${partyName}</h2>
    <div class="muted">
      Phone: ${partyPhone}<br>
      Address: ${partyAddress}
    </div>

    <div class="summary">
      <div class="card">
        <div class="label">Outstanding</div>
        <div class="value">${balanceLabel(analytics.balance)}</div>
      </div>
      <div class="card">
        <div class="label">Total Sales</div>
        <div class="value">${money(analytics.totalSales)}</div>
      </div>
      <div class="card">
        <div class="label">Total Payments</div>
        <div class="value">${money(analytics.totalPayments)}</div>
      </div>
      <div class="card">
        <div class="label">Total Bills</div>
        <div class="value">${analytics.totalBills}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Ref</th>
          <th class="right">Debit</th>
          <th class="right">Credit</th>
          <th class="right">Balance</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${
          rows ||
          `<tr><td colspan="7" style="text-align:center">No ledger entries found</td></tr>`
        }
      </tbody>
    </table>

    <div class="footer">
      <div>This statement is system generated.</div>
      <div>For Squalo Footwears</div>
    </div>

    <div class="sign">
      Authorized Signatory
    </div>
  </div>
</body>
</html>
`;
}

function printStatement() {
  const html = buildPrintableLedgerHtml();

  const w = window.open("", "_blank");

  if (!w) {
    return Swal.fire("Error", "Please allow popups to print statement", "error");
  }

  w.document.open();
  w.document.write(html);
  w.document.close();

  setTimeout(() => {
    w.focus();
    w.print();
  }, 500);
}

  function bindEvents() {
    $("#filter_from, #filter_to, #filter_type").on("change", loadLedger);

    $("#btnClear").on("click", async function () {
      $("#filter_from").val("");
      $("#filter_to").val("");
      $("#filter_type").val("");
      await loadLedger();
    });

    $("#modalPayment").on("shown.bs.modal", resetPaymentForm);
    $("#modalAdjustment").on("shown.bs.modal", resetAdjustmentForm);
    $("#btnPrintStatement").on("click", printStatement);

    $("#paymentForm").on("submit", async function (e) {
      e.preventDefault();

      const payload = {
        partyId: PARTY_ID,
        amount: num($("#payment_amount").val()),
        paymentDate: $("#payment_date").val(),
        paymentMode: $("#payment_mode").val(),
        refNo: $("#payment_refNo").val() || "",
        notes: $("#payment_notes").val() || "",
      };

      if (payload.amount <= 0) {
        return Swal.fire("Error", "Enter valid amount", "error");
      }

      try {
        await api(PAYMENT_API, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        $("#modalPayment").modal("hide");
        toast("Payment added");
        await refreshAll();
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    });

    $("#adjustmentForm").on("submit", async function (e) {
      e.preventDefault();

      const payload = {
        partyId: PARTY_ID,
        adjustmentType: $("#adjustment_type").val(),
        amount: num($("#adjustment_amount").val()),
        entryDate: $("#adjustment_date").val(),
        notes: $("#adjustment_notes").val() || "",
      };
      console.log(payload)
      if (payload.amount <= 0) {
        return Swal.fire("Error", "Enter valid amount", "error");
      }

      try {
        await api(`${LEDGER_API}/adjustment`, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        $("#modalAdjustment").modal("hide");
        toast("Adjustment added");
        await refreshAll();
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    });

    $("#paymentsTable").on("click", ".reverse-payment", async function () {
      const id = $(this).data("id");

      const result = await Swal.fire({
        title: "Reverse payment?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Reverse",
      });

      if (!result.isConfirmed) return;

      try {
        await api(`${PAYMENT_API}/${id}/reverse`, { method: "POST" });
        toast("Payment reversed");
        await refreshAll();
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    });

    $("#ledgerTable").on("click", ".reverse-adjustment", async function () {
      const id = $(this).data("id");

      const result = await Swal.fire({
        title: "Reverse adjustment?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Reverse",
      });

      if (!result.isConfirmed) return;

      try {
        await api(`${LEDGER_API}/${id}/reverse`, { method: "POST" });
        toast("Adjustment reversed");
        await refreshAll();
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    });

    $("#billsTable").on("click", ".open-bill", function () {
      const id = $(this).data("id");
      window.location.href = `/su/footwear/billing?billId=${id}`;
    });
  }

  $(async function () {
    if (!PARTY_ID) {
      return Swal.fire("Error", "Party ID missing", "error");
    }

    bindEvents();

    try {
      await refreshAll();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  });
})();