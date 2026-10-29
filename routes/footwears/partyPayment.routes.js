const express = require("express");
const router = express.Router();

const paymentCtrl = require("../../controller/footwears/partyPayment.controller");

// payments list
router.get("/", paymentCtrl.list);

// single payment
router.get("/:id", paymentCtrl.getById);

// receive payment
router.post("/", paymentCtrl.create);

// update payment
router.put("/:id", paymentCtrl.update);

// reverse payment
router.post("/:id/reverse", paymentCtrl.reverse);

// delete payment
router.delete("/:id", paymentCtrl.remove);

module.exports = router;