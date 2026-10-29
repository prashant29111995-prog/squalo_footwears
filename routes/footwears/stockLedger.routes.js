const express = require("express");
const router = express.Router();

const ledgerController = require("../../controller/footwears/stockLedger.controller");

// Summary / balance first
router.get("/summary", ledgerController.summary);
router.get("/balance", ledgerController.balance);

// READ
router.get("/", ledgerController.list);
router.get(
  "/backfill-batch-prices",
  ledgerController.backfillLedgerBatchPrices
);
router.get("/:id", ledgerController.getById);

// WRITE
router.post("/", ledgerController.create);
router.delete("/:id", ledgerController.remove);

module.exports = router;