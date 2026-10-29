const express = require("express");
const router = express.Router();

// TODO: replace with your controller imports
const storeController = require("../../controller/footwears/store.controller");

// Placeholder controller handlers
// const storeController = {
//  create: (req, res) => res.json({ ok: true, action: "create store" }),
//  list: (req, res) => res.json({ ok: true, action: "list stores" }),
//  getById: (req, res) => res.json({ ok: true, action: "get store", id: req.params.id }),
//  update: (req, res) => res.json({ ok: true, action: "update store", id: req.params.id }),
//  remove: (req, res) => res.json({ ok: true, action: "delete store", id: req.params.id }),
//};

router.post("/", storeController.create);
router.get("/", storeController.list);
router.get("/:id", storeController.getById);
router.patch("/:id", storeController.update);
router.patch("/:id", storeController.remove);

module.exports = router;
