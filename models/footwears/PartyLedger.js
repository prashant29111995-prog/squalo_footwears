const mongoose = require("mongoose");

const PartyLedgerSchema = new mongoose.Schema(
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

    txnDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    txnType: {
      type: String,
      enum: [
        "OPENING",
        "SALE_BILL",
        "PAYMENT_RECEIVED",
        "PAYMENT_REVERSED",
        "SALE_REVERSED",
        "ADJUSTMENT",
      ],
      required: true,
      index: true,
    },

    debit: {
      type: Number,
      default: 0,
      min: 0,
    },

    credit: {
      type: Number,
      default: 0,
      min: 0,
    },

    balanceAfter: {
      type: Number,
      default: 0,
    },

    balanceType: {
      type: String,
      enum: ["DR", "CR"],
      default: "DR",
    },

    ref: {
      billId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Bill",
      },

      paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PartyPayment",
      },

      documentNo: {
        type: String,
        trim: true,
        uppercase: true,
      },

      paymentMode: {
        type: String,
        enum: ["CASH", "UPI", "BANK", "CHEQUE", "CARD", "OTHER", ""],
        default: "",
      },

      note: {
        type: String,
        trim: true,
      },
    },

    isPublicVisible: {
      type: Boolean,
      default: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

PartyLedgerSchema.index({ partyId: 1, txnDate: 1, createdAt: 1 });
PartyLedgerSchema.index({ partyId: 1, txnType: 1 });
PartyLedgerSchema.index({ "ref.billId": 1 });
PartyLedgerSchema.index({ "ref.paymentId": 1 });

module.exports = mongoose.model("PartyLedger", PartyLedgerSchema);