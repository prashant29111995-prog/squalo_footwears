const mongoose = require("mongoose");

const BusinessSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    // CENTRAL: your distribution business.
    // PARTY: a buying party operating its own POS workspace.
    businessType: {
      type: String,
      enum: ["CENTRAL", "PARTY"],
      required: true,
      default: "PARTY",
      immutable: true,
    },

    // Required for a buying party's workspace.
    // The central business does not need a party account.
    sourcePartyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      required: function () {
        return this.businessType === "PARTY";
      },
      immutable: true,
    },

    ownershipType: {
      type: String,
      enum: [
        "CENTRAL_BUSINESS",
        "INDEPENDENT_BUYER",
        "OWNED_OUTLET",
      ],
      required: true,
      default: "INDEPENDENT_BUYER",
    },

    phone: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },

    gstin: {
      type: String,
      trim: true,
      uppercase: true,
    },

    address: {
      line1: {
        type: String,
        trim: true,
      },
      city: {
        type: String,
        trim: true,
      },
      state: {
        type: String,
        trim: true,
      },
      pincode: {
        type: String,
        trim: true,
      },
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent two workspaces being created for the same party.
// CENTRAL records omit sourcePartyId and are excluded.
BusinessSchema.index(
  { sourcePartyId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourcePartyId: { $type: "objectId" },
    },
  }
);

BusinessSchema.index({
  businessType: 1,
  isActive: 1,
});

BusinessSchema.pre("validate", function (next) {
  if (this.businessType === "CENTRAL") {
    if (this.ownershipType !== "CENTRAL_BUSINESS") {
      this.invalidate(
        "ownershipType",
        "A central business must use CENTRAL_BUSINESS ownership"
      );
    }

    if (this.sourcePartyId) {
      this.invalidate(
        "sourcePartyId",
        "A central business must not link to a buying party"
      );
    }
  }

  if (
    this.businessType === "PARTY" &&
    this.ownershipType === "CENTRAL_BUSINESS"
  ) {
    this.invalidate(
      "ownershipType",
      "A party workspace must be INDEPENDENT_BUYER or OWNED_OUTLET"
    );
  }

  next();
});

module.exports = mongoose.model("Business", BusinessSchema);