const mongoose = require("mongoose");

const StockLedgerSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
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
      index: true,
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
    // BATCH / PRICE SNAPSHOT
    // =========================

    mrp: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      index: true,
    },

    cost: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      index: true,
    },

    purchaseDiscountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // =========================
    // STOCK MOVEMENT
    // =========================

    txnType: {
      type: String,
      enum: [
        "OPENING",
        "AUDIT_ADJUSTMENT",
        "TRANSFER_IN",
        "TRANSFER_OUT",
        "SALE",
        "SALE_RETURN",
        "DAMAGE",
        "PURCHASE_IN",
        "WHOLESALE_OUT",
      ],
      required: true,
      index: true,
    },

    qtyDelta: {
      type: Number,
      required: true, // +in / -out
    },

    balanceAfter: {
      type: Number,
      default: 0,
      min: 0,
    },

    // =========================
    // REFERENCE INFO
    // =========================

    ref: {
      auditId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Audit",
      },

      stockInBillId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "StockInBill",
      },

      billId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Bill",
      },

      documentNo: {
        type: String,
        trim: true,
      },

      note: {
        type: String,
        trim: true,
      },
    },

    txnAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

/**
 * Main batch index
 * Same article/color can exist in multiple MRP batches
 */
StockLedgerSchema.index({
  storeId: 1,
  articleId: 1,
  color: 1,
  mrp: 1,
  cost: 1,
  txnAt: -1,
});

/**
 * Fast search index
 */
StockLedgerSchema.index({
  storeId: 1,
  brand: 1,
  articleName: 1,
  color: 1,
});

/**
 * Transaction history index
 */
StockLedgerSchema.index({
  txnType: 1,
  txnAt: -1,
});

/**
 * Fast balance calculation index
 */
StockLedgerSchema.index({
  storeId: 1,
  articleId: 1,
  color: 1,
  mrp: 1,
  cost: 1,
  qtyDelta: 1,
});

module.exports = mongoose.model("StockLedger", StockLedgerSchema);