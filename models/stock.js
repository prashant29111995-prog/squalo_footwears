const mongoose = require("mongoose");

const StockSchema = new mongoose.Schema(
  {
    articleId: { type: mongoose.Schema.Types.ObjectId, ref: "Article", required: true, index: true },
    articleName: { type: String, required: true, trim: true, uppercase: true, index: true },
brand: { type: String, required: true, trim: true, uppercase: true, index: true },
    color: { type: String, required: true, trim: true, uppercase: true, index: true },
    size: { type: String, required: true, trim: true, index: true },

    location: { type: String, required: true, trim: true, index: true },

    quantity: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// Prevent duplicate rows for same combo
StockSchema.index(
  { brand: 1, articleId: 1, color: 1, size: 1, location: 1 },
  { unique: true }
);

module.exports = mongoose.model("Stock", StockSchema);
