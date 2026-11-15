const mongoose = require("mongoose");

const { Schema } = mongoose;

function integerField(required = true) {
  return {
    type: Number,
    required,
    min: 0,
    validate: {
      validator: Number.isSafeInteger,
      message: "Value must be a non-negative safe integer",
    },
  };
}

const StockPositionSchema = new Schema(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      immutable: true,
    },

    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      immutable: true,
    },

    locationId: {
      type: Schema.Types.ObjectId,
      ref: "StoreLocation",
      required: true,
      immutable: true,
    },

    rackId: {
      type: Schema.Types.ObjectId,
      ref: "Rack",
      required: true,
      immutable: true,
    },

    skuId: {
      type: Schema.Types.ObjectId,
      ref: "Sku",
      required: true,
      immutable: true,
    },

    // Examples: "6", "7", "8", "10C", "FREE".
    size: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 30,
      immutable: true,
    },

    sizeSystem: {
      type: String,
      enum: ["UK", "EU", "US", "LABEL"],
      required: true,
      default: "UK",
      immutable: true,
    },

    condition: {
      type: String,
      enum: ["FRESH", "FACTORY_SECOND", "DAMAGED"],
      required: true,
      default: "FRESH",
      immutable: true,
    },

    mrpPaise: {
      ...integerField(),
      immutable: true,
    },

    costPaise: {
      ...integerField(),
      immutable: true,
    },

    qty: {
      ...integerField(),
      default: 0,
    },

    // New positions are excluded from POS until reconciled.
    isVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    verifiedAt: {
      type: Date,
    },

    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

StockPositionSchema.index(
  {
    businessId: 1,
    storeId: 1,
    rackId: 1,
    skuId: 1,
    size: 1,
    sizeSystem: 1,
    condition: 1,
    mrpPaise: 1,
    costPaise: 1,
  },
  {
    unique: true,
  }
);

StockPositionSchema.index({
  businessId: 1,
  storeId: 1,
  isVerified: 1,
  isActive: 1,
  skuId: 1,
  size: 1,
});

StockPositionSchema.pre("validate", function (next) {
  if (
    this.isVerified &&
    (!this.verifiedAt || !this.verifiedBy)
  ) {
    this.invalidate(
      "isVerified",
      "Verified stock requires a verification date and user"
    );
  }

  next();
});

module.exports = mongoose.model(
  "StockPosition",
  StockPositionSchema
);