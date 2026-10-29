const mongoose = require("mongoose");

const SkuSchema = new mongoose.Schema(
  {
    articleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Article",
      required: true,
      index: true,
    },

    brand: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    articleName: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    // Single color (no array now)
    color: {
      raw: {
        type: String,
        required: true,
        trim: true,
      },

      normalized: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
      },

      tokens: [
        {
          type: String,
          trim: true,
          uppercase: true,
        },
      ],
    },

    // New SKU code (no size)
    skuCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },
    // Example: CLD-WINFLOW-1-BLACK_WHITE

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Unique: one SKU per article + color
SkuSchema.index(
  { articleId: 1, "color.normalized": 1 },
  { unique: true }
);

// Filters
SkuSchema.index({ brand: 1, articleName: 1 });
SkuSchema.index({ "color.tokens": 1 });

module.exports = mongoose.model("Sku", SkuSchema);