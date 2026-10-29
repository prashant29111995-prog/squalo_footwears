const mongoose = require("mongoose");
const Article = require("../../models/article");
const Stock = require("../../models/stock");

// helper: escape regex
function escapeRegex(str = "") {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// small helpers
const normUpper = (v) => String(v || "").trim().toUpperCase();
const normText  = (v) => String(v || "").trim();
const toNum     = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/**
 * GET /api/articles/search?q=WIN
 * returns [{_id,name}]
 */
exports.searchArticles = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim().toUpperCase();
    if (!q) return res.json({ items: [] });

    // prefix search for speed
    const regex = new RegExp("^" + escapeRegex(q));
    const items = await Article.find({ name: regex, isActive: true })
      .select("_id name")
      .sort({ name: 1 })
      .limit(15)
      .lean();

    res.json({ items });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/articles/:id/details?location=Warehouse
 * returns:
 *  article: { _id,name,colors,sizes }
 *  stock: [{color,size,location,quantity}]
 */
exports.getArticleDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const location = String(req.query.location || "").trim();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid article id" });
    }

    const article = await Article.findById(id).lean();
    if (!article) return res.status(404).json({ message: "Article not found" });

    const filter = { articleId: article._id };
    if (location) filter.location = location;

    const stock = await Stock.find(filter)
      .select("color size location quantity")
      .sort({ color: 1, size: 1 })
      .lean();

    res.json({ article, stock });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/inventory/save
 * body:
 * {
 *   articleName: "WINFLOW-1",
 *   location: "Warehouse",
 *   colors: ["BLK/WHT"],
 *   sizes: ["6","7","8","9","10"],
 *   rows: [
 *     { color:"BLK/WHT", size:"7", quantity:2 }
 *   ]
 * }
 */

exports.saveInventoryEntry = async (req, res, next) => {
  try {
    const brand = normUpper(req.body.brand); // <-- now using brand
    const articleName = normUpper(req.body.articleName);
    const location = normText(req.body.location);

    const colors = Array.isArray(req.body.colors)
      ? req.body.colors.map(normUpper).filter(Boolean)
      : [];

    const sizes = Array.isArray(req.body.sizes)
      ? req.body.sizes.map(normText).filter(Boolean)
      : [];

    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];

    if (!brand) return res.status(400).json({ message: "brand required" });
    if (!articleName) return res.status(400).json({ message: "articleName required" });
    if (!location) return res.status(400).json({ message: "location required" });

    // 1) Upsert Article + merge colors/sizes atomically
    const article = await Article.findOneAndUpdate(
      { name: articleName },
      {
        $setOnInsert: { name: articleName, isActive: true },
        $set: { brand }, // store brand on article as well (optional but useful)
        ...(colors.length ? { $addToSet: { colors: { $each: colors } } } : {}),
        ...(sizes.length ? { $addToSet: { sizes: { $each: sizes } } } : {}),
      },
      { new: true, upsert: true }
    ).lean();

    // 2) Prepare stock upserts
    const writeOps = [];
    const savedRows = [];

    for (const r of rows) {
      const color = normUpper(r?.color);
      const size = normText(r?.size);
      const quantity = toNum(r?.quantity);

      if (!color || !size) continue;
      if (quantity === null) continue;
      if (quantity < 0) continue;

      writeOps.push({
        updateOne: {
          filter: { brand, articleId: article._id, color, size, location },
          update: {
            $set: {
              quantity,
              articleName: article.name,
            },
            $setOnInsert: {
              brand,
              articleId: article._id,
              color,
              size,
              location,
            },
          },
          upsert: true,
        },
      });

      savedRows.push({ brand, article: article.name, color, size, quantity, location });
    }

    if (!writeOps.length) {
      return res.status(400).json({ message: "No valid rows to save" });
    }

    await Stock.bulkWrite(writeOps, { ordered: false });

    return res.json({
      message: "Saved",
      article: {
        _id: article._id,
        name: article.name,
        brand: article.brand || brand,
        colors: article.colors || [],
        sizes: article.sizes || [],
      },
      rows: savedRows,
    });
  } catch (err) {
    // Make the error visible in browser (instead of silent 500)
    console.error("saveInventoryEntry error:", err);
    return res.status(500).json({
      message: err?.message || "Server error",
      code: err?.code,
    });
  }
};
/// GET /apis/footwears/inventory/table  (DataTables serverSide)
exports.inventoryTable = async (req, res, next) => {
  try {
    const draw = Number(req.query.draw || 1);
    const start = Math.max(0, Number(req.query.start || 0));
    const length = Math.min(200, Math.max(1, Number(req.query.length || 25)));

    const searchValueRaw = String(req.query["search[value]"] || "").trim();
    const searchValue = searchValueRaw.toUpperCase();

    // extra filters (sent from DataTables ajax.data)
    const brand = String(req.query.brand || "").trim().toUpperCase();
    const location = String(req.query.location || "").trim();
    const size = String(req.query.size || "").trim();
    const color = String(req.query.color || "").trim().toUpperCase();

    // Order mapping: 0 Brand, 1 Article, 2 Color, 3 Size, 4 Quantity, 5 Location
    const orderCol = Number(req.query["order[0][column]"] || 1);
    const orderDir = (req.query["order[0][dir]"] || "asc") === "desc" ? -1 : 1;

    const sortMap = {
      0: "brand",
      1: "articleName",
      2: "color",
      3: "size",
      4: "quantity",
      5: "location",
    };

    const sortField = sortMap[orderCol] || "articleName";
    const sort = { [sortField]: orderDir };

    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Build filter
    const filter = {};
    if (brand) filter.brand = brand;
    if (location) filter.location = location;
    if (size) filter.size = size;
    if (color) filter.color = color;

    if (searchValue) {
      const rx = new RegExp(escapeRegex(searchValue));
      filter.$or = [
        { brand: rx },
        { articleName: rx },
        { color: rx },
        { size: rx },
        { location: rx },
      ];
    }

    // Total rows without any filter (fast count)
    const recordsTotal = await Stock.estimatedDocumentCount();

    // One hit for filtered count + page data
    const agg = await Stock.aggregate([
      { $match: filter },
      {
        $facet: {
          data: [
            { $sort: sort },
            { $skip: start },
            { $limit: length },
            {
              $project: {
                _id: 1,
                brand: { $ifNull: ["$brand", ""] },
                article: "$articleName",
                color: 1,
                size: 1,
                quantity: 1,
                location: 1,
              },
            },
          ],
          filteredCount: [{ $count: "count" }],
        },
      },
    ]);

    const recordsFiltered = agg?.[0]?.filteredCount?.[0]?.count || 0;
    const data = agg?.[0]?.data || [];

    return res.json({
      draw,
      recordsTotal,
      recordsFiltered,
      data,
    });
  } catch (err) {
    next(err);
  }
};
