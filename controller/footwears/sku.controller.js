const mongoose = require("mongoose");
const Sku = require("../../models/footwears/Sku");
const Article = require("../../models/footwears/Article");
const Stock = require("../../models/footwears/StockLedger");
/* ---------------- helpers ---------------- */

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const pick = (obj, keys) =>
  keys.reduce((acc, k) => {
    if (obj && obj[k] !== undefined) acc[k] = obj[k];
    return acc;
  }, {});

const escapeRegex = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Basic color alias dictionary (extend anytime)
const COLOR_ALIASES = {
  BLK: "BLACK",
  BLAC: "BLACK",
  BLACK: "BLACK",
  WHT: "WHITE",
  WH: "WHITE",
  WHITE: "WHITE",
  NAVY: "NAVY",
  NVY: "NAVY",
  BLUE: "BLUE",
  BLU: "BLUE",
  RED: "RED",
  MAROON: "MAROON",
  GRY: "GREY",
  GRAY: "GREY",
  GREY: "GREY",
  TAN: "TAN",
  BEIGE: "BEIGE",
  GRN: "GREEN",
  GREEN: "GREEN",
  OLIVE: "OLIVE",
  BRN: "BROWN",
  BROWN: "BROWN",
  PNK: "PINK",
  PINK: "PINK",
  YLW: "YELLOW",
  YELLOW: "YELLOW",
  ORG: "ORANGE",
  ORANGE: "ORANGE",
  // add more as you face them
};

function normalizeToken(tokenRaw) {
  const t = String(tokenRaw || "").trim().toUpperCase();
  if (!t) return "";
  return COLOR_ALIASES[t] || t; // if unknown, keep user token but standardized casing
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
    .split(/[\/,]+/g)        // allow "/" or "," separator
    .map((s) => s.trim())
    .filter(Boolean);

  const tokens = tokensRaw.map(normalizeToken).filter(Boolean);

  // normalized string with order
  const normalized = tokens.join("/");

  return {
    raw,
    normalized,
    tokens, // ["BLACK","WHITE"] with order
  };
}

function buildSkuCode({ brand, articleName, colorsTokens, size }) {
  // skuCode: BRAND-ARTICLE-COLOR1_COLOR2-SIZE
  // Keep it URL safe
  const colorPart = colorsTokens.map((t) => t.replace(/\s+/g, "")).join("_");
  const safeBrand = String(brand).trim().toUpperCase().replace(/\s+/g, "");
  const safeArticle = String(articleName).trim().toUpperCase().replace(/\s+/g, "");
  const safeSize = String(size).trim();

  return `${safeBrand}-${safeArticle}-${colorPart}-${safeSize}`;
}

/* ---------------- CREATE (single) ---------------- */
/**
 * POST /skus
 * body: { articleId, colors, size }
 */
exports.create = async (req, res) => {
  try {
    const payload = pick(req.body, ["articleId", "colors", "size"]);

    if (!payload.articleId || !payload.colors || payload.size === undefined) {
      return res.status(400).json({
        ok: false,
        message: "articleId, colors and size are required",
      });
    }

    if (!isValidObjectId(payload.articleId)) {
      return res.status(400).json({ ok: false, message: "Invalid articleId" });
    }

    const article = await Article.findById(payload.articleId).lean();
    if (!article || article.isActive === false) {
      return res.status(404).json({ ok: false, message: "Article not found/inactive" });
    }

    const colorObj = parseColors(payload.colors);
    if (!colorObj) {
      return res.status(400).json({ ok: false, message: "Invalid colors" });
    }

    const sizeNum = Number(payload.size);
    if (Number.isNaN(sizeNum) || sizeNum <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid size" });
    }

    const skuCode = buildSkuCode({
      brand: article.brand,
      articleName: article.articleName,
      colorsTokens: colorObj.tokens,
      size: sizeNum,
    });

    // prevent duplicates (hard unique)
    const exists = await Sku.findOne({ skuCode }).lean();
    if (exists) {
      return res.status(409).json({
        ok: false,
        message: "SKU already exists",
        data: exists,
      });
    }

    const doc = await Sku.create({
      articleId: article._id,
      brand: article.brand,
      articleName: article.articleName,
      colors: [
        {
          raw: colorObj.raw,
          normalized: colorObj.normalized,
          tokens: colorObj.tokens,
        },
      ],
      size: sizeNum,
      skuCode,
      isActive: true,
    });

    return res.status(201).json({ ok: true, data: doc });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ ok: false, message: "Duplicate SKU (skuCode)" });
    }
    return res.status(500).json({ ok: false, message: "Failed to create SKU", error: err.message });
  }
};

/* ---------------- BULK MATRIX CREATE ---------------- */
/**
 * POST /skus/bulk-matrix
 * body: {
 *   articleId,
 *   colorsList: ["BLK/WHT", "RED", "WHITE/BLACK"],
 *   sizes: [6,7,8,9]
 * }
 *
 * It will create all combinations colorsList x sizes
 * Returns created + skipped (already exists)
 */
exports.bulkMatrix = async (req, res) => {
  try {
    const { articleId, colorsList, sizes } = req.body || {};

    if (!articleId || !Array.isArray(colorsList) || !Array.isArray(sizes)) {
      return res.status(400).json({
        ok: false,
        message: "articleId, colorsList (array), sizes (array) are required",
      });
    }

    if (!isValidObjectId(articleId)) {
      return res.status(400).json({ ok: false, message: "Invalid articleId" });
    }

    const article = await Article.findById(articleId).lean();
    if (!article || article.isActive === false) {
      return res.status(404).json({ ok: false, message: "Article not found/inactive" });
    }

    // Prepare combos
    const normalizedColors = colorsList
      .map(parseColors)
      .filter(Boolean);

    const sizeNums = sizes
      .map((s) => Number(s))
      .filter((n) => !Number.isNaN(n) && n > 0);

    if (!normalizedColors.length || !sizeNums.length) {
      return res.status(400).json({ ok: false, message: "No valid colors or sizes" });
    }

    const results = { created: [], skipped: [], errors: [] };

    // We can reduce DB calls by pre-checking skuCodes
    const skuCodesToCheck = [];
    const payloads = [];

    for (const c of normalizedColors) {
      for (const sz of sizeNums) {
        const skuCode = buildSkuCode({
          brand: article.brand,
          articleName: article.articleName,
          colorsTokens: c.tokens,
          size: sz,
        });
        skuCodesToCheck.push(skuCode);
        payloads.push({ c, sz, skuCode });
      }
    }

    const existing = await Sku.find({ skuCode: { $in: skuCodesToCheck } }, { skuCode: 1 }).lean();
    const existingSet = new Set(existing.map((e) => e.skuCode));

    const toInsert = payloads
      .filter((p) => !existingSet.has(p.skuCode))
      .map((p) => ({
        articleId: article._id,
        brand: article.brand,
        articleName: article.articleName,
        colors: [{ raw: p.c.raw, normalized: p.c.normalized, tokens: p.c.tokens }],
        size: p.sz,
        skuCode: p.skuCode,
        isActive: true,
      }));

    // Track skipped
    for (const p of payloads) {
      if (existingSet.has(p.skuCode)) results.skipped.push(p.skuCode);
    }

    if (toInsert.length) {
      const inserted = await Sku.insertMany(toInsert, { ordered: false });
      results.created = inserted.map((d) => d.skuCode);
    }

    return res.status(201).json({ ok: true, data: results });
  } catch (err) {
    // insertMany ordered:false can throw but still insert some; we handle message
    if (err?.writeErrors?.length) {
      return res.status(207).json({
        ok: true,
        message: "Partial success (some duplicates/errors)",
        error: err.message,
        writeErrors: err.writeErrors.map((e) => e.errmsg || e.message),
      });
    }
    return res.status(500).json({ ok: false, message: "Failed bulk create", error: err.message });
  }
};

/* ---------------- LIST ---------------- */
/**
 * GET /skus
 * query:
 *  - brand
 *  - articleName
 *  - size
 *  - color (search token e.g. BLACK)
 *  - q (search skuCode / articleName)
 *  - isActive
 *  - page, limit
 */
exports.list = async (req, res) => {
  try {
    const {
      articleId, // ✅ NEW
      brand,
      articleName,
      size,
      color,
      q,
      isActive = true,
      page = 1,
      limit = 25,
      sort = "brand articleName size",
    } = req.query;

    const filter = {};

    // ✅ active
    if (typeof isActive !== "undefined") {
      filter.isActive = String(isActive) === "true";
    }

    // ✅ filter by articleId (VERY IMPORTANT)
    if (articleId) {
      if (!mongoose.Types.ObjectId.isValid(articleId)) {
        return res.status(400).json({ ok: false, message: "Invalid articleId" });
      }
      filter.articleId = articleId;
    }

    // existing filters
    if (brand) filter.brand = String(brand).trim().toUpperCase();
    if (articleName) filter.articleName = String(articleName).trim().toUpperCase();

    if (size !== undefined) {
      const s = Number(size);
      if (!Number.isNaN(s)) filter.size = s;
    }

    // ✅ color filter using token system (already correct)
    if (color) {
      const token = normalizeToken(color);
      filter["colors.tokens"] = token;
    }

    // search
    if (q && String(q).trim()) {
      const rx = new RegExp(escapeRegex(String(q).trim()), "i");
      filter.$or = [{ skuCode: rx }, { articleName: rx }, { brand: rx }];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Sku.find(filter)
        .populate("articleId", "categoryGroup category")
        .sort(sort)
        .skip(skip)              // ✅ apply pagination
        .limit(limitNum)         // ✅ apply pagination
        .lean(),
      Sku.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      data: items,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to list SKUs", error: err.message });
  }
};
/* ---------------- GET BY ID ---------------- */
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid sku id" });
    }

    const sku = await Sku.findById(id).lean();
    if (!sku) return res.status(404).json({ ok: false, message: "SKU not found" });

    return res.json({ ok: true, data: sku });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to get SKU", error: err.message });
  }
};

/* ---------------- UPDATE ---------------- */
/**
 * PATCH /skus/:id
 * Allowed: colors, size, isActive
 * NOTE: Changing colors/size will change skuCode (identity).
 * Better approach: disallow editing identity; but keeping it possible for admin corrections.
 */
exports.update = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid sku id" });
    }

    const sku = await Sku.findById(id);
    if (!sku) return res.status(404).json({ ok: false, message: "SKU not found" });

    const updates = pick(req.body, ["colors", "size", "isActive"]);

    // If identity changes, rebuild skuCode
    let newColorsObj = null;
    if (updates.colors !== undefined) {
      newColorsObj = parseColors(updates.colors);
      if (!newColorsObj) return res.status(400).json({ ok: false, message: "Invalid colors" });
    }

    let newSizeNum = null;
    if (updates.size !== undefined) {
      newSizeNum = Number(updates.size);
      if (Number.isNaN(newSizeNum) || newSizeNum <= 0) {
        return res.status(400).json({ ok: false, message: "Invalid size" });
      }
    }

    // Apply updates
    if (updates.isActive !== undefined) sku.isActive = Boolean(updates.isActive);

    const identityChanging = newColorsObj || newSizeNum !== null;

    if (identityChanging) {
      const article = await Article.findById(sku.articleId).lean();
      if (!article) return res.status(400).json({ ok: false, message: "SKU article not found" });

      const finalColors = newColorsObj
        ? newColorsObj
        : {
            raw: sku.colors?.[0]?.raw,
            normalized: sku.colors?.[0]?.normalized,
            tokens: sku.colors?.[0]?.tokens || [],
          };

      const finalSize = newSizeNum !== null ? newSizeNum : sku.size;

      const newSkuCode = buildSkuCode({
        brand: article.brand,
        articleName: article.articleName,
        colorsTokens: finalColors.tokens,
        size: finalSize,
      });

      // Prevent duplicate skuCode
      const dup = await Sku.findOne({ skuCode: newSkuCode, _id: { $ne: id } }).lean();
      if (dup) {
        return res.status(409).json({ ok: false, message: "SKU identity already exists", data: dup });
      }

      sku.size = finalSize;
      sku.colors = [{ raw: finalColors.raw, normalized: finalColors.normalized, tokens: finalColors.tokens }];
      sku.skuCode = newSkuCode;
    }

    await sku.save();

    return res.json({ ok: true, data: sku });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ ok: false, message: "Duplicate SKU (skuCode)" });
    }
    return res.status(500).json({ ok: false, message: "Failed to update SKU", error: err.message });
  }
};

/* ---------------- DELETE (SOFT) ---------------- */
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid sku id" });
    }

    const sku = await Sku.findById(id);
    if (!sku) return res.status(404).json({ ok: false, message: "SKU not found" });

    sku.isActive = false;
    await sku.save();

    return res.json({ ok: true, message: "SKU deactivated", data: sku });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to delete SKU", error: err.message });
  }
};


exports.search = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.json({ items: [] });

    // tune fields as per your schema
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    const items = await Sku.find({
      $or: [
        { sku: rx },
        { brand: rx },
        { articleName: rx },
        { color: rx },
        { size: rx },
      ],
    })
      .select("_id sku brand articleName color size mrp categoryGroup category")
      .limit(20)
      .lean();

    res.json({ items });
  } catch (e) {
    next(e);
  }
};

exports.summary = async (req, res, next) => {
  try {
    const { skuId } = req.params;
    const storeId = req.query.storeId;

    if (!mongoose.Types.ObjectId.isValid(skuId)) {
      return res.status(400).json({ message: "Invalid skuId" });
    }
    if (storeId && !mongoose.Types.ObjectId.isValid(storeId)) {
      return res.status(400).json({ message: "Invalid storeId" });
    }

    // If ledger model missing, fail safe
    if (!Stock) {
      return res.json({ skuId, storeId: storeId || null, availableQty: 0, totalIn: 0, totalOut: 0 });
    }

    const match = { skuId: new mongoose.Types.ObjectId(skuId) };
    if (storeId) match.storeId = new mongoose.Types.ObjectId(storeId);

    /**
     * SUPPORT MULTIPLE LEDGER SHAPES:
     * A) delta field: qtyDelta (+/-)
     * B) in/out fields: qtyIn, qtyOut
     * C) movementType + qty (IN/OUT)
     *
     * Keep ONE consistent shape in your ledger ideally.
     */

    const pipeline = [
      { $match: match },
      {
        $project: {
          // --- Pattern A: qtyDelta ---
          qtyDelta: { $ifNull: ["$qtyDelta", null] },

          // --- Pattern B: qtyIn/qtyOut ---
          qtyIn: { $ifNull: ["$qtyIn", null] },
          qtyOut: { $ifNull: ["$qtyOut", null] },

          // --- Pattern C: movementType + qty ---
          movementType: { $ifNull: ["$movementType", "$type"] }, // e.g. "IN" / "OUT"
          qty: { $ifNull: ["$qty", "$quantity"] },
        },
      },
      {
        $addFields: {
          // Normalize into deltaIn / deltaOut
          _in: {
            $cond: [
              { $ne: ["$qtyIn", null] },
              "$qtyIn",
              {
                $cond: [
                  { $and: [{ $ne: ["$qtyDelta", null] }, { $gt: ["$qtyDelta", 0] }] },
                  "$qtyDelta",
                  {
                    $cond: [
                      { $and: [{ $in: ["$movementType", ["IN", "ADD", "PURCHASE", "TRANSFER_IN"]] }, { $ne: ["$qty", null] }] },
                      "$qty",
                      0,
                    ],
                  },
                ],
              },
            ],
          },
          _out: {
            $cond: [
              { $ne: ["$qtyOut", null] },
              "$qtyOut",
              {
                $cond: [
                  { $and: [{ $ne: ["$qtyDelta", null] }, { $lt: ["$qtyDelta", 0] }] },
                  { $multiply: ["$qtyDelta", -1] },
                  {
                    $cond: [
                      { $and: [{ $in: ["$movementType", ["OUT", "SUB", "SALE", "TRANSFER_OUT", "DAMAGE"]] }, { $ne: ["$qty", null] }] },
                      "$qty",
                      0,
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalIn: { $sum: { $toDouble: "$_in" } },
          totalOut: { $sum: { $toDouble: "$_out" } },
        },
      },
      {
        $project: {
          _id: 0,
          totalIn: { $ifNull: ["$totalIn", 0] },
          totalOut: { $ifNull: ["$totalOut", 0] },
          availableQty: { $subtract: [{ $ifNull: ["$totalIn", 0] }, { $ifNull: ["$totalOut", 0] }] },
        },
      },
    ];

    const agg = await Stock.aggregate(pipeline);
    const out = agg?.[0] || { totalIn: 0, totalOut: 0, availableQty: 0 };

    return res.json({
      ok: true,
      skuId,
      storeId: storeId || null,
      ...out,
    });
  } catch (e) {
    next(e);
  }
};
