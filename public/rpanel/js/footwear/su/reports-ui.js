/* global $, Swal */

(function () {
  const BASE = "/apis/footwears";

  const REPORT_API = `${BASE}/reports`;
  const STORE_API = `${BASE}/stores`;
  const CATEGORY_API = `${BASE}/articles/categories`;

  let REPORT_DATA = {
    summary: {},
    topProducts: [],
    deadStock: [],
    brandAnalysis: [],
    partyRisk: [],
    collections: [],
    profitAnalysis: [],
    catalogue: [],
  };

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

  function percent(v) {
    return `${num(v).toFixed(2)}%`;
  }

  function fmtDate(v) {
    if (!v) return "-";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-IN");
  }

  function daysText(v) {
    const n = num(v);
    if (!n) return "0 days";
    if (n === 1) return "1 day";
    return `${n} days`;
  }

  function setCurrentMonth() {
    const now = new Date();

    const first = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);

    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    $("#filterFrom").val(first);
    $("#filterTo").val(last);
    $("#filterPeriod").val("month");
  }

  function applyPeriod(value) {
    const now = new Date();
    let from = "";
    let to = now.toISOString().slice(0, 10);

    if (value === "today") {
      from = to;
    }

    if (value === "7days") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      from = d.toISOString().slice(0, 10);
    }

    if (value === "30days") {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      from = d.toISOString().slice(0, 10);
    }

    if (value === "month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      from = first.toISOString().slice(0, 10);
      to = last.toISOString().slice(0, 10);
    }

    if (value === "custom") return;

    $("#filterFrom").val(from);
    $("#filterTo").val(to);
  }

  function buildQuery() {
    const qs = new URLSearchParams();

    const storeId = $("#filterStore").val();
    const categoryGroup = $("#filterCategoryGroup").val();
    const category = $("#filterCategory").val();
    const from = $("#filterFrom").val();
    const to = $("#filterTo").val();
    const q = $("#generalSearch").val();

    if (storeId) qs.set("storeId", storeId);
    if (categoryGroup) qs.set("categoryGroup", categoryGroup);
    if (category) qs.set("category", category);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (q) qs.set("q", q);

    return qs.toString();
  }

  function riskChip(risk) {
    const r = up(risk || "LOW");

    if (r.includes("HIGH") || r.includes("BLOCK")) {
      return `<span class="risk-chip risk-high">${safe(risk || "HIGH")}</span>`;
    }

    if (r.includes("MEDIUM")) {
      return `<span class="risk-chip risk-medium">${safe(risk || "MEDIUM")}</span>`;
    }

    return `<span class="risk-chip risk-low">${safe(risk || "LOW")}</span>`;
  }

  function actionButton(label, cls = "btn-outline-brand", href = "#") {
    return `
      <a class="btn btn-sm ${cls}" href="${href}">
        ${label}
      </a>
    `;
  }

  async function loadStores() {
    try {
      const r = await api(STORE_API);
      const items = r.data || [];

      $("#filterStore").html(
        `<option value="">All Stores</option>` +
          items
            .map((x) => {
              const label = safe(x.name || x.storeName || x.code || x._id);
              return `<option value="${x._id}">${label}</option>`;
            })
            .join("")
      );
    } catch (err) {
      $("#filterStore").html(`<option value="">All Stores</option>`);
    }
  }

  async function loadCategories() {
    try {
      const r = await api(CATEGORY_API);
      const map = r.data || r || {};

      $("#filterCategoryGroup").on("change", function () {
        const group = up($(this).val());
        const list = map[group] || [];

        $("#filterCategory").html(
          `<option value="">All Categories</option>` +
            list.map((x) => `<option value="${up(x)}">${up(x)}</option>`).join("")
        );
      });
    } catch (err) {
      // keep default categories empty
    }
  }

  async function fetchReport(endpoint) {
    const qs = buildQuery();
    const url = qs ? `${REPORT_API}/${endpoint}?${qs}` : `${REPORT_API}/${endpoint}`;
    const r = await api(url);
    return r.data || r;
  }

  async function loadAllReports() {
    Swal.fire({
      title: "Loading reports...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const [
        summary,
        topProducts,
        deadStock,
        brandAnalysis,
        partyRisk,
        collections,
        profitAnalysis,
        catalogue,
      ] = await Promise.all([
        fetchReport("dashboard-summary"),
        fetchReport("top-products"),
        fetchReport("dead-stock"),
        fetchReport("brand-analysis"),
        fetchReport("party-risk"),
        fetchReport("collections"),
        fetchReport("profit-analysis"),
        fetchReport("catalogue"),
      ]);

      REPORT_DATA = {
        summary: summary || {},
        topProducts: topProducts || [],
        deadStock: deadStock || [],
        brandAnalysis: brandAnalysis || [],
        partyRisk: partyRisk || [],
        collections: collections || [],
        profitAnalysis: profitAnalysis || [],
        catalogue: catalogue || [],
      };

      renderAll();
      Swal.close();
    } catch (err) {
      Swal.close();
      Swal.fire("Reports Error", err.message, "error");
    }
  }

  function renderAll() {
    renderSummary();
    renderInsights();
    renderTopProducts();
    renderDeadStock();
    renderBrandAnalysis();
    renderPartyRisk();
    renderCollections();
    renderProfitAnalysis();
    renderCatalogue();
  }

  function renderSummary() {
    const s = REPORT_DATA.summary || {};

    $("#stat_today_sales").text(money(s.todaySales));
    $("#stat_today_collection").text(money(s.todayCollection));
    $("#stat_today_profit").text(money(s.todayProfit));
    $("#stat_today_qty").text(num(s.todayQty));
    $("#stat_total_outstanding").text(money(s.totalOutstanding));
    $("#stat_active_parties").text(num(s.activeParties));

    $("#stat_stock_qty").text(num(s.stockQty));
    $("#stat_stock_value").text(money(s.stockValue));
    $("#stat_dead_stock_value").text(money(s.deadStockValue));
    $("#stat_catalogue_ready").text(percent(s.catalogueReadyPercent));
  }

  function renderInsights() {
    const top = REPORT_DATA.topProducts[0];
    const dead = REPORT_DATA.deadStock[0];
    const party = REPORT_DATA.partyRisk[0];
    const brand = REPORT_DATA.brandAnalysis[0];

    $("#insight_fast_product").text(
      top
        ? `Fast product: ${safe(top.brand)} ${safe(top.articleName)} ${safe(top.color)} sold ${num(top.qtySold)} pairs.`
        : "No fast product found for selected period."
    );

    $("#insight_dead_stock").text(
      dead
        ? `Dead stock alert: ${safe(dead.brand)} ${safe(dead.articleName)} has ${num(dead.stockQty)} pairs blocked.`
        : "No dead stock detected."
    );

    $("#insight_party_risk").text(
      party
        ? `Collection follow-up: ${safe(party.partyName)} has outstanding ${money(party.outstanding)}.`
        : "No party risk found."
    );

    $("#insight_margin").text(
      brand
        ? `Best brand margin: ${safe(brand.brand)} at ${percent(brand.marginPercent)}.`
        : "No margin data available."
    );

    $("#insight_reorder").text(
      top
        ? `Reorder check: review fresh stock for ${safe(top.articleName)} if current stock is low.`
        : "No reorder suggestion yet."
    );

    $("#ai_suggestion_1").text(
      top
        ? `Push ${safe(top.articleName)} catalogue to active retailers.`
        : "Load sales data to get product suggestions."
    );

    $("#ai_suggestion_2").text(
      dead
        ? `Create discount/clearance offer for ${safe(dead.articleName)}.`
        : "No slow stock action needed."
    );

    $("#ai_suggestion_3").text(
      party
        ? `Call ${safe(party.partyName)} for payment follow-up today.`
        : "No high-risk collection follow-up found."
    );
  }

  function renderTopProducts() {
    const html = (REPORT_DATA.topProducts || [])
      .map((x, i) => {
        return `
          <tr>
            <td><b>#${i + 1}</b></td>
            <td>${safe(x.brand)}</td>
            <td><b>${safe(x.articleName)}</b></td>
            <td>${safe(x.color)}</td>
            <td>${safe(x.categoryGroup || x.category || "-")}</td>
            <td>${num(x.qtySold)}</td>
            <td><b>${money(x.sales)}</b></td>
            <td class="${num(x.profit) >= 0 ? "amount-profit" : "amount-loss"}">${money(x.profit)}</td>
            <td>${percent(x.marginPercent)}</td>
            <td>${actionButton("View Stock", "btn-outline-brand", "/su/footwear/stockledger")}</td>
          </tr>
        `;
      })
      .join("");

    $("#topProductsTable tbody").html(
      html || `<tr><td colspan="10" class="text-center text-muted">No top products found</td></tr>`
    );
  }

  function renderDeadStock() {
    const html = (REPORT_DATA.deadStock || [])
      .map((x) => {
        return `
          <tr>
            <td>${safe(x.brand)}</td>
            <td><b>${safe(x.articleName)}</b></td>
            <td>${safe(x.color)}</td>
            <td>${safe(x.categoryGroup || x.category || "-")}</td>
            <td>${num(x.stockQty)}</td>
            <td><b>${money(x.stockValue)}</b></td>
            <td>${fmtDate(x.lastSaleDate)}</td>
            <td>${daysText(x.daysUnsold)}</td>
            <td>${riskChip(x.risk || "MEDIUM")}</td>
            <td>${actionButton("Clearance", "btn-outline-danger", "#")}</td>
          </tr>
        `;
      })
      .join("");

    $("#deadStockTable tbody").html(
      html || `<tr><td colspan="10" class="text-center text-muted">No dead stock found</td></tr>`
    );
  }

  function renderBrandAnalysis() {
    const html = (REPORT_DATA.brandAnalysis || [])
      .map((x) => {
        return `
          <tr>
            <td><b>${safe(x.brand)}</b></td>
            <td>${money(x.sales)}</td>
            <td class="${num(x.profit) >= 0 ? "amount-profit" : "amount-loss"}">${money(x.profit)}</td>
            <td>${percent(x.marginPercent)}</td>
            <td>${num(x.stockQty)}</td>
            <td>${money(x.stockValue)}</td>
            <td>${money(x.deadStockValue)}</td>
            <td>${riskChip(x.performance || "LOW")}</td>
          </tr>
        `;
      })
      .join("");

    $("#brandAnalysisTable tbody").html(
      html || `<tr><td colspan="8" class="text-center text-muted">No brand analysis found</td></tr>`
    );
  }

  function renderPartyRisk() {
    const html = (REPORT_DATA.partyRisk || [])
      .map((x) => {
        return `
          <tr>
            <td><b>${safe(x.partyName)}</b></td>
            <td>${safe(x.phone)}</td>
            <td class="amount-loss">${money(x.outstanding)}</td>
            <td>${money(x.totalBusiness)}</td>
            <td>${fmtDate(x.lastSaleDate)}</td>
            <td>${fmtDate(x.lastPaymentDate)}</td>
            <td>${riskChip(x.risk)}</td>
            <td>${actionButton("Open", "btn-outline-brand", `/su/footwear/parties/${x.partyId}`)}</td>
          </tr>
        `;
      })
      .join("");

    $("#partyRiskTable tbody").html(
      html || `<tr><td colspan="8" class="text-center text-muted">No party risk found</td></tr>`
    );
  }

  function renderCollections() {
    const html = (REPORT_DATA.collections || [])
      .map((x) => {
        return `
          <tr>
            <td><b>${safe(x.partyName)}</b></td>
            <td class="amount-loss">${money(x.pending)}</td>
            <td>${fmtDate(x.lastBillDate)}</td>
            <td>${fmtDate(x.lastPaymentDate)}</td>
            <td>${daysText(x.daysPending)}</td>
            <td>${safe(x.suggestion || "Follow up payment")}</td>
            <td>${actionButton("Open", "btn-outline-brand", `/su/footwear/parties/${x.partyId}`)}</td>
          </tr>
        `;
      })
      .join("");

    $("#collectionsTable tbody").html(
      html || `<tr><td colspan="7" class="text-center text-muted">No collection data found</td></tr>`
    );
  }

  function renderProfitAnalysis() {
    const html = (REPORT_DATA.profitAnalysis || [])
      .map((x) => {
        return `
          <tr>
            <td>${safe(x.brand)}</td>
            <td><b>${safe(x.articleName)}</b></td>
            <td>${safe(x.color)}</td>
            <td>${money(x.mrp)}</td>
            <td>${money(x.avgCost)}</td>
            <td>${money(x.avgSaleRate)}</td>
            <td class="${num(x.profitPerPair) >= 0 ? "amount-profit" : "amount-loss"}">${money(x.profitPerPair)}</td>
            <td>${percent(x.marginPercent)}</td>
            <td>${num(x.soldQty)}</td>
          </tr>
        `;
      })
      .join("");

    $("#profitTable tbody").html(
      html || `<tr><td colspan="9" class="text-center text-muted">No profit data found</td></tr>`
    );
  }

  function renderCatalogue() {
    const list = REPORT_DATA.catalogue || [];

    const total = list.length;
    const withImages = list.filter((x) => x.hasImage).length;
    const missing = total - withImages;
    const coverage = total ? (withImages / total) * 100 : 0;

    $("#cat_with_images").text(withImages);
    $("#cat_missing_images").text(missing);
    $("#cat_export_ready").text(withImages);
    $("#cat_image_coverage").text(percent(coverage));

    const html = list
      .map((x) => {
        return `
          <tr>
            <td>${safe(x.brand)}</td>
            <td><b>${safe(x.articleName)}</b></td>
            <td>${safe(x.color)}</td>
            <td>${num(x.stockQty)}</td>
            <td>${x.hasImage ? riskChip("READY") : riskChip("HIGH")}</td>
            <td>${x.hasImage ? "Catalogue Ready" : "Image Missing"}</td>
            <td>${actionButton("Stock", "btn-outline-brand", "/su/footwear/stockledger")}</td>
          </tr>
        `;
      })
      .join("");

    $("#catalogueTable tbody").html(
      html || `<tr><td colspan="7" class="text-center text-muted">No catalogue data found</td></tr>`
    );
  }
function buildPartyOutstandingPrintHtml() {
  const rows = (REPORT_DATA.partyRisk || [])
    .map((x, i) => {
      return `
        <tr>
          <td>${i + 1}</td>
          <td><b>${safe(x.partyName)}</b></td>
          <td class="right"><b>${money(x.outstanding)}</b></td>
          <td>${fmtDate(x.lastSaleDate)}</td>
          <td>${fmtDate(x.lastPaymentDate)}</td>
        </tr>
      `;
    })
    .join("");

  const totalOutstanding = (REPORT_DATA.partyRisk || []).reduce(
    (s, x) => s + num(x.outstanding),
    0
  );

  return `
<!doctype html>
<html>
<head>
  <title>Party Outstanding Report</title>
  <style>
    body{font-family:Arial,sans-serif;padding:24px;color:#222;font-size:13px}
    .head{display:flex;justify-content:space-between;border-bottom:3px solid #1e40af;padding-bottom:12px;margin-bottom:18px}
    h2{margin:0;color:#1e40af}
    table{width:100%;border-collapse:collapse;margin-top:15px}
    th{background:#f1f5f9;border:1px solid #cbd5e1;padding:8px;text-align:left}
    td{border:1px solid #e2e8f0;padding:8px}
    .right{text-align:right}
    .total{margin-top:15px;text-align:right;font-size:16px;font-weight:bold}
    @media print{@page{size:A4;margin:10mm}body{padding:0}}
  </style>
</head>
<body>
  <div class="head">
    <div>
      <h2>Squalo Footwears</h2>
      <div>Party Outstanding Report</div>
    </div>
    <div>
      <b>Generated:</b> ${fmtDate(new Date())}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Party</th>
        <th class="right">Outstanding</th>
        <th>Last Sale</th>
        <th>Last Payment</th>
      </tr>
    </thead>
    <tbody>
      ${
        rows ||
        `<tr><td colspan="5" style="text-align:center">No outstanding parties found</td></tr>`
      }
    </tbody>
  </table>

  <div class="total">
    Total Outstanding: ${money(totalOutstanding)}
  </div>
</body>
</html>
`;
}

function exportExtDiscountSales() {
  const params = new URLSearchParams();

  const storeId = $("#filterStore").val();
  const from = $("#filterFrom").val();
  const to = $("#filterTo").val();

  if (storeId) {
    params.set("storeId", storeId);
  }

  if (from) {
    params.set("from", from);
  }

  if (to) {
    params.set("to", to);
  }

  const query = params.toString();

  const exportUrl =
    `${REPORT_API}/ext-dis-sales/export` +
    (query ? `?${query}` : "");

  window.location.href = exportUrl;
}

  function bindEvents() {
    $("#filterPeriod").on("change", function () {
      applyPeriod($(this).val());
    });

    $("#btnApplyFilters").on("click", loadAllReports);
    $("#btnRefreshReports").on("click", loadAllReports);
    $("#btnExportExtDis").on("click", function () {
     exportExtDiscountSales();
    });
    $("#btnResetFilters").on("click", async function () {
      $("#filterStore").val("");
      $("#filterCategoryGroup").val("");
      $("#filterCategory").html(`<option value="">All Categories</option>`);
      $("#generalSearch").val("");
      setCurrentMonth();
      await loadAllReports();
    });

    $("#btnPrintReports").on("click", function () {
  const html = buildPartyOutstandingPrintHtml();

  const w = window.open("", "_blank");

  if (!w) {
    return Swal.fire("Error", "Please allow popups to print report", "error");
  }

  w.document.open();
  w.document.write(html);
  w.document.close();

  setTimeout(() => {
    w.focus();
    w.print();
  }, 500);
});

    $("#btnExportReports").on("click", function () {
      const blob = new Blob([JSON.stringify(REPORT_DATA, null, 2)], {
        type: "application/json",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = `squalo-reports-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    });

    $("#generalSearch").on("keydown", function (e) {
      if (e.key === "Enter") {
        loadAllReports();
      }
    });
  }

  $(async function () {
    setCurrentMonth();
    await loadStores();
    await loadCategories();
    bindEvents();
    await loadAllReports();
  });
})();