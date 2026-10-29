const express = require("express");
const router = express.Router();

const billCtrl = require("../../controller/footwears/bill.controller");

// HEADER
router.post("/", billCtrl.create);
router.get("/", billCtrl.list);
router.get("/:id", billCtrl.getById);
router.patch("/:id", billCtrl.update);

// LINES
router.post("/:id/lines", billCtrl.addLine);
router.patch("/:id/lines/:lineId", billCtrl.updateLine);
router.delete("/:id/lines/:lineId", billCtrl.deleteLine);

// DEPRECATED
router.patch("/:id/lines/:lineId/breakup", billCtrl.updateBreakup);

// WORKFLOW
router.post("/:id/reverse", billCtrl.reverseFinalBill);
router.post("/:id/finalize", billCtrl.finalize);
router.post("/:id/cancel", billCtrl.cancel);

module.exports = router;