const express = require('express');

const router = express.Router();

const { checkAuth } = require('../middleware/check-auth');

const managerController = require('../controller/manager');

router.get('/dashboard', checkAuth, managerController.get_mn_dashboard);
router.get('/billing', checkAuth, managerController.get_mn_billing);
router.get('/historybilling', checkAuth, managerController.get_mn_billing_history);
router.get('/draftbilling', checkAuth, managerController.get_mn_billing_draft);
router.get('/returnbilling', checkAuth, managerController.get_mn_billing_return);
// router.get('/clients', checkAuth, managerController.get_mn_clients)
router.get('/notifications', checkAuth, managerController.get_mn_notifications);
router.get('/profile', checkAuth, managerController.get_mn_profile);
router.get('/all', checkAuth, managerController.get_mn_alltask);
router.get('/employees', checkAuth, managerController.get_mn_employee);
router.get('/team', checkAuth, managerController.get_mn_team);

router.get('/task/:id', checkAuth, managerController.get_mn_task_single);

module.exports = router;
