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
    // Relationship with your business.
// Separate from partyType, which describes supplier/customer accounting.
ownershipType: {
  type: String,
  enum: ["INDEPENDENT_BUYER", "OWNED_OUTLET"],
  default: "INDEPENDENT_BUYER",
  index: true,
},

// Administrative setting. Login access will also require
// an active party, a linked business, and authorised membership.
posEnabled: {
  type: Boolean,
  default: false,
  index: true,
},

// Linked when we implement Business workspaces.
// Leave unset until an actual Business record exists.
businessId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Business",
  index: true,
},
  },
  { timestamps: true }
);

PartySchema.index({ partyType: 1, isActive: 1 });
PartySchema.index({ city: 1, area: 1 });
PartySchema.pre("validate", function (next) {
  const isBuyer =
    this.partyType === "CUSTOMER" || this.partyType === "BOTH";

  if (this.posEnabled && (!this.isActive || !isBuyer)) {
    this.invalidate(
      "posEnabled",
      "POS can only be enabled for an active CUSTOMER or BOTH party"
    );
  }

  if (this.ownershipType === "OWNED_OUTLET" && !isBuyer) {
    this.invalidate(
      "ownershipType",
      "An owned outlet must be a CUSTOMER or BOTH party"
    );
  }

  next();
});
module.exports = mongoose.model("Party", PartySchema);