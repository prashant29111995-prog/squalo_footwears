const mongoose = require("mongoose");

const Audit = require("../../models/footwears/Audit");
const AuditLine = require("../../models/footwears/AuditLine");
const Store = require("../../models/footwears/store");
const StockLedger = require("../../models/footwears/StockLedger");

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const pick = (obj, keys) =>
  keys.reduce((acc, k) => {
    if (obj && obj[k] !== undefined) acc[k] = obj[k];
    return acc;
  }, {});

function mustBeEditable(audit) {
  return audit.status === "DRAFT";
}

const up = (v) => String(v || "").trim().toUpperCase();

function normalizeScope(scope) {
  return {
    categoryGroup: up(scope?.categoryGroup),
    category: up(scope?.category),
  };
}

/**
 * Create Audit
 * POST /audits
 * body: { storeId, auditType, scope:{categoryGroup, category}, auditDate, notes? }
 */
exports.create = async (req, res) => {
  try {
    const payload = pick(req.body, ["storeId", "auditType", "scope", "auditDate", "notes"]);

    const scope = normalizeScope(payload.scope);

    if (!payload.storeId || !payload.auditType || !scope.categoryGroup || !scope.category || !payload.auditDate) {
      return res.status(400).json({
        ok: false,
        message: "storeId, auditType, scope.categoryGroup, scope.category, auditDate are required",
      });
    }

    if (!isValidObjectId(payload.storeId)) {
      return res.status(400).json({ ok: false, message: "Invalid storeId" });
    }

    const store = await Store.findById(payload.storeId).lean();
    if (!store || store.isActive === false) {
      return res.status(404).json({ ok: false, message: "Store not found/inactive" });
    }

    payload.auditType = up(payload.auditType);
    payload.scope = scope;
    payload.auditDate = new Date(payload.auditDate);

    if (!["OPENING", "ROUTINE"].includes(payload.auditType)) {
      return res.status(400).json({ ok: false, message: "auditType must be OPENING or ROUTINE" });
    }

    if (!["MEN", "WOMEN", "KIDS", "UNISEX"].includes(payload.scope.categoryGroup)) {
      return res.status(400).json({ ok: false, message: "Invalid scope.categoryGroup" });
    }

    const audit = await Audit.create({
      ...payload,
      status: "DRAFT",
      createdBy: req.user?._id,
    });

    return res.status(201).json({ ok: true, data: audit });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to create audit", error: err.message });
  }
};


/**
 * List audits
 * GET /audits?storeId=&categoryGroup=&category=&auditType=&status=&from=&to=
 */
exports.list = async (req, res) => {
  try {
    const {
      storeId,
      categoryGroup,
      category,
      auditType,
      status,
      from,
      to,
      page = 1,
      limit = 25,
    } = req.query;

    const filter = {};

    if (storeId) {
      if (!isValidObjectId(storeId)) return res.status(400).json({ ok: false, message: "Invalid storeId" });
      filter.storeId = storeId;
    }

    if (categoryGroup) filter["scope.categoryGroup"] = up(categoryGroup);
    if (category) filter["scope.category"] = up(category);

    if (auditType) filter.auditType = up(auditType);
    if (status) filter.status = up(status);

    if (from || to) {
      filter.auditDate = {};
      if (from) filter.auditDate.$gte = new Date(from);
      if (to) filter.auditDate.$lte = new Date(to);
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Audit.find(filter).sort({ auditDate: -1, createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Audit.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      data: items,
      meta: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to list audits", error: err.message });
  }
};

/**
 * Get audit by id (with lines count)
 */
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ ok: false, message: "Invalid audit id" });

    const audit = await Audit.findById(id).lean();
    if (!audit) return res.status(404).json({ ok: false, message: "Audit not found" });

    const linesCount = await AuditLine.countDocuments({ auditId: id });

    return res.json({ ok: true, data: { ...audit, linesCount } });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to get audit", error: err.message });
  }
};

/**
 * Update audit header (only in DRAFT)
 * PATCH /audits/:id
 */
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ ok: false, message: "Invalid audit id" });

    const audit = await Audit.findById(id);
    if (!audit) return res.status(404).json({ ok: false, message: "Audit not found" });

    if (!mustBeEditable(audit)) {
      return res.status(409).json({ ok: false, message: "Audit not editable after submission" });
    }

    const updates = pick(req.body, ["auditDate", "notes", "scope"]);

    if (updates.scope) {
      const s = normalizeScope(updates.scope);
      if (s.categoryGroup) audit.scope.categoryGroup = s.categoryGroup;
      if (s.category) audit.scope.category = s.category;
    }

    if (updates.auditDate) audit.auditDate = new Date(updates.auditDate);
    if (updates.notes !== undefined) audit.notes = updates.notes;

    await audit.save();
    return res.json({ ok: true, data: audit });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to update audit", error: err.message });
  }
};


/**
 * Delete audit (only if DRAFT and has no lines)
 * DELETE /audits/:id
 */
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ ok: false, message: "Invalid audit id" });

    const audit = await Audit.findById(id);
    if (!audit) return res.status(404).json({ ok: false, message: "Audit not found" });

    if (audit.status !== "DRAFT") {
      return res.status(409).json({ ok: false, message: "Only DRAFT audits can be deleted" });
    }

    const linesCount = await AuditLine.countDocuments({ auditId: id });
    if (linesCount > 0) {
      return res.status(409).json({ ok: false, message: "Delete audit lines first" });
    }

    await Audit.deleteOne({ _id: id });
    return res.json({ ok: true, message: "Audit deleted" });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to delete audit", error: err.message });
  }
};

/**
 * Submit audit (DRAFT -> SUBMITTED)
 * POST /audits/:id/submit
 */
exports.submit = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ ok: false, message: "Invalid audit id" });

    const audit = await Audit.findById(id);
    if (!audit) return res.status(404).json({ ok: false, message: "Audit not found" });

    if (audit.status !== "DRAFT") {
      return res.status(409).json({ ok: false, message: "Only DRAFT audits can be submitted" });
    }

    const linesCount = await AuditLine.countDocuments({ auditId: id });
    if (linesCount === 0) {
      return res.status(409).json({ ok: false, message: "Cannot submit empty audit (add lines)" });
    }

    audit.status = "SUBMITTED";
    audit.submittedBy = req.user?._id;
    await audit.save();

    return res.json({ ok: true, message: "Audit submitted", data: audit });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to submit audit", error: err.message });
  }
};

/**
 * Approve audit (SUBMITTED -> APPROVED) and generate ledger adjustments
 * POST /audits/:id/approve
 *
 * Logic:
 * - Find previous approved audit for same store+category (OPENING or ROUTINE) with auditDate < current
 * - Compare SKU quantities: prev - current => consumption
 * - Write StockLedger entries:
 *    - OPENING: set baseline (qtyDelta = countedQty)
 *    - ROUTINE: AUDIT_ADJUSTMENT delta = (currentQty - prevQty) (so ledger reflects reality)
 */
exports.approve = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ ok: false, message: "Invalid audit id" });

    session.startTransaction();

    const audit = await Audit.findById(id).session(session);
    if (!audit) {
      await session.abortTransaction();
      return res.status(404).json({ ok: false, message: "Audit not found" });
    }

    if (audit.status !== "SUBMITTED") {
      await session.abortTransaction();
      return res.status(409).json({ ok: false, message: "Only SUBMITTED audits can be approved" });
    }

    // Opening approval rule: only one approved opening per store+category
    if (audit.auditType === "OPENING") {
      const existingOpening = await Audit.findOne({
        _id: { $ne: audit._id },
        storeId: audit.storeId,
        auditType: "OPENING",
        "scope.categoryGroup": audit.scope.categoryGroup,
    "scope.category": audit.scope.category,
        status: { $in: ["APPROVED", "LOCKED"] },
      })
        .session(session)
        .lean();

      if (existingOpening) {
        await session.abortTransaction();
        return res.status(409).json({
          ok: false,
          message: "Opening stock already approved for this store + category group + category",
        });
      }
    }

    const lines = await AuditLine.find({ auditId: audit._id }).session(session).lean();
    if (!lines.length) {
      await session.abortTransaction();
      return res.status(409).json({ ok: false, message: "No lines found to approve" });
    }

    // previous approved snapshot (same store+category)
    const prevAudit = await Audit.findOne({
      storeId: audit.storeId,
      "scope.categoryGroup": audit.scope.categoryGroup,
  "scope.category": audit.scope.category,
      status: { $in: ["APPROVED", "LOCKED"] },
      auditDate: { $lt: audit.auditDate },
    })
      .sort({ auditDate: -1 })
      .session(session)
      .lean();

    let prevMap = new Map(); // skuId -> countedQty
    if (prevAudit) {
      const prevLines = await AuditLine.find({ auditId: prevAudit._id }).session(session).lean();
      prevMap = new Map(prevLines.map((l) => [String(l.skuId), Number(l.countedQty || 0)]));
    }

    const nowMap = new Map(lines.map((l) => [String(l.skuId), Number(l.countedQty || 0)]));

    // Build ledger entries
    const ledgerEntries = [];

    if (audit.auditType === "OPENING" || !prevAudit) {
      // Opening baseline
      for (const [skuId, qty] of nowMap.entries()) {
        ledgerEntries.push({
          storeId: audit.storeId,
          skuId,
          txnType: "OPENING",
          qtyDelta: qty, // baseline
          ref: { auditId: audit._id, note: "Opening stock audit" },
          txnAt: audit.auditDate,
          createdBy: req.user?._id,
        });
      }
    } else {
      // Routine audit adjustment: delta = current - previous
      // This ensures ledger always matches physical truth after approval
      const skuIds = new Set([...prevMap.keys(), ...nowMap.keys()]);
      for (const skuId of skuIds) {
        const prevQty = prevMap.get(skuId) || 0;
        const nowQty = nowMap.get(skuId) || 0;
        const delta = nowQty - prevQty;

        if (delta !== 0) {
          ledgerEntries.push({
            storeId: audit.storeId,
            skuId,
            txnType: "AUDIT_ADJUSTMENT",
            qtyDelta: delta,
            ref: { auditId: audit._id, note: "Audit adjustment to match physical count" },
            txnAt: audit.auditDate,
            createdBy: req.user?._id,
          });
        }
      }
    }

    if (ledgerEntries.length) {
      await StockLedger.insertMany(ledgerEntries, { ordered: false, session });
    }

    audit.status = "APPROVED";
    audit.approvedBy = req.user?._id;
    await audit.save({ session });

    await session.commitTransaction();

    return res.json({
      ok: true,
      message: "Audit approved and ledger updated",
      data: { auditId: audit._id, ledgerEntries: ledgerEntries.length, prevAuditId: prevAudit?._id || null },
    });
  } catch (err) {
    try { await session.abortTransaction(); } catch {}
    return res.status(500).json({ ok: false, message: "Failed to approve audit", error: err.message });
  } finally {
    session.endSession();
  }
};

/**
 * Lock audit (APPROVED -> LOCKED)
 * POST /audits/:id/lock
 */
exports.lock = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ ok: false, message: "Invalid audit id" });

    const audit = await Audit.findById(id);
    if (!audit) return res.status(404).json({ ok: false, message: "Audit not found" });

    if (audit.status !== "APPROVED") {
      return res.status(409).json({ ok: false, message: "Only APPROVED audits can be locked" });
    }

    audit.status = "LOCKED";
    await audit.save();

    return res.json({ ok: true, message: "Audit locked", data: audit });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to lock audit", error: err.message });
  }
};
