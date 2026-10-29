//--------------------------------------------------------------------stockledger controller-------------------------------------------------


const mongoose = require("mongoose");

const StockLedger = require("../../models/footwears/StockLedger");
const Store = require("../../models/footwears/store");
const Article = require("../../models/footwears/Article");
const StockInBillLine = require("../../models/footwears/StockInBillLine");
const StockInBill = require("../../models/footwears/StockInBill");
/* ---------------- helpers ---------------- */

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

async function getLatestConfirmedPurchase(articleId, color) {
  const rows = await StockInBillLine.aggregate([
    {
      $match: {
        articleId: new mongoose.Types.ObjectId(String(articleId)),
        color: up(color),
      },
    },
    {
      $lookup: {
        from: "stockinbills",
        localField: "billId",
        foreignField: "_id",
        as: "bill",
      },
    },
    {
      $unwind: "$bill",
    },
    {
      $match: {
        "bill.status": "CONFIRMED",
      },
    },
    {
      $sort: {
        "bill.billDate": -1,
        createdAt: -1,
      },
    },
    {
      $limit: 1,
    },
    {
      $project: {
        mrp: 1,
        cost: 1,
        discountPercent: 1,
      },
    },
  ]);

  return rows[0] || null;
}

const up = (s) => String(s || "").trim().toUpperCase();

const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const escapeRegex = (s) =>
  String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const pick = (obj, keys) =>
  keys.reduce((acc, k) => {
    if (obj && obj[k] !== undefined) acc[k] = obj[k];
    return acc;
  }, {});

function buildLedgerFilter(query) {
  const {
    storeId,
    articleId,
    brand,
    articleName,
    color,
    txnType,
    from,
    to,
    q,
  } = query;

  const filter = {};

  if (storeId) {
    if (!isValidObjectId(storeId)) {
      throw new Error("Invalid storeId");
    }
    filter.storeId = new mongoose.Types.ObjectId(storeId);
  }

  if (articleId) {
    if (!isValidObjectId(articleId)) {
      throw new Error("Invalid articleId");
    }
    filter.articleId = new mongoose.Types.ObjectId(articleId);
  }

  if (brand) {
    filter.brand = up(brand);
  }

  if (articleName) {
    filter.articleName = new RegExp(escapeRegex(articleName), "i");
  }

  if (color) {
    filter.color = new RegExp(escapeRegex(color), "i");
  }

  if (txnType) {
    filter.txnType = up(txnType);
  }

  if (from || to) {
    filter.txnAt = {};
    if (from) filter.txnAt.$gte = new Date(from);
    if (to) filter.txnAt.$lte = new Date(to);
  }

  if (q && String(q).trim()) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { brand: rx },
      { articleName: rx },
      { color: rx },
      { txnType: rx },
      { "ref.documentNo": rx },
      { "ref.note": rx },
    ];
  }

  return filter;
}

async function attachStores(items) {
  const storeIds = [
    ...new Set(
      items
        .map((x) => x.storeId)
        .filter(Boolean)
        .map((id) => String(id))
    ),
  ];

  let storeMap = new Map();

  if (storeIds.length) {
    const stores = await Store.find({ _id: { $in: storeIds } })
      .select("code name storeName")
      .lean();

    storeMap = new Map(stores.map((s) => [String(s._id), s]));
  }

  return items.map((x) => {
    const sid = x.storeId ? String(x.storeId) : "";
    return {
      ...x,
      store: sid ? storeMap.get(sid) || null : null,
    };
  });
}

/* ---------------- LIST ---------------- */

exports.list = async (req, res) => {
  try {
    let filter;

    try {
      filter = buildLedgerFilter(req.query);
    } catch (e) {
      return res.status(400).json({ ok: false, message: e.message });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(limitRaw || 50, 1), 200);
    const skip = (page - 1) * limit;

    const wantAll = String(req.query.all || "") === "1" || Number(req.query.limit) === 0;
    const MAX_ALL = 20000;

    let items = [];
    let total = 0;

    if (wantAll) {
      items = await StockLedger.find(filter)
        .sort({ txnAt: -1, createdAt: -1 })
        .limit(MAX_ALL)
        .lean();

      total = items.length;
    } else {
      const [rows, count] = await Promise.all([
        StockLedger.find(filter)
          .sort({ txnAt: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        StockLedger.countDocuments(filter),
      ]);

      items = rows;
      total = count;
    }

    const out = await attachStores(items);

    return res.json({
      ok: true,
      data: out,
      meta: wantAll
        ? {
            all: true,
            total,
            limit: MAX_ALL,
          }
        : {
            all: false,
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to list stock ledger",
      error: err.message,
    });
  }
};

/* ---------------- SUMMARY ---------------- */
/**
 * GET /stock-ledger/summary
 */

exports.summary = async (req, res) => {
  try {
    let filter;

    try {
      filter = buildLedgerFilter(req.query);
    } catch (e) {
      return res.status(400).json({ ok: false, message: e.message });
    }

    const { categoryGroup, category } = req.query;

    const pipeline = [
      { $match: filter },

      {
        $lookup: {
          from: "articles",
          localField: "articleId",
          foreignField: "_id",
          as: "article",
        },
      },

      {
        $unwind: {
          path: "$article",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    const articleMatch = {};

    if (categoryGroup) {
      articleMatch["article.categoryGroup"] = up(categoryGroup);
    }

    if (category) {
      articleMatch["article.category"] = up(category);
    }

    if (Object.keys(articleMatch).length) {
      pipeline.push({ $match: articleMatch });
    }

    pipeline.push({
      $group: {
        _id: null,
        totalMoves: { $sum: 1 },
        totalIn: {
          $sum: {
            $cond: [{ $gt: ["$qtyDelta", 0] }, "$qtyDelta", 0],
          },
        },
        totalOut: {
          $sum: {
            $cond: [{ $lt: ["$qtyDelta", 0] }, { $abs: "$qtyDelta" }, 0],
          },
        },
        netQty: { $sum: "$qtyDelta" },
      },
    });

    const rows = await StockLedger.aggregate(pipeline);

    const s = rows[0] || {
      totalMoves: 0,
      totalIn: 0,
      totalOut: 0,
      netQty: 0,
    };

    return res.json({
      ok: true,
      data: s,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to calculate ledger summary",
      error: err.message,
    });
  }
};

/* ---------------- BALANCE GROUPED ---------------- */
/**
 * GET /stock-ledger/balance
 * current balance = SUM(qtyDelta)
 */
exports.balance = async (req, res) => {
  try {
    const {
      storeId,
      articleId,
      brand,
      articleName,
      color,
      txnType,
      categoryGroup,
      category,
      q,
    } = req.query;

    const match = {};

    if (storeId && mongoose.Types.ObjectId.isValid(storeId)) {
      match.storeId = new mongoose.Types.ObjectId(String(storeId));
    }

    if (articleId && mongoose.Types.ObjectId.isValid(articleId)) {
      match.articleId = new mongoose.Types.ObjectId(String(articleId));
    }

    if (brand) {
      match.brand = up(brand);
    }

    if (articleName) {
      match.articleName = new RegExp(escapeRegex(articleName), "i");
    }

    if (color) {
      match.color = new RegExp(escapeRegex(color), "i");
    }

    if (txnType) {
      match.txnType = up(txnType);
    }

    if (q && String(q).trim()) {
      const rx = new RegExp(escapeRegex(q), "i");
      match.$or = [
        { brand: rx },
        { articleName: rx },
        { color: rx },
        { txnType: rx },
        { "ref.documentNo": rx },
        { "ref.note": rx },
      ];
    }

    const pipeline = [
      { $match: match },

      {
        $group: {
          _id: {
  storeId: "$storeId",
  articleId: "$articleId",
  brand: "$brand",
  articleName: "$articleName",
  color: "$color",

  // IMPORTANT
  mrp: "$mrp",
  cost: "$cost",
  purchaseDiscountPercent: "$purchaseDiscountPercent",
},
          balanceQty: { $sum: "$qtyDelta" },
          moves: { $sum: 1 },
          lastTxnAt: { $max: "$txnAt" },
        },
      },

      {
        $project: {
  _id: 0,

  storeId: "$_id.storeId",
  articleId: "$_id.articleId",

  brand: "$_id.brand",
  articleName: "$_id.articleName",
  color: "$_id.color",

  mrp: "$_id.mrp",
  cost: "$_id.cost",
  purchaseDiscountPercent: "$_id.purchaseDiscountPercent",

  balanceQty: 1,
  moves: 1,
  lastTxnAt: 1,
},
      },

      {
        $lookup: {
          from: "articles",
          localField: "articleId",
          foreignField: "_id",
          as: "article",
        },
      },

      {
        $unwind: {
          path: "$article",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $addFields: {
          categoryGroup: "$article.categoryGroup",
          category: "$article.category",
        },
      },
    ];

    const articleMatch = {};

    if (categoryGroup) {
      articleMatch.categoryGroup = up(categoryGroup);
    }

    if (category) {
      articleMatch.category = up(category);
    }

    if (Object.keys(articleMatch).length) {
      pipeline.push({ $match: articleMatch });
    }

    pipeline.push({ $sort: { brand: 1, articleName: 1, color: 1 } });

    const rows = await StockLedger.aggregate(pipeline);

    const enrichedRows = rows.map((row) => {
  const mrp = Number(row.mrp || 0);
  const cost = Number(row.cost || 0);
  const qty = Number(row.balanceQty || 0);

  return {
    ...row,

    mrp,
    lastCost: cost,
    purchaseDiscount: Number(row.purchaseDiscountPercent || 0),

    stockValue: Number((qty * cost).toFixed(2)),
  };
});

    return res.json({
      ok: true,
      data: enrichedRows,
      meta: { total: enrichedRows.length },
    });
  } catch (err) {
    console.error("balance error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch balance",
      error: err.message,
    });
  }
};
/* ---------------- GET BY ID ---------------- */

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid ledger id" });
    }

    const entry = await StockLedger.findById(id)
      .populate("storeId", "code name storeName")
      .populate("articleId", "brand articleName categoryGroup category")
      .lean();

    if (!entry) {
      return res.status(404).json({
        ok: false,
        message: "Ledger entry not found",
      });
    }

    return res.json({ ok: true, data: entry });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch ledger entry",
      error: err.message,
    });
  }
};

/* ---------------- CREATE ---------------- */

exports.create = async (req, res) => {
  try {
   const payload = pick(req.body, [
  "storeId",
  "articleId",
  "articleName",
  "brand",
  "color",

  "mrp",
  "cost",
  "purchaseDiscountPercent",

  "txnType",
  "qtyDelta",
  "balanceAfter",
  "txnAt",
  "ref",
]);

    if (
      !payload.storeId ||
      !payload.articleId ||
      !payload.articleName ||
      !payload.brand ||
      !payload.color ||
      !payload.txnType ||
      payload.qtyDelta === undefined
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "storeId, articleId, articleName, brand, color, txnType and qtyDelta are required",
      });
    }

    if (!isValidObjectId(payload.storeId)) {
      return res.status(400).json({ ok: false, message: "Invalid storeId" });
    }

    if (!isValidObjectId(payload.articleId)) {
      return res.status(400).json({ ok: false, message: "Invalid articleId" });
    }

    const [store, article] = await Promise.all([
      Store.findById(payload.storeId).lean(),
      Article.findById(payload.articleId).lean(),
    ]);

    if (!store || store.isActive === false) {
      return res.status(404).json({
        ok: false,
        message: "Store not found/inactive",
      });
    }

    if (!article || article.isActive === false) {
      return res.status(404).json({
        ok: false,
        message: "Article not found/inactive",
      });
    }

    const qty = num(payload.qtyDelta, NaN);

    if (!Number.isFinite(qty) || qty === 0) {
      return res.status(400).json({
        ok: false,
        message: "qtyDelta must be a non-zero number",
      });
    }

    payload.articleName = up(payload.articleName);
    payload.brand = up(payload.brand);
    payload.color = up(payload.color);
    payload.txnType = up(payload.txnType);
    payload.qtyDelta = qty;
    payload.mrp = num(payload.mrp, 0);
payload.cost = num(payload.cost, 0);
payload.purchaseDiscountPercent = num(
  payload.purchaseDiscountPercent,
  0
);
    payload.balanceAfter = num(payload.balanceAfter, 0);
    payload.txnAt = payload.txnAt ? new Date(payload.txnAt) : new Date();

    const entry = await StockLedger.create({
      ...payload,
      createdBy: req.user?._id || null,
    });

    return res.status(201).json({
      ok: true,
      data: entry,
      message: "Ledger entry created",
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to create ledger entry",
      error: err.message,
    });
  }
};

/* ---------------- DELETE ---------------- */

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid ledger id" });
    }

    const entry = await StockLedger.findById(id);

    if (!entry) {
      return res.status(404).json({
        ok: false,
        message: "Ledger entry not found",
      });
    }

    await StockLedger.deleteOne({ _id: id });

    return res.json({
      ok: true,
      message: "Ledger entry deleted. Use reversal entries instead for real accounting.",
      data: entry,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to delete ledger entry",
      error: err.message,
    });
  }
};

exports.backfillLedgerBatchPrices = async (req, res) => {
  try {
    const ledgers = await StockLedger.find({
      txnType: "PURCHASE_IN",
      $or: [
        { mrp: { $exists: false } },
        { mrp: 0 },
        { cost: { $exists: false } },
        { cost: 0 },
      ],
      "ref.stockInBillId": { $exists: true },
    }).lean();

    let updated = 0;
    let skipped = 0;

    for (const l of ledgers) {
      const line = await StockInBillLine.findOne({
        billId: l.ref.stockInBillId,
        articleId: l.articleId,
        color: l.color,
      })
        .sort({ lineNo: 1 })
        .lean();

      if (!line || !line.mrp || !line.cost) {
        skipped++;
        continue;
      }

      await StockLedger.updateOne(
        { _id: l._id },
        {
          $set: {
            mrp: Number(line.mrp || 0),
            cost: Number(line.cost || 0),
            purchaseDiscountPercent: Number(line.discountPercent || 0),
          },
        }
      );

      updated++;
    }

    return res.json({
      ok: true,
      message: "Ledger batch prices backfilled",
      data: { checked: ledgers.length, updated, skipped },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Backfill failed",
      error: err.message,
    });
  }
};