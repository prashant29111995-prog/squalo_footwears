'use strict';




var KTDatatablesExtensionButtons = (function () {
  var now = new Date();
  var currentMonth = now.getMonth() + 1;
  var currentYear = now.getFullYear();
  var currentMonthprint = new Date().toLocaleString('default', { month: 'long' });
 var initTable3 = function () {
    // begin first table
    var table = $('#kt_table_3').DataTable({
      dom: 'brtip',
      //   dom: "B<'row'><'row'<'col-md-6'l><'col-md-6'f>r>t<'row'<'col-md-4'i>><'row'p>B",
      responsive: true,
      createdRow: function (row, data, dataIndex) {
        $(row).css('cursor', 'cell');
      },
      buttons: [
        {
          extend: 'print',
          exportOptions: {
            columns: 'th:not(:last-child)',
          },
        },
        {
          extend: 'copyHtml5',
          exportOptions: {
            columns: 'th:not(:last-child)',
          },
        },
        {
          extend: 'excelHtml5',
          exportOptions: {
            columns: 'th:not(:last-child)',
          },
        },
        {
          extend: 'csvHtml5',
          exportOptions: {
            columns: 'th:not(:last-child)',
          },
        },
        {
          extend: 'pdfHtml5',
          exportOptions: {
            columns: 'th:not(:last-child)',
          },
        },
      ],
      processing: true,
      searchDelay: 500,
      ajax: {
        url: `/api/client/report?month=${currentMonth}&year=${currentYear}`,
        type: 'GET',
        data: {
          // parameters for custom backend script demo
          columnsDef: [
            'clientName',
            'tasks',
            'transactions',
            'bda.name'
          ],
        },
      },
      columns: [
        { data: 'clientName' },
        {data: 'tasks'},
        { data: 'transactions' },
        { data: 'bda.name' }
      ],
      columnDefs: [
        {
            targets: 0,
            render: function (clientName, type, rowData) {
              const clientId = rowData.clientId;
              return `<a href="/su/client/${clientId}" target="_blank">${clientName}</a>`;
            },
          },
        {
          targets: 1,
          render: function (tasks) {
            const noTasks = tasks.length === 0;
            const borderColor = noTasks ? 'red' : 'black';
        
            const taskRows = tasks.map(task => `
              <tr>
                <td><a href="/su/task/${task.taskId}" target="_blank">${task.taskId}</a></td>
                <td>${task.wordcount}</td>
                <td>${task.amount}${task.currency}</td>
                <td>${task.paid}${task.currency}</td>
              </tr>
            `).join('');
        
            return `
              <table class="bordered-table" style="border: 1px solid ${borderColor}; border-collapse: collapse; width: 100%;">
                <thead>
                  <tr>
                    <th style="border: 1px solid ${borderColor}; padding: 4px;">Task ID</th>
                    <th style="border: 1px solid ${borderColor}; padding: 4px;">Wordcount</th>
                    <th style="border: 1px solid ${borderColor}; padding: 4px;">Amount</th>
                    <th style="border: 1px solid ${borderColor}; padding: 4px;">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  ${taskRows}
                </tbody>
              </table>
            `;
          }
        },
        {
          targets: 2,
          render: function (transactions) {
            const noTransactions = transactions.length === 0;
            const borderColor = noTransactions ? 'red' : 'black';
        
            const transactionRows = transactions.map(transaction => `
              <tr>
                <td>${transaction.transactionValue}${transaction.transactionCurrency}</td>
                <td>${new Date(transaction.receivedOn).toLocaleDateString()}</td>
                <td>${transaction.verified}</td>
              </tr>
            `).join('');
        
            return `
              <table class="bordered-table" style="border: 1px solid ${borderColor}; border-collapse: collapse; width: 100%;">
                <thead>
                  <tr>
                    <th style="border: 1px solid ${borderColor}; padding: 4px;">Transaction Value</th>
                    <th style="border: 1px solid ${borderColor}; padding: 4px;">Received On</th>
                    <th style="border: 1px solid ${borderColor}; padding: 4px;">Verified</th>
                  </tr>
                </thead>
                <tbody>
                  ${transactionRows}
                </tbody>
              </table>
            `;
          }
        },
       
      ],
    });
    
    $('#export_print').on('click', function (e) {
      e.preventDefault();
      table.button(0).trigger();
    });

    $('#export_copy').on('click', function (e) {
      e.preventDefault();
      table.button(1).trigger();
    });

    $('#export_excel').on('click', function (e) {
      e.preventDefault();
      table.button(2).trigger();
    });

    $('#export_csv').on('click', function (e) {
      e.preventDefault();
      table.button(3).trigger();
    });

    $('#export_pdf').on('click', function (e) {
      e.preventDefault();
      table.button(4).trigger();
    });

   

    $('#kt_form_status').on('change', function () {
      table.columns(5).search($(this).val()).draw();
    });

    $('#kt_form_status').selectpicker();

    $('#generalSearch').keyup(function () {
      table.search($(this).val()).draw();
    });
    //   $('#kt_table_3 tbody').on('click', 'tr', function () {
    //     var data = table.row( this ).data();
    //     toggleClientCanvas(data)
    // } );
    $('#kt_dashboard_daterangepicker_3').on(
        'hide.daterangepicker',
        (ev, picker) => {
          const date = ev.format().split('-');
          var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          
          table.ajax
            .url(`/api/client/report?month=${date[0]}&year=${date[1]}`)
            .load();
        }
      );
  
      $('#kt_datepicker').datepicker({
        todayHighlight: true,
        templates: {
          leftArrow: '<i class="la la-angle-left"></i>',
          rightArrow: '<i class="la la-angle-right"></i>',
        },
      });
    $('#tillEot').on('click', () => {
      $('#kt_dashboard_daterangepicker_date_3').text(`EOT`);
      table.ajax.url(`/api/client/report`).load();
    });
  };
  return {
    //main function to initiate the module
    init: function () {
      initTable3();
      },
  };
})();

jQuery(document).ready(function () {
    KTDatatablesExtensionButtons.init();
    daterangepickerInit();
    
  
  });

  var daterangepickerInit = function () {

    var todayDate = new Date();
    var month = todayDate.getMonth() + 1;
    var year = todayDate.getFullYear();
    $('#kt_dashboard_daterangepicker_date_3').empty().text(` ${month}-${year}`);
    $('#kt_dashboard_daterangepicker_3')
      .datepicker({
        direction: KTUtil.isRTL(),
        open: 'right',
        orientation: 'bottom right',
        format: 'mm-yyyy',
        startView: 'months',
        minViewMode: 'months',
        autoclose: true,
      })
      .on('changeDate', function (ev) {
        $('#kt_dashboard_daterangepicker_date_3').html(ev.format());
        var value = $('#kt_dashboard_daterangepicker_date_3').text();
      });
  };