(function () {
  const colors = new Set();
  const sizes = new Set();

  const colorInput = document.getElementById("colorInput");
  const sizeInput = document.getElementById("sizeInput");
  const colorChips = document.getElementById("colorChips");
  const sizeChips = document.getElementById("sizeChips");

  const addColorBtn = document.getElementById("addColorBtn");
  const addSizeBtn = document.getElementById("addSizeBtn");

  const qtyBody = document.getElementById("qtyMatrixBody");
  const matrixTable = qtyBody?.closest("table");
  const matrixHeadRow = matrixTable?.querySelector("thead tr");

  console.log("inventory-ui.js loaded ✅");

 function renderChips(container, set, type) {
  container.innerHTML = "";

  [...set].sort((a, b) => ("" + a).localeCompare("" + b)).forEach((val) => {
    const chip = document.createElement("span");
    chip.className = "badge badge-pill badge-light mr-2 mb-2";
    chip.style.padding = "8px 10px";
    chip.style.border = "1px solid #e6e9f0";

    const text = document.createElement("span");
    text.textContent = val;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ml-2";
    btn.textContent = "×";
    btn.style.border = "none";
    btn.style.background = "transparent";
    btn.style.cursor = "pointer";
    btn.style.color = "#666";

    btn.addEventListener("click", () => {
      if (type === "color") colors.delete(val);
      if (type === "size") sizes.delete(val);
      renderAll();
    });

    chip.appendChild(text);
    chip.appendChild(btn);
    container.appendChild(chip);
  });
}


  function renderMatrix() {
    if (!matrixHeadRow || !qtyBody) return;

    // Clear header (keep first th)
    while (matrixHeadRow.children.length > 1) matrixHeadRow.removeChild(matrixHeadRow.lastChild);

    const sizeList = [...sizes].map(String).sort((a, b) => Number(a) - Number(b));
    const colorList = [...colors].sort((a, b) => a.localeCompare(b));

    // Header
    sizeList.forEach((s) => {
      const th = document.createElement("th");
      th.textContent = s;
      th.style.minWidth = "90px";
      matrixHeadRow.appendChild(th);
    });

    // Body
    qtyBody.innerHTML = "";
    colorList.forEach((c) => {
      const tr = document.createElement("tr");

      const tdColor = document.createElement("td");
      tdColor.textContent = c;
      tdColor.style.fontWeight = "600";
      tr.appendChild(tdColor);

      sizeList.forEach((s) => {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.value = "0";
        input.className = "form-control form-control-sm";
        input.style.width = "80px";
        input.setAttribute("data-color", c);
        input.setAttribute("data-size", s);

        td.appendChild(input);
        tr.appendChild(td);
      });

      qtyBody.appendChild(tr);
    });
  }

  function renderAll() {
    renderChips(colorChips, colors, "color");
    renderChips(sizeChips, sizes, "size");
    renderMatrix();
  }

  addColorBtn?.addEventListener("click", () => {
    const v = (colorInput.value || "").trim().toUpperCase();
    if (!v) return;
    colors.add(v);
    colorInput.value = "";
    renderAll();
  });

  addSizeBtn?.addEventListener("click", () => {
    const v = (sizeInput.value || "").trim();
    if (!v) return;
    sizes.add(v);
    sizeInput.value = "";
    renderAll();
  });

  function getDataTableInstance() {
    try {
      if (window.jQuery && $.fn.DataTable && $.fn.DataTable.isDataTable("#kt_table_3")) {
        return $("#kt_table_3").DataTable();
      }
    } catch (e) {}
    return null;
  }

  function appendRowFallback(r) {
    const tbody = document.querySelector("#kt_table_3 tbody");
    if (!tbody) return;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.article}</td>
      <td>${r.color}</td>
      <td>${r.size}</td>
      <td>${r.quantity}</td>
      <td>${r.location}</td>
    `;
    tbody.appendChild(tr);
  }

  function resetModalForm() {
    document.getElementById("articleName").value = "";
    if (colorInput) colorInput.value = "";
    if (sizeInput) sizeInput.value = "";
    colors.clear();
    sizes.clear();
    [6, 7, 8, 9, 10].forEach((s) => sizes.add(String(s)));
    renderAll();
  }

  // ✅ FINAL: Use FORM SUBMIT (reliable)
 async function postJSON(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  // Try to parse json even on errors
  let payload = null;
  try { payload = await res.json(); } catch (e) {}

  if (!res.ok) {
    const msg = payload?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return payload;
}

document.getElementById("addArticleForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const btn = document.getElementById("saveArticleBtn");
  const oldHtml = btn ? btn.innerHTML : "";

  const articleName = (document.getElementById("articleName")?.value || "")
    .trim()
    .toUpperCase();

  // If you add location dropdown later, it will be used. Otherwise default:
  const location = (document.getElementById("location")?.value || "Warehouse").trim();
  const brand = (document.getElementById("brand")?.value || "").trim().toUpperCase();
  if (!brand) {
    alert("Please select Brand");
    return;
  }
  if (!articleName) {
    alert("Please enter Article Name");
    return;
  }

  // Loader ON
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm mr-2"></span> Saving...`;
  }

  try {
    // Collect qty matrix
    const qtyInputs = document.querySelectorAll('#qtyMatrixBody input[data-color][data-size]');
    const rows = [];
    qtyInputs.forEach((inp) => {
      const qty = Number(inp.value || 0);
      if (qty > 0) {
        rows.push({
          color: String(inp.getAttribute("data-color") || "").trim().toUpperCase(),
          size: String(inp.getAttribute("data-size") || "").trim(),
          quantity: qty
        });
      }
    });

    if (rows.length === 0) {
      throw new Error("Please enter at least one quantity > 0");
    }

    const payload = {
                      brand,
                      articleName,
                      location,
                      colors: [...colors],
                      sizes: [...sizes],
                      rows
                    };

    console.log("POST PAYLOAD:", payload);

    // ✅ CALL YOUR API
    const resp = await postJSON("/apis/footwears/inventory/save", payload);

    // Expect server to return rows for table:
    // resp.rows = [{article,color,size,quantity,location}]
    const savedRows = resp.rows || [];

    // Add into DataTable if present
    let dt = null;
    try {
      if (window.jQuery && $.fn.DataTable && $.fn.DataTable.isDataTable("#kt_table_3")) {
        dt = $("#kt_table_3").DataTable();
      }
    } catch (e) {}

    if (dt) {
      savedRows.forEach((r) =>
        dt.row.add([r.article || articleName, r.color, r.size, r.quantity, r.location || location])
      );
      dt.order([[0, "asc"], [1, "asc"], [2, "asc"]]).draw(false);
    } else {
      // Fallback append if table not datatable
      const tbody = document.querySelector("#kt_table_3 tbody");
      savedRows.forEach((r) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.article || articleName}</td>
          <td>${r.color}</td>
          <td>${r.size}</td>
          <td>${r.quantity}</td>
          <td>${r.location || location}</td>
        `;
        tbody?.appendChild(tr);
      });
    }

    // Close modal
    if (window.jQuery) $("#addArticleModal").modal("hide");

    // Optional: reset quantities to 0 after save
    document.querySelectorAll('#qtyMatrixBody input[data-color][data-size]').forEach(i => i.value = 0);

  } catch (err) {
    console.error(err);
    alert(err.message || "Save failed");
  } finally {
    // Loader OFF
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  }
});


  // default sizes you always use
  [6, 7, 8, 9, 10].forEach((s) => sizes.add(String(s)));
  renderAll();
function openSkuEditModal(row) {
  $('#sku_id').val(row._id);
  $('#sku_brand').val(row.brand);
  $('#sku_article').val(row.article);
  $('#sku_color').val(row.color);
  $('#sku_size').val(row.size);
  $('#sku_location').val(row.location);
  $('#sku_quantity').val(row.quantity ?? 0);

  $('#modalSkuEdit').modal('show');
}

function openProductEditModal({ brand, article }) {
  $('#prod_brand').val(brand);
  $('#prod_article').val(article);
  $('#modalProductEdit').modal('show');
}

})();

