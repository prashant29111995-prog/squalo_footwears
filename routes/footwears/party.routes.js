const express = require("express");

const router = express.Router();

const partyCtrl = require("../../controller/footwears/party.controller");
const ledgerCtrl = require("../../controller/footwears/partyLedger.controller");
const workspaceCtrl = require("../../controller/footwears/workspace.controller");

const {
  checkApiAuth,
  requireFootwearAdmin,
} = require("../../middleware/check-auth");

router.use(checkApiAuth);

// Fixed paths before /:id.
router.get(
  "/ledger",
  requireFootwearAdmin("readAny"),
  ledgerCtrl.list
);

router.get(
  "/suppliers",
  requireFootwearAdmin("readAny"),
  (req, res, next) => {
    req.query.partyType = "SUPPLIER";
    next();
  },
  partyCtrl.list
);

router.get(
  "/customers",
  requireFootwearAdmin("readAny"),
  (req, res, next) => {
    req.query.partyType = "CUSTOMER";
    next();
  },
  partyCtrl.list
);

// Workspace.
router.get(
  "/:id/workspace",
  requireFootwearAdmin("readAny"),
  workspaceCtrl.getForParty
);

router.post(
  "/:id/workspace",
  requireFootwearAdmin("createAny"),
  workspaceCtrl.createForParty
);

// Party CRUD.
router.post(
  "/",
  requireFootwearAdmin("createAny"),
  partyCtrl.create
);

router.get(
  "/",
  requireFootwearAdmin("readAny"),
  partyCtrl.list
);

router.get(
  "/:id",
  requireFootwearAdmin("readAny"),
  partyCtrl.getById
);

router.patch(
  "/:id",
  requireFootwearAdmin("updateAny"),
  partyCtrl.update
);

router.delete(
  "/:id",
  requireFootwearAdmin("deleteAny"),
  partyCtrl.remove
);

module.exports = router;