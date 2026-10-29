const express = require("express");
const router = express.Router();

const partyCtrl = require("../../controller/footwears/party.controller");
const ledgerCtrl = require("../../controller/footwears/partyLedger.controller");


// ---------------- PARTY LEDGER ----------------

// list ledger entries
router.get("/ledger", ledgerCtrl.list);


// ---------------- PARTY CRUD ----------------

// create party
router.post("/", partyCtrl.create);

// list parties
router.get("/", partyCtrl.list);

// optional: filter suppliers
router.get("/suppliers", (req, res, next) => {
  req.query.partyType = "SUPPLIER";
  next();
}, partyCtrl.list);

// optional: filter customers
router.get("/customers", (req, res, next) => {
  req.query.partyType = "CUSTOMER";
  next();
}, partyCtrl.list);

// get single party
router.get("/:id", partyCtrl.getById);

// update party
router.patch("/:id", partyCtrl.update);

// soft delete party
router.delete("/:id", partyCtrl.remove);


module.exports = router;