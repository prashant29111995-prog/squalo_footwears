const mongoose = require("mongoose");

const StockInBillLineSchema = new mongoose.Schema(
  {
    billId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockInBill",
      required: true,
      index: true,
    },

    lineNo: {
      type: Number,
      required: true,
      min: 1,
    },

    articleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Article",
      required: true,
      index: true,
    },

    articleName: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    brand: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    color: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    // =========================
    // PURCHASE BATCH
    // =========================

    qty: {
      type: Number,
      required: true,
      min: 1,
    },

    mrp: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      index: true,
    },

    discountPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },

    cost: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      index: true,
    },

    amount: {
      type: Number,
      default: 0,
      min: 0,
    },

    remarks: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

/**
 * Unique line no per bill
 */
StockInBillLineSchema.index(
  { billId: 1, lineNo: 1 },
  { unique: true }
);

/**
 * Same bill can contain
 * same article/color with different MRP batches
 */
StockInBillLineSchema.index({
  billId: 1,
  articleId: 1,
  color: 1,
  mrp: 1,
  cost: 1,
});

/**
 * Reports / search
 */
StockInBillLineSchema.index({
  articleId: 1,
  color: 1,
  mrp: 1,
  cost: 1,
});

StockInBillLineSchema.index({
  brand: 1,
  articleName: 1,
  color: 1,
});

StockInBillLineSchema.pre("save", function (next) {
  const qty = Number(this.qty || 0);
  const mrp = Number(this.mrp || 0);
  const discountPercent = Number(this.discountPercent || 0);

  const calculatedCost =
    mrp - (mrp * discountPercent) / 100;

  this.cost = Number(calculatedCost.toFixed(2));

  this.amount = Number(
    (qty * this.cost).toFixed(2)
  );

  next();
});

module.exports = mongoose.model(
  "StockInBillLine",
  StockInBillLineSchema
);