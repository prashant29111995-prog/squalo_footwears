const mongoose = require("mongoose");

const ReturnItemSchema = new mongoose.Schema(
  {
    skuId: { type: mongoose.Schema.Types.ObjectId, ref: "Sku", required: true },
    skuCode: { type: String, required: true, trim: true, uppercase: true },
    qty: { type: Number, required: true, min: 1 },
    rate: { type: Number, required: true, min: 0 }, // return rate per pair
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const ReturnSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
    partyId: { type: mongoose.Schema.Types.ObjectId, ref: "Party", required: true },

    originalBillId: { type: mongoose.Schema.Types.ObjectId, ref: "Bill", required: true },
    returnNo: { type: String, required: true, trim: true, uppercase: true },
    returnDate: { type: Date, default: Date.now },

    status: { type: String, enum: ["DRAFT", "FINAL", "CANCELLED"], default: "DRAFT" },

    items: { type: [ReturnItemSchema], default: [] },
    netTotal: { type: Number, default: 0 },

    notes: { type: String, trim: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

ReturnSchema.index({ storeId: 1, returnNo: 1 }, { unique: true });

module.exports = mongoose.model("Return", ReturnSchema);
