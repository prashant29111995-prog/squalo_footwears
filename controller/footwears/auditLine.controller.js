const XLSX = require("xlsx");
const mongoose = require("mongoose");
const Audit = require("../../models/footwears/Audit");
const AuditLine = require("../../models/footwears/AuditLine");
const Sku = require("../../models/footwears/Sku");
const Article = require("../../models/footwears/Article");



const pick = (obj, keys) =>
  keys.reduce((acc, k) => {
    if (obj && obj[k] !== undefined) acc[k] = obj[k];
    return acc;
  }, {});

// helper

/* ---------------- helpers ---------------- */

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

function normStr(v) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

// Read value from row object with tolerant header names
function getCell(row, aliases = []) {
  for (const k of aliases) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return row[k];
  }
  // also try case-insensitive match
  const keys = Object.keys(row || {});
  for (const key of keys) {
    const up = key.toUpperCase().trim();
    if (aliases.map((a) => a.toUpperCase()).includes(up)) {
      const v = row[key];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
  }
  return "";
}

// Basic color alias dictionary (extend anytime)
const COLOR_ALIASES = {
  MHD:"MHD"
};

function normalizeToken(tokenRaw) {
  const t = String(tokenRaw || "").trim().toUpperCase();
  if (!t) return "";
  return COLOR_ALIASES[t] || t;
}

/**
 * Parse colors with order preserved.
 * Input can be:
 * - "BLK/WHT"
 * - "BLACK/WHITE"
 * - ["BLACK","WHITE"]
 */
function parseColors(input) {
  let raw = "";
  if (Array.isArray(input)) raw = input.join("/");
  else raw = String(input || "");

  raw = raw.trim();
  if (!raw) return null;

  const tokensRaw = raw
    .split(/[\/,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const tokens = tokensRaw.map(normalizeToken).filter(Boolean);
  if (!tokens.length) return null;

  const normalized = tokens.join("/");

  return { raw, normalized, tokens };
}

function buildSkuCode({ brand, articleName, colorsTokens, size }) {
  // skuCode: BRAND-ARTICLE-COLOR1_COLOR2-SIZE
  const colorPart = (colorsTokens || []).map((t) => String(t).replace(/\s+/g, "")).join("_");
  const safeBrand = String(brand).trim().toUpperCase().replace(/\s+/g, "");
  const safeArticle = String(articleName).trim().toUpperCase().replace(/\s+/g, "");
  const safeSize = String(size).trim();
  return `${safeBrand}-${safeArticle}-${colorPart}-${safeSize}`;
}

// Article model compatibility:
// some of your earlier code uses { name }, newer uses { articleName }.
// This helper makes it safe.


async function ensureEditableAudit(auditId) {
  const audit = await Audit.findById(auditId);
  if (!audit) return { error: { code: 404, message: "Audit not found" } };
  if (audit.status !== "DRAFT") return { error: { code: 409, message: "Audit lines editable only in DRAFT" } };
  return { audit };
}

/**
 * POST /audits/:auditId/lines
 * body: { skuId, countedQty, location? }
 */
exports.create = async (req, res) => {
  try {
    const { auditId } = req.params;
    if (!isValidObjectId(auditId)) {
      return res.status(400).json({ ok: false, message: "Invalid auditId" });
    }

    // Ensure audit exists + is editable (DRAFT only)
    const { error } = await ensureEditableAudit(auditId);
    if (error) return res.status(error.code).json({ ok: false, message: error.message });

    const payload = pick(req.body, ["skuId", "countedQty", "location", "remarks"]);
    if (!payload.skuId || payload.countedQty === undefined) {
      return res.status(400).json({ ok: false, message: "skuId and countedQty are required" });
    }

    if (!isValidObjectId(payload.skuId)) {
      return res.status(400).json({ ok: false, message: "Invalid skuId" });
    }

    // ✅ Load audit header to get storeId (required by AuditLine schema)
    const audit = await Audit.findById(auditId).lean();
    if (!audit) {
      return res.status(404).json({ ok: false, message: "Audit not found" });
    }

    const sku = await Sku.findById(payload.skuId).lean();
    if (!sku || sku.isActive === false) {
      return res.status(404).json({ ok: false, message: "SKU not found/inactive" });
    }

    const qty = Number(payload.countedQty);
    if (Number.isNaN(qty) || qty < 0) {
      return res.status(400).json({ ok: false, message: "countedQty must be >= 0" });
    }

    // ✅ Upsert by (auditId, skuId) to avoid duplicates
    const line = await AuditLine.findOneAndUpdate(
      { auditId, skuId: payload.skuId },
      {
        $set: {
          auditId,
          storeId: audit.storeId,               // ✅ FIX: always from audit header
          skuId: payload.skuId,
          countedQty: qty,
          location: payload.location || {},
          remarks: payload.remarks || "",

          // OPTIONAL: denormalized snapshot fields (recommended for reports/UI speed)
          skuCode: sku.skuCode,
          brand: sku.brand,
          articleName: sku.articleName,
          size: sku.size,
          // If you store colors array in sku: take first raw
          color: sku?.colors?.[0]?.raw || "",
          // OPTIONAL: category from audit scope
          category: audit?.scope?.category || audit?.category || "",
        },
      },
      { new: true, upsert: true, runValidators: true }
    );

    return res.status(201).json({ ok: true, data: line });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ ok: false, message: "Duplicate audit line for same SKU" });
    }
    return res.status(500).json({ ok: false, message: "Failed to create audit line", error: err.message });
  }
};


/**
 * GET /audits/:auditId/lines
 */
exports.list = async (req, res) => {
  try {
    const { auditId } = req.params;
    if (!isValidObjectId(auditId)) return res.status(400).json({ ok: false, message: "Invalid auditId" });

    const lines = await AuditLine.find({ auditId }).populate("skuId").lean();
    return res.json({ ok: true, data: lines });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to list audit lines", error: err.message });
  }
};

/**
 * PATCH /audits/:auditId/lines/:lineId
 */
exports.update = async (req, res) => {
  try {
    const { auditId, lineId } = req.params;
    if (!isValidObjectId(auditId) || !isValidObjectId(lineId)) {
      return res.status(400).json({ ok: false, message: "Invalid auditId/lineId" });
    }

    const { error } = await ensureEditableAudit(auditId);
    if (error) return res.status(error.code).json({ ok: false, message: error.message });

    const updates = pick(req.body, ["countedQty", "location", "remarks"]);
    if (updates.countedQty !== undefined) {
      const qty = Number(updates.countedQty);
      if (Number.isNaN(qty) || qty < 0) {
        return res.status(400).json({ ok: false, message: "countedQty must be >= 0" });
      }
      updates.countedQty = qty;
    }

    const line = await AuditLine.findOneAndUpdate(
      { _id: lineId, auditId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!line) return res.status(404).json({ ok: false, message: "Audit line not found" });

    return res.json({ ok: true, data: line });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to update audit line", error: err.message });
  }
};

/**
 * DELETE /audits/:auditId/lines/:lineId
 */
exports.remove = async (req, res) => {
  try {
    const { auditId, lineId } = req.params;
    if (!isValidObjectId(auditId) || !isValidObjectId(lineId)) {
      return res.status(400).json({ ok: false, message: "Invalid auditId/lineId" });
    }

    const { error } = await ensureEditableAudit(auditId);
    if (error) return res.status(error.code).json({ ok: false, message: error.message });

    const del = await AuditLine.deleteOne({ _id: lineId, auditId });
    if (!del.deletedCount) return res.status(404).json({ ok: false, message: "Audit line not found" });

    return res.json({ ok: true, message: "Audit line deleted" });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to delete audit line", error: err.message });
  }
};
exports.uploadExcel = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { auditId } = req.params;
    if (!mongoose.isValidObjectId(auditId)) {
      return res.status(400).json({ ok: false, message: "Invalid auditId" });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ ok: false, message: "Excel file is required (field: file)" });
    }

    const audit = await Audit.findById(auditId).lean();
    if (!audit) return res.status(404).json({ ok: false, message: "Audit not found" });
    if (audit.status !== "DRAFT") {
      return res.status(400).json({ ok: false, message: "Audit is not editable" });
    }

    // Parse workbook
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

    const COL = {
      brand: ["Brand", "BRAND"],
      article: ["Article", "Article Name", "ArticleName", "ARTICLE", "ARTICLENAME"],
      color: ["Color", "Colour", "COLOR", "COLOUR"],
      size: ["Size", "SIZE"],
      mrp: ["MRP", "Mrp", "mrp"],
      category: ["Category", "CATEGORY", "Cat", "CAT"],
      qty: ["Qty", "QTY", "Quantity", "QUANTITY"], // optional (if you want)
    };

    const errors = [];
    const rawItems = [];

    // Rows -> normalized items
    rows.forEach((r, idx) => {
      const rowNo = idx + 2;

      const brand = normStr(getCell(r, COL.brand));
      const articleName = normStr(getCell(r, COL.article));
      const colorRaw = normStr(getCell(r, COL.color));
      const sizeNum = Number(getCell(r, COL.size));
      const mrpNum = Number(getCell(r, COL.mrp)) || 0;

      let category = normStr(getCell(r, COL.category));
      if (!category) category = normStr(audit?.scope?.category || audit?.category || "");
      category = (category || "").toUpperCase();

      const ALLOWED = new Set(["MEN", "WOMEN", "KIDS", "UNISEX"]);
      if (!ALLOWED.has(category)) {
        errors.push({
          row: rowNo,
          message: `Invalid Category: ${category || "blank"} (Allowed: MEN/WOMEN/KIDS/UNISEX)`,
        });
        return;
      }

      if (!brand || !articleName || !colorRaw || Number.isNaN(sizeNum) || sizeNum <= 0) {
        errors.push({ row: rowNo, message: "Missing/invalid Brand/Article/Color/Size" });
        return;
      }

      // Optional qty column support (default 1)
      const qtyCell = getCell(r, COL.qty);
      const qty = qtyCell === "" ? 1 : Number(qtyCell);
      if (!Number.isFinite(qty) || qty <= 0) {
        errors.push({ row: rowNo, message: `Invalid Qty: ${qtyCell}` });
        return;
      }

      rawItems.push({
        row: rowNo,
        brand,
        articleName,
        category,
        colorRaw,
        size: sizeNum,
        mrp: mrpNum,
        qty,
      });
    });

    // Group by skuCode
    const grouped = new Map(); // skuCode -> aggregated
    for (const it of rawItems) {
      const c = parseColors(it.colorRaw);
      if (!c) {
        errors.push({ row: it.row, message: `Invalid color: ${it.colorRaw}` });
        continue;
      }

      const skuCode = buildSkuCode({
        brand: it.brand,
        articleName: it.articleName,
        colorsTokens: c.tokens,
        size: it.size,
      });

      const prev = grouped.get(skuCode);
      if (!prev) {
        grouped.set(skuCode, {
          row: it.row,
          brand: it.brand,
          articleName: it.articleName,
          category: it.category,
          mrp: it.mrp,
          size: it.size,
          colorRaw: it.colorRaw,
          colorsParsed: c,
          skuCode,
          countedQty: it.qty, // ✅ uses qty column if present
        });
      } else {
        prev.countedQty += it.qty;
      }
    }

    // If you want: block upload when fatal errors exist
    // (your call—keeping your current style: still proceeds)
    // if (errors.length) return res.status(400).json({ ok:false, errors });

    const auditObjectId = new mongoose.Types.ObjectId(auditId);

    // Do everything atomically (recommended)
    await session.withTransaction(async () => {
      // 1) UPSERT ARTICLES
      const uniqueArticleKeys = new Map(); // key -> {brand, articleName, category, mrp}
      for (const g of grouped.values()) {
        uniqueArticleKeys.set(`${g.brand}__${g.articleName}`, {
          brand: g.brand,
          articleName: g.articleName,
          category: g.category,
          mrp: g.mrp,
        });
      }

      const articleOps = [];
      for (const a of uniqueArticleKeys.values()) {
        articleOps.push({
          updateOne: {
            filter: { brand: a.brand, articleName: a.articleName },
            update: {
              $setOnInsert: {
                brand: a.brand,
                articleName: a.articleName,
                category: a.category,
                meta: { mrp: Number(a.mrp) || 0 }, // ✅ correct path
                isActive: true,
              },
            },
            upsert: true,
          },
        });
      }

      let articlesUpserted = { upserted: 0, modified: 0, matched: 0 };
      if (articleOps.length) {
        const bwA = await Article.bulkWrite(articleOps, { ordered: false, session });
        articlesUpserted = {
          upserted: bwA.upsertedCount || 0,
          modified: bwA.modifiedCount || 0,
          matched: bwA.matchedCount || 0,
        };
      }

      // Fetch all article IDs for mapping
      const articlePairs = [...uniqueArticleKeys.values()].map((a) => ({
        brand: a.brand,
        articleName: a.articleName,
      }));

      const articles = articlePairs.length
        ? await Article.find(
            { $or: articlePairs },
            { _id: 1, brand: 1, articleName: 1 }
          ).lean({ session })
        : [];

      const articleMap = new Map(
        articles.map((a) => [`${normStr(a.brand)}__${normStr(a.articleName)}`, a])
      );

      // 2) UPSERT SKUS
      const skuOps = [];
      for (const g of grouped.values()) {
        const artKey = `${g.brand}__${g.articleName}`;
        const art = articleMap.get(artKey);

        if (!art?._id) {
          errors.push({ row: g.row || "-", message: `Article missing after upsert: ${artKey}` });
          continue;
        }

        skuOps.push({
          updateOne: {
            filter: { skuCode: g.skuCode },
            update: {
              $setOnInsert: {
                articleId: art._id,
                brand: g.brand,
                articleName: g.articleName,
                colors: [
                  {
                    raw: g.colorsParsed.raw,
                    normalized: g.colorsParsed.normalized,
                    tokens: g.colorsParsed.tokens,
                  },
                ],
                size: g.size,
                skuCode: g.skuCode,
                isActive: true,
              },
            },
            upsert: true,
          },
        });
      }

      let skusUpserted = { upserted: 0, modified: 0, matched: 0 };
      if (skuOps.length) {
        const bwS = await Sku.bulkWrite(skuOps, { ordered: false, session });
        skusUpserted = {
          upserted: bwS.upsertedCount || 0,
          modified: bwS.modifiedCount || 0,
          matched: bwS.matchedCount || 0,
        };
      }

      // Fetch sku IDs
      const skuCodes = [...grouped.keys()];
      const skus = skuCodes.length
        ? await Sku.find({ skuCode: { $in: skuCodes } }, { _id: 1, skuCode: 1 }).lean({ session })
        : [];

      const skuMap = new Map(skus.map((s) => [s.skuCode, s]));

      // 3) UPSERT AUDIT LINES (one per sku per audit)
      const lineOps = [];
      for (const g of grouped.values()) {
        const sku = skuMap.get(g.skuCode);
        if (!sku?._id) {
          errors.push({ row: g.row || "-", message: `SKU missing after upsert: ${g.skuCode}` });
          continue;
        }

        lineOps.push({
          updateOne: {
            filter: { auditId: auditObjectId, skuId: sku._id },
            update: {
              $set: {
                auditId: auditObjectId,
                storeId: audit.storeId,
                skuId: sku._id,
                countedQty: g.countedQty,
              },
            },
            upsert: true,
          },
        });
      }

      let linesUpserted = { upserted: 0, modified: 0, matched: 0 };
      
      if (lineOps.length) {
        const bwL = await AuditLine.bulkWrite(lineOps, { ordered: false, session });
        linesUpserted = {
          upserted: bwL.upsertedCount || 0,
          modified: bwL.modifiedCount || 0,
          matched: bwL.matchedCount || 0,
        };
      }

      // Return summary
      res.json({
        ok: true,
        data: {
          rowsRead: rows.length,
          validRows: rawItems.length,
          groupedSkus: grouped.size,
          articles: articlesUpserted,
          skusCreated: skusUpserted,
          linesUpserted: linesUpserted,
          errors,
        },
      });
    });

  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed upload", error: err.message });
  } finally {
    session.endSession();
  }
};