const mongoose = require("mongoose");

const RackSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: "StoreLocation", required: true, index: true },

    rackCode: { type: String, required: true, trim: true, uppercase: true }, // A1
    rackName: { type: String, required: true, trim: true, uppercase: true }, // RACK A1

    categoryGroup: { type: String, required: true, uppercase: true, enum: ["MEN", "WOMEN", "KIDS", "UNISEX"], index: true },
    category: { type: String, required: true, uppercase: true, index: true }, // SPORTS/EVA/...

    capacityPairs: { type: Number, default: 0, min: 0 }, // 0 = unlimited

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

RackSchema.index({ locationId: 1, rackCode: 1 }, { unique: true });

module.exports = mongoose.model("Rack", RackSchema);
