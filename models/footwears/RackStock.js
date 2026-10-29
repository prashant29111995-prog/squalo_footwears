const mongoose = require("mongoose");

const RackStockSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: "StoreLocation", required: true, index: true },
    rackId: { type: mongoose.Schema.Types.ObjectId, ref: "Rack", required: true, index: true },

    skuId: { type: mongoose.Schema.Types.ObjectId, ref: "Sku", required: true, index: true },
    qty: { type: Number, default: 0, min: 0 },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// ✅ allows multiple SKUs per rack, but prevents duplicate SKU row inside same rack
RackStockSchema.index({ rackId: 1, skuId: 1 }, { unique: true });

// Helpful for store/location queries
RackStockSchema.index({ storeId: 1, locationId: 1, rackId: 1 });

module.exports = mongoose.model("RackStock", RackStockSchema);
