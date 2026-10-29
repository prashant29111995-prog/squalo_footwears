const express = require("express");
const router = express.Router();

const ledgerCtrl = require("../../controller/footwears/partyLedger.controller");

// ledger report/list
router.get("/", ledgerCtrl.list);

// one ledger entry
router.get("/:id", ledgerCtrl.getById);

// manual adjustment
router.post("/adjustment", ledgerCtrl.createAdjustment);

// reverse manual adjustment
router.post("/:id/reverse", ledgerCtrl.reverseAdjustment);

module.exports = router;