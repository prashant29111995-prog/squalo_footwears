// /models/BillLine.js
const mongoose = require("mongoose");

// Embedded line schema for Bill.lines[]
const BillLineSchema = new mongoose.Schema(
  {
    articleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Article",
      required: true,
    },

    brand: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    articleName: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    color: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    // =========================
    // SELECTED STOCK BATCH
    // =========================

    mrp: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    cost: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    purchaseDiscountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // =========================
    // SALE DETAILS
    // =========================

    qty: {
      type: Number,
      required: true,
      min: 1,
    },

    rate: {
      type: Number,
      required: true,
      min: 0,
    },

    discount: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
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

    snap: {
      categoryGroup: {
        type: String,
        trim: true,
        uppercase: true,
      },

      category: {
        type: String,
        trim: true,
        uppercase: true,
      },
    },
  },
  { timestamps: true }
);

module.exports = { BillLineSchema };