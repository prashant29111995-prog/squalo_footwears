const express = require("express");
const router = express.Router();

const skuController = require("../../controller/footwears/sku.controller");

// Create
router.post("/", skuController.create);
router.post("/bulk-matrix", skuController.bulkMatrix);

// Read
router.get("/", skuController.list);
router.get("/:id", skuController.getById);

// Update/Delete
router.patch("/:id", skuController.update);
router.delete("/:id", skuController.remove);

router.get("/skus/search", skuController.search);
router.get("/skus/:skuId/summary", skuController.summary); // total qty

module.exports = router;
