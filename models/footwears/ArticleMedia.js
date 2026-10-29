const mongoose = require("mongoose");

const ArticleMediaSchema = new mongoose.Schema(
  {
    articleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Article",
      required: true,
      index: true,
    },

    brand: {
      type: String,
      trim: true,
      uppercase: true,
    },

    articleName: {
      type: String,
      trim: true,
      uppercase: true,
    },

    color: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    images: [
      {
        url: { type: String, required: true },
        filename: { type: String },
        isPrimary: { type: Boolean, default: false },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    isCatalogueVisible: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

ArticleMediaSchema.index({ articleId: 1, color: 1 }, { unique: true });

module.exports = mongoose.model("ArticleMedia", ArticleMediaSchema);