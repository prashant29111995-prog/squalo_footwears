// /models/AuditLine.js
const mongoose = require("mongoose");

const AuditLineSchema = new mongoose.Schema(
  {
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: "Audit", required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true }, // denormalize
    skuId: { type: mongoose.Schema.Types.ObjectId, ref: "Sku", required: true },

    countedQty: { type: Number, required: true, min: 0 },

    // Location inside store (as in your UI "Basement/Shop", later rack/bin)
    location: {
      zone: { type: String, trim: true },  // "Basement", "Shop"
      rack: { type: String, trim: true },  // optional later
      bin: { type: String, trim: true },   // optional later
    },

    // optional evidence
    remarks: { type: String, trim: true },
  },
  { timestamps: true }
);

AuditLineSchema.index({ auditId: 1, skuId: 1 }, { unique: true });
AuditLineSchema.index({ storeId: 1, skuId: 1 });

module.exports = mongoose.model("AuditLine", AuditLineSchema);
