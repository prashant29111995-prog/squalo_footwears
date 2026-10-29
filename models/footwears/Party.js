const mongoose = require("mongoose");

const PartySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    phone: {
      type: String,
      trim: true,
      index: true,
    },

    whatsapp: {
      type: String,
      trim: true,
    },

    partyType: {
      type: String,
      enum: ["SUPPLIER", "CUSTOMER", "BOTH"],
      required: true,
      default: "CUSTOMER",
      index: true,
    },

    address: {
      type: String,
      trim: true,
    },

    city: {
      type: String,
      trim: true,
      uppercase: true,
    },

    area: {
      type: String,
      trim: true,
      uppercase: true,
    },

    gstin: {
      type: String,
      trim: true,
      uppercase: true,
    },

    notes: {
      type: String,
      trim: true,
    },

    creditLimit: {
      type: Number,
      default: 0,
      min: 0,
    },

    openingBalance: {
      type: Number,
      default: 0,
    },

    openingBalanceType: {
      type: String,
      enum: ["DR", "CR"],
      default: "DR",
    },

    currentBalance: {
      type: Number,
      default: 0,
    },

    totalSalesAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalReceivedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalProfitEarned: {
      type: Number,
      default: 0,
    },

    totalBills: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastSaleDate: {
      type: Date,
    },

    lastPaymentDate: {
      type: Date,
    },

    publicLedgerToken: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

PartySchema.index({ partyType: 1, isActive: 1 });
PartySchema.index({ city: 1, area: 1 });

module.exports = mongoose.model("Party", PartySchema);