// /models/Audit.js
const mongoose = require("mongoose");

const AuditSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },

    auditType: { type: String, enum: ["OPENING", "ROUTINE"], required: true },

    // ✅ New scope design
    scope: {
      categoryGroup: { type: String, enum: ["MEN", "WOMEN", "KIDS", "UNISEX"], required: true },
      category: { type: String, required: true, trim: true, uppercase: true }, // e.g. "GENTS PU", "EVA SHOES"
    },

    auditDate: { type: Date, required: true },

    status: { type: String, enum: ["DRAFT", "SUBMITTED", "APPROVED", "LOCKED"], default: "DRAFT" },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

// ✅ One approved opening audit per store per categoryGroup+category
AuditSchema.index(
  { storeId: 1, auditType: 1, "scope.categoryGroup": 1, "scope.category": 1, status: 1 },
  { partialFilterExpression: { auditType: "OPENING", status: "APPROVED" } }
);

// ✅ fast list by store + group + category + date
AuditSchema.index({ storeId: 1, "scope.categoryGroup": 1, "scope.category": 1, auditDate: -1 });

module.exports = mongoose.model("Audit", AuditSchema);
