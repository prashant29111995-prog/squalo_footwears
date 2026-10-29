// /models/Bill.js
const mongoose = require("mongoose");
const { BillLineSchema } = require("./BillLine");

const BillSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },

    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      required: true,
      index: true,
    },

    partyName: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    billNo: {
      type: String,
      trim: true,
      uppercase: true,
    },

    billDate: {
      type: Date,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["DRAFT", "FINAL", "CANCELLED"],
      default: "DRAFT",
      index: true,
    },

    lines: {
      type: [BillLineSchema],
      default: [],
    },

    totals: {
      subTotal: {
        type: Number,
        default: 0,
        min: 0,
      },

      discountTotal: {
        type: Number,
        default: 0,
        min: 0,
      },

      netTotal: {
        type: Number,
        default: 0,
        min: 0,
      },

      qtyTotal: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    finalizedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    finalizedAt: {
      type: Date,
    },

    cancelledAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

BillSchema.index({ storeId: 1, billDate: -1 });
BillSchema.index({ storeId: 1, billNo: 1 });
BillSchema.index({ partyId: 1, billDate: -1 });
BillSchema.index({ status: 1, createdAt: -1 });

BillSchema.methods.recalculateTotals = function () {
  let subTotal = 0;
  let discountTotal = 0;
  let netTotal = 0;
  let qtyTotal = 0;

  for (const line of this.lines || []) {
    const qty = Number(line.qty || 0);
    const mrp = Number(line.mrp || 0);
    const rate = Number(line.rate || 0);

    const gross = qty * mrp;
    const amount = qty * rate;
    const discountAmount = Math.max(gross - amount, 0);

    line.amount = Number(amount.toFixed(2));

    qtyTotal += qty;
    subTotal += gross;
    discountTotal += discountAmount;
    netTotal += amount;
  }

  this.totals.subTotal = Number(subTotal.toFixed(2));
  this.totals.discountTotal = Number(discountTotal.toFixed(2));
  this.totals.netTotal = Number(netTotal.toFixed(2));
  this.totals.qtyTotal = qtyTotal;
};

BillSchema.pre("save", function (next) {
  this.recalculateTotals();
  next();
});

module.exports = mongoose.model("Bill", BillSchema);