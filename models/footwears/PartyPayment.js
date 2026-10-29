const mongoose = require("mongoose");

const PartyPaymentSchema = new mongoose.Schema(
  {
    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      required: true,
      index: true,
    },

    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      index: true,
    },

    paymentDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 1,
    },

    paymentMode: {
      type: String,
      enum: ["CASH", "UPI", "BANK", "CHEQUE", "CARD", "OTHER"],
      required: true,
      default: "CASH",
      index: true,
    },

    referenceNo: {
      type: String,
      trim: true,
      uppercase: true,
    },

    note: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "REVERSED"],
      default: "ACTIVE",
      index: true,
    },

    reversedAt: {
      type: Date,
    },

    reversedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    reverseReason: {
      type: String,
      trim: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

PartyPaymentSchema.index({ partyId: 1, paymentDate: -1 });
PartyPaymentSchema.index({ status: 1, createdAt: -1 });
PartyPaymentSchema.index({ referenceNo: 1 });

module.exports = mongoose.model("PartyPayment", PartyPaymentSchema);