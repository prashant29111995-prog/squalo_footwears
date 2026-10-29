exports.get_mn_dashboard = async (req, res, next) => {
  res.render('manager/dashboard', {
    pageTitle: 'MN | Dashboard',
  });
};
// exports.get_mn_clients = async (req,res,next) => {
//     res.render('manager/clients', {
//         pageTitle : 'MN | Clients'
//     })
// }

exports.get_mn_profile = (req, res, next) => {
  res.render('manager/profile', {
    pageTitle: 'Manager | Profile',
  });
};

exports.get_mn_alltask = (req, res, next) => {
  res.render('manager/alltask', {
    pageTitle: 'Manager | All Task',
  });
};

exports.get_mn_task_single = (req, res, next) => {
  res.render('manager/singletask', {
    pageTitle: req.params.id,
  });
};
exports.get_mn_employee = async (req, res, next) => {
  res.render('manager/employees', {
    pageTitle: 'MN | Employees',
  });
};
exports.get_mn_team = async (req, res, next) => {
  res.render('manager/team', {
    pageTitle: 'MN | Team',
    treeViewCallId: req.decoded.userId,
  });
};
exports.get_mn_billing = async (req, res, next) => {
  res.render('manager/billing', {
    pageTitle: 'Manager | Billing',
  });
};
exports.get_mn_billing_history = async (req, res, next) => {
  res.render('manager/billinghistory', {
    pageTitle: 'Manager | Billing History',
  });
};
exports.get_mn_billing_draft = async (req, res, next) => {
  res.render('manager/draftbilling', {
    pageTitle: 'Manager | Draft Billing',
  });
};
exports.get_mn_billing_return = async (req, res, next) => {
  res.render('manager/returnbilling', {
    pageTitle: 'Manager | Return Billing',
  });
};
exports.get_mn_notifications = async (req, res, next) => {
  res.render('manager/notifications', {
    pageTitle: 'MN | Notificatons',
  });
};
