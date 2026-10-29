// /models/Article.js
const mongoose = require("mongoose");

const ArticleSchema = new mongoose.Schema(
  {
    brand: { type: String, required: true, trim: true, uppercase: true }, // "CLD"
    articleName: { type: String, required: true, trim: true, uppercase: true }, // "WINFLOW-1"

    // ✅ Group (high-level bucket used for audits)
    categoryGroup: {
      type: String,
      enum: ["MEN", "WOMEN", "KIDS", "UNISEX"],
      required: true,
      trim: true,
      uppercase: true,
    },

    // ✅ Sub-category (your dynamic config list)
    category: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    meta: {
      mrp: { type: Number, min: 0 },
      notes: { type: String, trim: true },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Prevent duplicates of same brand+articleName
ArticleSchema.index({ brand: 1, articleName: 1 }, { unique: true });

// ✅ Helpful for filtering screens
ArticleSchema.index({ categoryGroup: 1, category: 1 });
ArticleSchema.index({ isActive: 1, brand: 1 });

module.exports = mongoose.model("Article", ArticleSchema);
