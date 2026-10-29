'use strict';

var KTDatatablesExtensionButtons = (function () {
  // --- Helpers ---
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Build API URL for given month/year (strings "MM","YYYY")
  function buildUrl(mm, yyyy) {
    if (mm && yyyy) {
      return `/api/task/payments/outstanding?month=${mm}&year=${yyyy}`;
    }
    // Till EOT: no month/year params
    return `/api/task/payments/outstanding`;
  }

  var table; // DataTable instance

  var initTable3 = function () {
    // Default to current month on first load
    var now = new Date();
    var mm = String(now.getMonth() + 1).padStart(2, '0');
    var yyyy = String(now.getFullYear());

    // Update header labels
    $('#kt_dashboard_daterangepicker_title_3').text('Current');
    $('#kt_dashboard_daterangepicker_date_3').text(`${mm}-${yyyy}`);

    // --- DataTable init (5 columns): Client | Tasks | Outstanding (INR) | Breakdown | Action
    table = $('#kt_table_3').DataTable({
      dom: 'brltip',
      responsive: true,
      processing: true,
      searchDelay: 300,
      buttons: [
        { extend: 'print',     exportOptions: { columns: 'th:not(:last-child)' }, title: 'Clients with Outstanding' },
        { extend: 'copyHtml5', exportOptions: { columns: 'th:not(:last-child)' } },
        { extend: 'excelHtml5',exportOptions: { columns: 'th:not(:last-child)' }, title: 'clients_outstanding' },
        { extend: 'csvHtml5',  exportOptions: { columns: 'th:not(:last-child)' }, title: 'clients_outstanding' },
        { extend: 'pdfHtml5',  exportOptions: { columns: 'th:not(:last-child)' }, title: 'clients_outstanding' },
      ],
      ajax: {
        // start with current month
        url: buildUrl(mm, yyyy),
        type: 'GET',
        dataSrc: function (json) {
          console.log('[DT] outstanding → raw response:', json);
          if (!json || !Array.isArray(json.data)) {
            console.warn('[DT] Expected { data: [...] } but got:', json);
            return [];
          }
          console.log('[DT] rows:', json.data.length, ' sample row:', json.data[0]);
          return json.data;
        },
        error: function (xhr, status, err) {
          console.error('[DT] AJAX error:', status, err, 'response:', xhr && xhr.responseText);
        }
      },
      order: [[2, 'desc']], // Outstanding (INR) desc
      columns: [
        // 0) Client (clickable)
        {
          data: 'client',
          title: 'Client',
          render: function (c) {
            if (!c) return '—';
            var name = c.name || '(no name)';
            // keeping your current link structure:
            return `<a href="/su/client/${c._id}" target="_blank">${escapeHtml(name)}</a>`;
          }
        },
        // 1) Tasks
        {
          data: 'totalAffectedTasks',
          title: 'Tasks',
          className: 'text-center'
        },
        // 2) Outstanding (INR)
        {
          data: 'totalOutstandingINR',
          title: 'Outstanding (INR)',
          className: 'text-right',
          render: function (val) {
            return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(val || 0);
          }
        },
        // 3) Breakdown (per-currency)
        {
          data: 'perCurrency',
          title: 'Breakdown',
          render: function (arr) {
            if (!arr || !arr.length) return '—';
            return arr.map(function (x) {
              var amt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(x.totalOutstanding || 0);
              return `${x.currency}: ${amt} (${x.tasksCount || 0})`;
            }).join(' · ');
          }
        },
        // 4) Action
        {
          data: 'client._id',
          title: 'Action',
          orderable: false,
          className: 'text-center',
          render: function (id) {
            return `<a class="btn btn-sm btn-outline-primary" href="/clients/${id}/tasks?status=outstanding">View</a>`;
          }
        }
      ]
    });

    // Toolbar export buttons (hook your existing DOM buttons)
    $('#export_print').on('click', function (e) { e.preventDefault(); table.button(0).trigger(); });
    $('#export_copy').on('click',  function (e) { e.preventDefault(); table.button(1).trigger(); });
    $('#export_excel').on('click', function (e) { e.preventDefault(); table.button(2).trigger(); });
    $('#export_csv').on('click',  function (e) { e.preventDefault(); table.button(3).trigger(); });
    $('#export_pdf').on('click',  function (e) { e.preventDefault(); table.button(4).trigger(); });

    // Global search box
    $('#generalSearch').on('keyup change', function () {
      table.search(this.value).draw();
    });

    // Reload
    $('#kt_datatable_reload').on('click', function () {
      table.ajax.reload(null, false);
    });

    // --- Month picker wiring (mm-yyyy) ---
    $('#kt_dashboard_daterangepicker_3')
      .datepicker({
        direction: window.KTUtil && KTUtil.isRTL ? KTUtil.isRTL() : false,
        open: 'right',
        orientation: 'bottom right',
        format: 'mm-yyyy',
        startView: 'months',
        minViewMode: 'months',
        autoclose: true,
      })
      .on('changeDate', function (ev) {
        const [selMM, selYYYY] = String(ev.format()).split('-'); // date[0], date[1]
        $('#kt_dashboard_daterangepicker_title_3').text('Current');
        $('#kt_dashboard_daterangepicker_date_3').text(`${selMM}-${selYYYY}`);
        table.ajax.url(buildUrl(selMM, selYYYY)).load();
      });

    // --- Till EOT handler (no month/year filters) ---
    window.tillEOT = function () {
      $('#kt_dashboard_daterangepicker_title_3').text('Till');
      $('#kt_dashboard_daterangepicker_date_3').text('EOT');
      table.ajax.url(buildUrl()).load();
    };
  };

  return {
    init: function () {
      initTable3();
    }
  };
})();

jQuery(document).ready(function () {
  KTDatatablesExtensionButtons.init();
});
