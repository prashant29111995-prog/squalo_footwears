// /models/Store.js
const mongoose = require("mongoose");

const StoreSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, unique: true }, // e.g. "DL-SHOP-01"
    name: { type: String, required: true, trim: true }, // e.g. "Ballabhgarh Metro Store"
    type: { type: String, enum: ["RETAIL", "GODOWN", "WAREHOUSE"], default: "RETAIL" },

    address: {
      line1: String,
      city: String,
      state: String,
      pincode: String,
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Store", StoreSchema);
