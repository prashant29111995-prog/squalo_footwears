var table = $('#kt_table_3').DataTable({
  serverSide: true,
  processing: true,
  searchDelay: 400,
  dom: 'brltip',
  ajax: {
    url: '/apis/footwears/inventory/table',
    type: 'GET',
    data: function (d) {
      d.brand = ($('#filterBrand').val() || '').trim().toUpperCase();
      d.location = ($('#filterLocation').val() || '').trim();
      d.size = ($('#filterSize').val() || '').trim();
      d.color = ($('#filterColor').val() || '').trim().toUpperCase();
    }
  },
  columns: [
    { data: 'brand', defaultContent: '', className: 'cell-brand' },
    { data: 'article', defaultContent: '', className: 'cell-article' },
    { data: 'color', defaultContent: '', className: 'cell-sku' },
    { data: 'size', defaultContent: '', className: 'cell-sku' },
    { data: 'quantity', defaultContent: 0, className: 'cell-sku' },
    { data: 'location', defaultContent: '', className: 'cell-sku' },

    // keep _id hidden (needed for SKU update)
    { data: '_id', visible: false, searchable: false }
  ],
  order: [[1, 'asc'], [2, 'asc'], [3, 'asc']]
});


// ----------------------
// SEARCH + FILTERS
// ----------------------
$('#generalSearch').on('keyup', function () {
  table.search(this.value).draw();
});

$('#filterBrand, #filterLocation, #filterSize').on('change', function () {
  table.ajax.reload(null, false);
});

$('#filterColor').on('input', function () {
  table.ajax.reload(null, false);
});


// ----------------------
// CLICK TO EDIT LOGIC
// ----------------------
// Columns index mapping (with hidden _id at end):
// 0 brand, 1 article, 2 color, 3 size, 4 qty, 5 location, 6 _id(hidden)
$('#kt_table_3 tbody').on('click', 'td', function () {
  // ignore clicks on empty rows
  var row = table.row(this.closest('tr')).data();
  if (!row) return;

  // figure out clicked column
  var cellIndex = table.cell(this).index();
  if (!cellIndex) return;

  var col = cellIndex.column;

  // Brand or Article click => BULK PRODUCT UPDATE modal
  if (col === 0 || col === 1) {
    if (typeof openProductEditModal === 'function') {
      openProductEditModal({
        brand: row.brand,
        article: row.article
      });
    } else {
      console.warn('openProductEditModal() not defined');
    }
    return;
  }

  // Color/Size/Qty/Location click => SINGLE SKU UPDATE modal
  if ([2, 3, 4, 5].includes(col)) {
    if (!row._id) {
      alert("Row id missing (_id). Update your table API to return _id.");
      return;
    }
    if (typeof openSkuEditModal === 'function') {
      openSkuEditModal(row); // row contains _id, brand, article, color, size, qty, location
    } else {
      console.warn('openSkuEditModal() not defined');
    }
    return;
  }
});
