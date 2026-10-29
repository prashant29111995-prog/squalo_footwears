const router = require("express").Router();
const loc = require("../../controller/footwears/storeLocation.controller");
const rack = require("../../controller/footwears/rack.controller");
const rs = require("../../controller/footwears/rackStock.controller");

// storeId from URL :id
router.get("/stores/:id/locations", loc.listByStore);
router.post("/stores/:id/locations", loc.createForStore);

// locationId CRUD
router.patch("/locations/:locationId", loc.update);
router.delete("/locations/:locationId", loc.remove);


router.get("/stores/:id/locations/:locationId/racks", rack.listByLocation);
router.post("/stores/:id/locations/:locationId/racks", rack.createForLocation);
router.get("/racks/:rackId", rack.getById);
router.patch("/racks/:rackId", rack.update);
router.delete("/racks/:rackId", rack.remove);


router.get("/racks/:rackId/stock", rs.listByRack);
router.post("/racks/:rackId/stock", rs.upsertQty);          // body: {skuId, qty} increments or creates

router.patch("/rack-stock/:rackStockId", rs.setQty);        // body: {qty}
router.delete("/rack-stock/:rackStockId", rs.removeRow);

router.post("/racks/:rackId/move", rs.moveQty);
router.get("/sku/:skuId/allocated", rs.allocatedBySku);
module.exports = router;
