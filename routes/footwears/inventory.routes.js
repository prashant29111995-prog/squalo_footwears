const router = require("express").Router();
const inv = require("../../controller/footwears/inventory.controller");

// Live search articles by name
router.get("/articles/search", inv.searchArticles);

// Get article + stock rows (for a location)
router.get("/articles/:id/details", inv.getArticleDetails);

// Save from modal: create/update article + upsert stock rows
router.post("/inventory/save", inv.saveInventoryEntry);

router.get("/inventory/table", inv.inventoryTable);

module.exports = router;
