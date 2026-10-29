const mongoose = require("mongoose");

const StoreLocationSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },

    name: { type: String, required: true, trim: true, uppercase: true }, // "BASEMENT"
    code: { type: String, trim: true, uppercase: true, default: "" },    // "B1" (optional)

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Unique location name per store
StoreLocationSchema.index({ storeId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("StoreLocation", StoreLocationSchema);
