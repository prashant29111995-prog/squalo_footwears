/* global $, Swal */

(function () {
  const API_BASE = "/apis/footwears/stock-ledger";
  const STORE_API = "/apis/footwears/stores";
  const ARTICLE_API = "/apis/footwears/articles";
  const MEDIA_API = "/apis/footwears/article-media";
const CATEGORY_API = "/apis/footwears/articles/categories";
  let BALANCE_CACHE = [];
  let PAGE = 1;
  let PAGE_SIZE = 25;
  let SEARCH_TIMER = null;
let MEDIA_MAP = new Map();
  async function api(url, opt = {}) {
    const method = (opt.method || "GET").toUpperCase();

    let r, j;
    try {
      r = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...opt,
      });
      j = await r.json().catch(() => ({}));
    } catch (err) {
      console.error("[NETWORK ERROR]", { url, method, err });
      throw new Error("Network error");
    }

    if (!r.ok) {
      console.error("[API ERROR]", { url, method, status: r.status, response: j });
      throw new Error(j?.message || `API error ${r.status}`);
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
    const n = num(v);
    return `₹${n.toFixed(2)}`;
  }

  function fmtDate(v) {
    if (!v) return "-";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("en-IN");
  }

  function oid(v) {
    if (!v) return "";
    if (typeof v === "string") return v;
    if (typeof v === "object" && v._id) return String(v._id);
    return "";
  }

  function qtyBadge(v) {
    const n = num(v);
    if (n > 0) return `<span class="badge badge-success">+${n}</span>`;
    if (n < 0) return `<span class="badge badge-danger">${n}</span>`;
    return `<span class="badge badge-secondary">0</span>`;
  }

  function txnBadge(type) {
    const t = up(type);

    const map = {
      PURCHASE_IN: "success",
      OPENING: "primary",
      SALE: "danger",
      SALE_RETURN: "success",
      TRANSFER_IN: "info",
      TRANSFER_OUT: "warning",
      DAMAGE: "danger",
      WHOLESALE_OUT: "danger",
      AUDIT_ADJUSTMENT: "dark",
    };

    return `<span class="badge badge-${map[t] || "light"}">${safe(t)}</span>`;
  }

  function toast(msg) {
    Swal.fire({
      icon: "success",
      title: msg,
      timer: 1200,
      showConfirmButton: false,
    });
  }

  function storeLabel(store, fallback) {
    if (store) return safe(store.name || store.storeName || store.code || store._id);
    return safe(fallback || "-");
  }

  function buildQuery(extra = {}) {
    const params = new URLSearchParams();
    const brand = $("#filter_brand").val();
    const articleName = $("#filter_article").val();
    const color = $("#filter_color").val();
    const q = $("#generalSearch").val();
    const categoryGroup = $("#filter_categoryGroup").val();
    const category = $("#filter_category").val();

    if (categoryGroup) params.set("categoryGroup", categoryGroup);
    if (category) params.set("category", category);
    if (brand) params.set("brand", up(brand));
    if (articleName) params.set("articleName", articleName);
    if (color) params.set("color", up(color));
    if (q) params.set("q", q);

    Object.entries(extra).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params.set(k, v);
    });

    return params.toString();
  }

  async function loadStores() {
    const r = await api(STORE_API);
    const stores = r.data || r || [];

    const filterHtml =
      `<option value="">All Stores</option>` +
      stores
        .map((s) => {
          const label = safe(s.code || s.name || s.storeName || s._id);
          return `<option value="${s._id}">${label}</option>`;
        })
        .join("");

    const createHtml =
      `<option value="">Select Store</option>` +
      stores
        .map((s) => {
          const label = safe(s.code || s.name || s.storeName || s._id);
          return `<option value="${s._id}">${label}</option>`;
        })
        .join("");

    $("#filter_store").html(filterHtml);
    $("#ledger_storeId").html(createHtml);
  }
let CATEGORY_MAP = {};

async function loadCategories() {
  try {
    const r = await api(CATEGORY_API);
    CATEGORY_MAP = r.data || r || {};
  } catch (err) {
    CATEGORY_MAP = {};
  }
}

function populateCategoryFilter(group) {
  const categories = CATEGORY_MAP[group] || [];

  $("#filter_category").html(
    `<option value="">All Categories</option>` +
      categories.map((x) => `<option value="${up(x)}">${up(x)}</option>`).join("")
  );
}
  function initArticleSearch() {
    const $el = $("#ledger_articleId");

    if ($el.hasClass("select2-hidden-accessible")) {
      $el.select2("destroy");
    }

    $el.html('<option value="">Search Article</option>');

    $el.select2({
      width: "100%",
      dropdownParent: $("#modalLedgerCreate"),
      placeholder: "Search article...",
      minimumInputLength: 1,
      ajax: {
        delay: 250,
        transport: async function (params, success, failure) {
          try {
            const term = (params.data && params.data.term) || "";
            const r = await api(`${ARTICLE_API}?q=${encodeURIComponent(term)}&limit=20`);
            const items = r.data || r || [];

            success({
              results: items.map((x) => ({
                id: x._id,
                text: `${safe(x.brand)} - ${safe(x.articleName || x.name)}`,
                brand: safe(x.brand),
                articleName: safe(x.articleName || x.name),
              })),
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

  function updateSummary(summary) {
    $("#sum_totalLines").text(num(summary.netQty));
    $("#sum_positive").text(num(summary.totalIn));
    $("#sum_negative").text(num(summary.totalOut));
    $("#sum_moves").text(num(summary.totalMoves));
  }

  async function loadSummary() {
    const qs = buildQuery();
    const r = await api(`${API_BASE}/summary${qs ? `?${qs}` : ""}`);
    updateSummary(r.data || {});
  }

  async function loadBalance() {
    $("#balanceBody").html(`<tr><td colspan="10" class="text-center text-muted">Loading...</td></tr>`);

    const qs = buildQuery();
    const r = await api(`${API_BASE}/balance${qs ? `?${qs}` : ""}`);

    BALANCE_CACHE = r.data || [];
await loadMediaStatusForRows(BALANCE_CACHE);
PAGE = 1;
renderBalance();
  }

  function slicePage(rows) {
    const start = (PAGE - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }

  function renderPager(total) {
    const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
    PAGE = Math.min(Math.max(PAGE, 1), totalPages);

    const start = total === 0 ? 0 : (PAGE - 1) * PAGE_SIZE + 1;
    const end = Math.min(PAGE * PAGE_SIZE, total);

    $("#pagerInfo").text(`Showing ${start}-${end} of ${total}`);

    let html = "";

    html += `<li class="page-item ${PAGE <= 1 ? "disabled" : ""}">
      <a class="page-link" href="#" data-page="${PAGE - 1}">Prev</a>
    </li>`;

    const maxButtons = 7;
    let startPage = Math.max(PAGE - 3, 1);
    let endPage = Math.min(startPage + maxButtons - 1, totalPages);
    startPage = Math.max(endPage - maxButtons + 1, 1);

    for (let p = startPage; p <= endPage; p++) {
      html += `<li class="page-item ${PAGE === p ? "active" : ""}">
        <a class="page-link" href="#" data-page="${p}">${p}</a>
      </li>`;
    }

    html += `<li class="page-item ${PAGE >= totalPages ? "disabled" : ""}">
      <a class="page-link" href="#" data-page="${PAGE + 1}">Next</a>
    </li>`;

    $("#pagerNav").html(html);
  }
async function loadMediaStatusForRows(rows) {
  MEDIA_MAP = new Map();

  const availableRows = rows.filter((x) => Number(x.balanceQty || 0) > 0);

  if (!availableRows.length) return;

  const payload = {
    items: availableRows.map((x) => ({
      articleId: oid(x.articleId) || x.articleId,
      brand: x.brand,
      articleName: x.articleName,
      color: x.color,
      categoryGroup: x.categoryGroup,
      category: x.category,
      mrp: x.mrp,
      balanceQty: x.balanceQty,
    })),
  };

  const r = await fetch(`${MEDIA_API}/export-catalogue-json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const j = await r.json().catch(() => ({}));

  if (!r.ok) return;

  (j.data || []).forEach((x) => {
    MEDIA_MAP.set(`${x.articleId}_${up(x.color)}`, x);
  });
}
  function renderBalance() {
    const rows = slicePage(BALANCE_CACHE);

    const html = rows
      .map((x) => {
        const store = storeLabel(x.store, x.storeId);
        const mrp = x.mrp ? money(x.mrp) : "-";
        const cost = x.lastCost ? money(x.lastCost) : "-";

       const stockValue = num(x.balanceQty) * num(x.lastCost);

      return `
        <tr>
          <td>${safe(x.brand)}</td>
          <td>
            <b>${safe(x.articleName)}</b>
            <div class="text-muted" style="font-size:11px;">${safe(x.articleId)}</div>
          </td>
          <td>
            <span class="badge badge-light">${safe(x.categoryGroup || "-")}</span>
            <div class="text-muted" style="font-size:11px;">${safe(x.category || "-")}</div>
          </td>
          <td>${safe(x.color)}</td>
          <td>${qtyBadge(x.balanceQty)}</td>
          <td>${x.mrp ? money(x.mrp) : "-"}</td>
          <td><b>${money(stockValue)}</b></td>
          <td>${safe(x.moves || 0)}</td>
         ${(() => {
  const key = `${safe(oid(x.articleId) || x.articleId)}_${up(x.color)}`;
  const media = MEDIA_MAP.get(key);

  if (media && media.hasImage) {
    return `
      <td>
        <div class="d-flex align-items-center" style="gap:8px;">

          <img
            src="${media.imageUrl}"
            style="
              width:42px;
              height:42px;
              object-fit:cover;
              border-radius:6px;
              border:1px solid #ddd;
            "
          >

          <button
            class="btn btn-sm btn-icon btn-outline-danger deleteMedia"
            data-media-id="${media.mediaId}"
            title="Delete Images">

            <i class="la la-trash"></i>
          </button>

          <button
            class="btn btn-sm btn-icon btn-outline-primary manageMedia"
            data-article-id="${safe(oid(x.articleId) || x.articleId)}"
            data-article="${safe(x.articleName)}"
            data-brand="${safe(x.brand)}"
            data-color="${safe(x.color)}"
            title="Manage Images">

            <i class="la la-image"></i>
          </button>

        </div>
      </td>
    `;
  }

  return `
    <td>
      <button
        class="btn btn-sm btn-icon btn-outline-success manageMedia"
        data-article-id="${safe(oid(x.articleId) || x.articleId)}"
        data-article="${safe(x.articleName)}"
        data-brand="${safe(x.brand)}"
        data-color="${safe(x.color)}"
        title="Upload Images">

        <i class="la la-upload"></i>
      </button>
    </td>
  `;
})()}

<td class="sticky-actions">
  <button class="btn btn-sm btn-outline-info viewMoves"
    data-store-id="${safe(oid(x.storeId) || x.storeId)}"
    data-article-id="${safe(oid(x.articleId) || x.articleId)}"
    data-article="${safe(x.articleName)}"
    data-color="${safe(x.color)}">
    Moves
  </button>
</td>
        </tr>
      `;
      })
      .join("");

    $("#balanceBody").html(
      html || `<tr><td colspan="10" class="text-center text-muted">No balance found</td></tr>`
    );

    renderPager(BALANCE_CACHE.length);
  }

  async function openMovesModal(row) {
    const qs = buildQuery({
      storeId: row.storeId,
      articleId: row.articleId,
      color: row.color,
      all: 1,
    });

    $("#movesMeta").text(`${row.article} / ${row.color}`);
    $("#movesBody").html(`<tr><td colspan="7" class="text-center text-muted">Loading...</td></tr>`);
    $("#modalMoves").modal("show");

    const r = await api(`${API_BASE}?${qs}`);
    const moves = r.data || [];

    const html = moves
      .map((x) => {
        const store = storeLabel(x.store, x.storeId);
        const isSystem = ["SALE", "PURCHASE_IN"].includes(up(x.txnType));

        return `
          <tr>
            <td>${fmtDate(x.txnAt || x.createdAt)}</td>
            <td>${store}</td>
            <td>${txnBadge(x.txnType)}</td>
            <td>${qtyBadge(x.qtyDelta)}</td>
            <td>${safe(x.balanceAfter ?? "-")}</td>
            <td>${safe(x.ref?.documentNo || "")}</td>
            <td>${safe(x.ref?.note || "")}</td>
            <td>
              ${
                isSystem
                  ? `<span class="text-muted">Locked</span>`
                  : `<button class="btn btn-sm btn-outline-danger moveDel" data-id="${x._id}">Delete</button>`
              }
            </td>
          </tr>
        `;
      })
      .join("");

    $("#movesBody").html(
      html || `<tr><td colspan="8" class="text-center text-muted">No moves found</td></tr>`
    );
  }

  async function refreshAll() {
    await loadSummary();
    await loadBalance();
  }

  function resetCreateForm(form) {
    form.reset();

    $("#ledger_articleId").val(null).trigger("change");
    $("#ledger_brand").val("");
    $("#ledger_articleName").val("");
  }
function getFilterLabel() {
  const parts = [];

  const group = $("#filter_categoryGroup").val();
  const category = $("#filter_category").val();
  const brand = $("#filter_brand").val();
  const article = $("#filter_article").val();
  const color = $("#filter_color").val();
  const search = $("#generalSearch").val();

  if (group) parts.push(`Group: ${group}`);
  if (category) parts.push(`Category: ${category}`);
  if (brand) parts.push(`Brand: ${brand}`);
  if (article) parts.push(`Article: ${article}`);
  if (color) parts.push(`Color: ${color}`);
  if (search) parts.push(`Search: ${search}`);

  return parts.length ? parts.join(" | ") : "All available stock";
}

function buildPrintableStockHtml() {
  const rows = BALANCE_CACHE.filter((x) => Number(x.balanceQty || 0) > 0);

  const totalQty = rows.reduce((s, x) => s + num(x.balanceQty), 0);
  const totalValue = rows.reduce(
    (s, x) => s + num(x.balanceQty) * num(x.lastCost),
    0
  );

  const bodyRows = rows
    .map((x, i) => {
      const stockValue = num(x.balanceQty) * num(x.lastCost);

      return `
        <tr>
          <td>${i + 1}</td>
          <td>${safe(x.brand)}</td>
          <td>${safe(x.articleName)}</td>
          <td>${safe(x.categoryGroup || "-")} / ${safe(x.category || "-")}</td>
          <td>${safe(x.color)}</td>
          <td class="right">${num(x.mrp).toFixed(2)}</td>
          <td class="right">${num(x.balanceQty)}</td>
          <td class="audit-col"></td>
          <td class="audit-col"></td>
        </tr>
      `;
    })
    .join("");

  return `
<!doctype html>
<html>
<head>
  <title>Stock Audit List</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      color: #111;
      padding: 18px;
      font-size: 11px;
    }
    .top {
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      border-bottom:2px solid #111;
      padding-bottom:10px;
      margin-bottom:10px;
    }
    h2 { margin:0; font-size:20px; }
    .muted { color:#555; font-size:11px; margin-top:4px; }
    table {
      width:100%;
      border-collapse:collapse;
      margin-top:10px;
    }
    th, td {
      border:1px solid #555;
      padding:5px;
      vertical-align:top;
    }
    th {
      background:#f1f1f1;
      font-weight:700;
    }
    .right { text-align:right; }
    .summary {
      margin-top:8px;
      font-weight:700;
    }
    .audit-col {
      width:70px;
      height:22px;
    }
    .footer {
      margin-top:30px;
      display:flex;
      justify-content:space-between;
    }
    .sign {
      border-top:1px solid #111;
      width:180px;
      text-align:center;
      padding-top:6px;
    }
    @media print {
      body { padding:0; }
      @page { size: A4 landscape; margin: 10mm; }
    }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <h2>Squalo Footwears - Stock Audit List</h2>
      <div class="muted">${getFilterLabel()}</div>
      <div class="muted">Generated: ${new Date().toLocaleString("en-IN")}</div>
    </div>
    <div>
      <strong>Total Articles:</strong> ${rows.length}<br>
      <strong>Total Qty:</strong> ${totalQty}<br>
      <strong>Stock Value:</strong> ₹${totalValue.toFixed(2)}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Brand</th>
        <th>Article</th>
        <th>Category</th>
        <th>Color</th>
        <th>MRP</th>
        <th>System Qty</th>
        <th>Physical Qty</th>
        <th>Remark</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || `<tr><td colspan="10" style="text-align:center">No stock found</td></tr>`}
    </tbody>
  </table>

  <div class="footer">
    <div class="sign">Checked By</div>
    <div class="sign">Verified By</div>
    <div class="sign">Manager Signature</div>
  </div>
</body>
</html>
  `;
}

function printStockList() {
  if (!BALANCE_CACHE.length) {
    return Swal.fire("No stock", "No available stock list to print", "warning");
  }

  const html = buildPrintableStockHtml();
  const w = window.open("", "_blank", "width=1100,height=750");

  if (!w) {
    return Swal.fire("Popup blocked", "Allow popups to print stock list", "warning");
  }

  w.document.open();
  w.document.write(html);
  w.document.close();

  w.onload = function () {
    w.focus();
    w.print();
  };
}

async function loadMediaGallery(articleId, color) {
  const r = await api(
    `${MEDIA_API}?articleId=${articleId}&color=${encodeURIComponent(color)}`
  );

  const item = (r.data || [])[0];

  if (!item) {
    $("#mediaGallery").html(`
      <div class="col-md-12">
        <div class="alert alert-light">
          No images uploaded
        </div>
      </div>
    `);

    return;
  }

  const images = item.images || [];

  const html = images.map((img) => {
    return `
      <div class="col-md-3 mb-4">
        <div class="card h-100">
          <img
            src="${img.url}"
            style="
              width:100%;
              height:220px;
              object-fit:cover;
            "
          >

          <div class="card-body p-2">

            ${
              img.isPrimary
                ? `<span class="badge badge-success">Primary</span>`
                : ""
            }

            <div class="mt-2 d-flex flex-column" style="gap:6px;">

              ${
                !img.isPrimary
                  ? `
                <button
                  class="btn btn-sm btn-outline-primary setPrimaryMedia"
                  data-media-id="${item._id}"
                  data-image-id="${img._id}">
                  Set Primary
                </button>
              `
                  : ""
              }

              <button
                class="btn btn-sm btn-outline-danger deleteMediaImage"
                data-media-id="${item._id}"
                data-image-id="${img._id}">
                Delete
              </button>

            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  $("#mediaGallery").html(html);
}

async function openMediaModal(row) {
  $("#media_articleId").val(row.articleId);
  $("#media_color").val(row.color);

  $("#mediaTitle").text(
    `${row.brand} - ${row.article} - ${row.color}`
  );

  $("#mediaGallery").html(`
    <div class="col-md-12 text-center text-muted">
      Loading...
    </div>
  `);

  $("#modalArticleMedia").modal("show");

  await loadMediaGallery(row.articleId, row.color);
}
async function exportFilteredImages() {
  const rows = BALANCE_CACHE.filter((x) => Number(x.balanceQty || 0) > 0);

  if (!rows.length) {
    return Swal.fire("No stock", "No filtered available stock found", "warning");
  }

  const payload = {
    items: rows.map((x) => ({
      articleId: oid(x.articleId) || x.articleId,
      brand: x.brand,
      articleName: x.articleName,
      color: x.color,
      categoryGroup: x.categoryGroup,
      category: x.category,
      mrp: x.mrp,
      balanceQty: x.balanceQty,
    })),
  };

  const res = await fetch(`${MEDIA_API}/export-zip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || j.message || "Export failed");
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `squalo-catalogue-images-${Date.now()}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
}

  function bindEvents() {

    $("#btnPrintStockList").on("click", function () {
  printStockList();
});


$("#balanceBody").on("click", ".deleteMedia", async function () {
  const mediaId = $(this).data("media-id");

  const result = await Swal.fire({
    title: "Delete all images?",
    text: "This will remove complete media for this article color.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Delete",
  });

  if (!result.isConfirmed) return;

  try {
    await api(`${MEDIA_API}/${mediaId}`, {
      method: "DELETE",
    });

    toast("Media deleted");
    await refreshAll();
  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
});

    $("#balanceBody").on("click", ".manageMedia", async function () {
      await openMediaModal({
        articleId: $(this).data("article-id"),
        article: $(this).data("article"),
        brand: $(this).data("brand"),
        color: $(this).data("color"),
      });
    });


    $("#btnExportImages").on("click", async function () {
  try {
    await exportFilteredImages();
  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
});


    $("#btnUploadMedia").on("click", async function () {
    try {
      const articleId = $("#media_articleId").val();
      const color = $("#media_color").val();

      const files = $("#mediaFiles")[0].files || [];

      if (!files.length) {
        return Swal.fire("Select images", "", "warning");
      }

      const fd = new FormData();

      fd.append("articleId", articleId);
      fd.append("color", color);

      Array.from(files).forEach((f) => {
        fd.append("images", f);
      });

      const r = await fetch(`${MEDIA_API}/upload`, {
        method: "POST",
        body: fd,
      });

      const j = await r.json();

      if (!r.ok) {
        throw new Error(j.message || "Upload failed");
      }

      toast("Images uploaded");

      $("#mediaFiles").val("");

      await loadMediaGallery(articleId, color);

    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  });     
    $("#mediaGallery").on("click", ".deleteMediaImage", async function () {
  try {
    const mediaId = $(this).data("media-id");
    const imageId = $(this).data("image-id");

    await api(
      `${MEDIA_API}/${mediaId}/image/${imageId}`,
      {
        method: "DELETE",
      }
    );

    toast("Image deleted");

    await loadMediaGallery(
      $("#media_articleId").val(),
      $("#media_color").val()
    );

  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
});

$("#mediaGallery").on("click", ".setPrimaryMedia", async function () {
  try {
    const mediaId = $(this).data("media-id");
    const imageId = $(this).data("image-id");

    await api(
      `${MEDIA_API}/${mediaId}/primary/${imageId}`,
      {
        method: "PATCH",
      }
    );

    toast("Primary image updated");

    await loadMediaGallery(
      $("#media_articleId").val(),
      $("#media_color").val()
    );

  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
});

    $("#filter_categoryGroup").on("change", async function () {
      populateCategoryFilter(up($(this).val()));
      await refreshAll();
    });
    $("#filter_category").on("change", refreshAll);

    $("#filter_brand, #filter_article, #filter_color, #generalSearch").on("keyup", function () {
      clearTimeout(SEARCH_TIMER);
      SEARCH_TIMER = setTimeout(refreshAll, 350);
    });

    $("#btnReload").on("click", async function () {
      await refreshAll();
      toast("Reloaded");
    });

    $("#btnClearFilters").on("click", async function () {
      $("#filter_categoryGroup").val("");
      $("#filter_category").html(`<option value="">All Categories</option>`);
      $("#filter_brand").val("");
      $("#filter_article").val("");
      $("#filter_color").val("");
      $("#generalSearch").val("");
      await refreshAll();
    });

    $("#pageSize").on("change", function () {
      PAGE_SIZE = Number(this.value) || 25;
      PAGE = 1;
      renderBalance();
    });

    $("#pagerNav").on("click", "a.page-link", function (e) {
      e.preventDefault();

      const p = Number($(this).data("page"));
      if (!Number.isFinite(p) || p < 1) return;

      PAGE = p;
      renderBalance();
    });

    $("#balanceBody").on("click", ".viewMoves", async function () {
      await openMovesModal({
        storeId: $(this).data("store-id"),
        articleId: $(this).data("article-id"),
        article: $(this).data("article"),
        color: $(this).data("color"),
      });
    });

    $("#movesBody").on("click", ".moveDel", async function () {
      const id = $(this).data("id");

      const result = await Swal.fire({
        title: "Delete ledger move?",
        text: "Use only for wrong manual entries. System entries are locked.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Delete",
      });

      if (!result.isConfirmed) return;

      try {
        await api(`${API_BASE}/${id}`, { method: "DELETE" });
        toast("Deleted");
        $("#modalMoves").modal("hide");
        await refreshAll();
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    });

    $("#ledger_articleId").on("change", function () {
      const selected = $("#ledger_articleId").select2("data");
      const article = selected && selected[0] ? selected[0] : null;

      if (!article) {
        $("#ledger_brand").val("");
        $("#ledger_articleName").val("");
        return;
      }

      $("#ledger_brand").val(article.brand || "");
      $("#ledger_articleName").val(article.articleName || "");
    });

    $("#ledger_txnType").on("change", function () {
      const type = up($(this).val());
      const $qty = $("#ledger_qtyDelta");
      const current = Math.abs(Number($qty.val() || 0));

      if (["SALE", "TRANSFER_OUT", "DAMAGE", "WHOLESALE_OUT"].includes(type)) {
        if (current) $qty.val(-current);
        $qty.attr("placeholder", "-10");
      } else {
        if (current) $qty.val(current);
        $qty.attr("placeholder", "+10");
      }
    });

    $("#ledgerCreateForm").on("submit", async function (e) {
      e.preventDefault();

      let qtyDelta = Number($("#ledger_qtyDelta").val());
      const txnType = up($("#ledger_txnType").val());

      if (["SALE", "TRANSFER_OUT", "DAMAGE", "WHOLESALE_OUT"].includes(txnType)) {
        qtyDelta = -Math.abs(qtyDelta);
      } else {
        qtyDelta = Math.abs(qtyDelta);
      }

      const payload = {
        storeId: $("#ledger_storeId").val(),
        articleId: $("#ledger_articleId").val(),
        articleName: $("#ledger_articleName").val(),
        brand: $("#ledger_brand").val(),
        color: up($("#ledger_color").val()),
        txnType,
        qtyDelta,
        balanceAfter: 0,
        ref: {
          documentNo: $("#ledger_documentNo").val() || "",
          note: $("#ledger_note").val() || "",
        },
      };

      if (!payload.storeId || !payload.articleId || !payload.color || !payload.txnType || !payload.qtyDelta) {
        return Swal.fire("Missing fields", "Store, Article, Color, Type and Qty are required", "warning");
      }

      try {
        await api(API_BASE, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        $("#modalLedgerCreate").modal("hide");
        resetCreateForm(this);

        toast("Ledger entry added");
        await refreshAll();
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    });
  }

  $(async function () {
    PAGE_SIZE = Number($("#pageSize").val()) || 25;

    await loadStores();
    await loadCategories();
    initArticleSearch();
    bindEvents();
    await refreshAll();
  });
})();