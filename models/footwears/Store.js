const mongoose = require("mongoose");

const StoreSchema = new mongoose.Schema(
  {
    // Optional during migration so existing stores remain usable.
    // New-store creation must require this in the controller.
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      index: true,
      validate: {
        validator: function (value) {
          return !this.isNew || value != null;
        },
        message: "A business is required when creating a new store",
      },
    },

    // Keep the existing globally unique code for compatibility.
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

    type: {
      type: String,
      enum: ["RETAIL", "GODOWN", "WAREHOUSE"],
      default: "RETAIL",
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
    },
    posStockManaged: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Serialises concurrent setup transactions for the same store.
    posStockRevision: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

StoreSchema.index({
  businessId: 1,
  isActive: 1,
  type: 1,
});

// Existing stores may be saved while still awaiting migration.
// New stores created through document validation require ownership.
StoreSchema.pre("validate", function (next) {
  if (this.isNew && !this.businessId) {
    this.invalidate(
      "businessId",
      "A business is required when creating a new store"
    );
  }

  next();
});

module.exports = mongoose.model("Store", StoreSchema);