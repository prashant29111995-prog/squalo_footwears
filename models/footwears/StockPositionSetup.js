const mongoose = require("mongoose");

const { Schema } = mongoose;

const StockPositionSetupSchema = new Schema(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },

    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },

    articleId: {
      type: Schema.Types.ObjectId,
      ref: "Article",
      required: true,
    },

    skuId: {
      type: Schema.Types.ObjectId,
      ref: "Sku",
      required: true,
    },

    color: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    mrpPaise: {
      type: Number,
      required: true,
    },

    costPaise: {
      type: Number,
      required: true,
    },

    countedQty: {
      type: Number,
      required: true,
      min: 1,
    },

    positionIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "StockPosition",
      },
    ],

    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    verifiedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

StockPositionSetupSchema.index(
  {
    storeId: 1,
    articleId: 1,
    color: 1,
    mrpPaise: 1,
    costPaise: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model(
  "StockPositionSetup",
  StockPositionSetupSchema
);