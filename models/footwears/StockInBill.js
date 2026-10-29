const mongoose = require("mongoose");

const STOCK_IN_STATUS = ["DRAFT", "CONFIRMED", "CANCELLED"];

const StockInBillSchema = new mongoose.Schema(
  {
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      required: true,
      index: true,
    },

    supplierName: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    billNo: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    billDate: {
      type: Date,
      required: true,
      index: true,
    },

    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },

    attachment: {
      type: String,
      trim: true,
      default: "",
    },

    status: {
      type: String,
      enum: STOCK_IN_STATUS,
      default: "DRAFT",
      index: true,
    },

    totalQty: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalLines: {
      type: Number,
      default: 0,
      min: 0,
    },

    confirmedAt: {
      type: Date,
      default: null,
    },

    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

StockInBillSchema.index({ supplierId: 1, billDate: -1 });
StockInBillSchema.index({ billNo: 1, supplierId: 1 }, { unique: true });
StockInBillSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("StockInBill", StockInBillSchema);