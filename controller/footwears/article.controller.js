const mongoose = require("mongoose");
const Article = require("../../models/footwears/Article");
const { CATEGORIES } = require("../../config/productCategories");

/* -------------------- helpers -------------------- */
const normStr = (v) => String(v || "").trim().toUpperCase();

const isValidCategory = (group, category) => {
  const g = normStr(group);
  const c = normStr(category);
  return Array.isArray(CATEGORIES[g]) && CATEGORIES[g].includes(c);
};

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const pick = (obj, keys) =>
  keys.reduce((acc, k) => {
    if (obj && obj[k] !== undefined) acc[k] = obj[k];
    return acc;
  }, {});

/* -------------------- CATEGORIES -------------------- */
exports.getCategories = async (req, res) => {
  try {
    return res.json({ ok: true, data: CATEGORIES });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to load categories",
      error: err.message,
    });
  }
};
/* -------------------- CREATE -------------------- */
/**
 * POST /articles
 * body: { brand, articleName, category, meta? }
 */
exports.create = async (req, res) => {
  try {
    const payload = pick(req.body, [
      "brand",
      "articleName",
      "categoryGroup",   // ✅ NEW
      "category",        // sub-category
      "meta",
    ]);

    if (!payload.brand || !payload.articleName || !payload.categoryGroup || !payload.category) {
      return res.status(400).json({
        ok: false,
        message: "brand, articleName, categoryGroup and category are required",
      });
    }

    // Normalize
    payload.brand = normStr(payload.brand);
    payload.articleName = normStr(payload.articleName);
    payload.categoryGroup = normStr(payload.categoryGroup);
    payload.category = normStr(payload.category);

    // ✅ Validate category belongs to group (server config)
    if (!isValidCategory(payload.categoryGroup, payload.category)) {
      return res.status(400).json({
        ok: false,
        message: `Invalid category '${payload.category}' for group '${payload.categoryGroup}'`,
      });
    }

    // Uniqueness: brand + articleName
    const exists = await Article.findOne({
      brand: payload.brand,
      articleName: payload.articleName,
    });

    if (exists) {
      return res.status(409).json({
        ok: false,
        message: "Article already exists for this brand",
      });
    }

    const article = await Article.create(payload);
    return res.status(201).json({ ok: true, data: article });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to create article",
      error: err.message,
    });
  }
};

/* -------------------- LIST -------------------- */
/**
 * GET /articles
 * query:
 *  - brand
 *  - category
 *  - isActive
 *  - q (search articleName)
 *  - page, limit
 */
exports.list = async (req, res) => {
  try {
    const {
      brand,
      categoryGroup,   // ✅ NEW
      category,
      isActive = true,
      q,
      page = 1,
      limit = 25,
    } = req.query;

    const filter = {};

    if (brand) filter.brand = normStr(brand);
    if (categoryGroup) filter.categoryGroup = normStr(categoryGroup); // ✅ NEW
    if (category) filter.category = normStr(category);

    if (typeof isActive !== "undefined") {
      filter.isActive = String(isActive) === "true";
    }

    if (q) {
      filter.articleName = { $regex: q.trim(), $options: "i" };
    }

    const pageNum = Math.max(parseInt(page), 1);
    const limitNum = Math.min(parseInt(limit), 100);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Article.find(filter)
        .sort({ brand: 1, articleName: 1 })
        .lean(),
      Article.countDocuments(filter),
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
    return res.status(500).json({
      ok: false,
      message: "Failed to list articles",
      error: err.message,
    });
  }
};

/* -------------------- GET BY ID -------------------- */
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid article id" });
    }

    const article = await Article.findById(id).lean();

    if (!article) {
      return res.status(404).json({ ok: false, message: "Article not found" });
    }

    return res.json({ ok: true, data: article });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch article",
      error: err.message,
    });
  }
};

/* -------------------- UPDATE -------------------- */
exports.update = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid article id" });
    }

    const updates = pick(req.body, [
      "brand",
      "articleName",
      "categoryGroup", // ✅ NEW
      "category",
      "meta",
      "isActive",
    ]);

    if (updates.brand) updates.brand = normStr(updates.brand);
    if (updates.articleName) updates.articleName = normStr(updates.articleName);
    if (updates.categoryGroup) updates.categoryGroup = normStr(updates.categoryGroup);
    if (updates.category) updates.category = normStr(updates.category);

    // ✅ Load current article to safely build uniqueness + validate group/category combos
    const current = await Article.findById(id).lean();
    if (!current) {
      return res.status(404).json({ ok: false, message: "Article not found" });
    }

    // ✅ Decide final values after update
    const finalBrand = updates.brand ?? current.brand;
    const finalArticleName = updates.articleName ?? current.articleName;
    const finalGroup = updates.categoryGroup ?? current.categoryGroup;
    const finalCategory = updates.category ?? current.category;

    // ✅ Validate category belongs to group (server config)
    if (!isValidCategory(finalGroup, finalCategory)) {
      return res.status(400).json({
        ok: false,
        message: `Invalid category '${finalCategory}' for group '${finalGroup}'`,
      });
    }

    // ✅ prevent duplicate brand + articleName (safe)
    if (finalBrand !== current.brand || finalArticleName !== current.articleName) {
      const existing = await Article.findOne({
        brand: finalBrand,
        articleName: finalArticleName,
        _id: { $ne: id },
      });

      if (existing) {
        return res.status(409).json({
          ok: false,
          message: "Another article with same brand & name exists",
        });
      }
    }

    const article = await Article.findByIdAndUpdate(
      id,
      {
        ...updates,
        // optional: force store final normalized values
        brand: finalBrand,
        articleName: finalArticleName,
        categoryGroup: finalGroup,
        category: finalCategory,
      },
      { new: true, runValidators: true }
    );

    return res.json({ ok: true, data: article });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to update article",
      error: err.message,
    });
  }
};


/* -------------------- DELETE (SOFT) -------------------- */
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid article id" });
    }

    const article = await Article.findById(id);

    if (!article) {
      return res.status(404).json({ ok: false, message: "Article not found" });
    }

    article.isActive = false;
    await article.save();

    return res.json({
      ok: true,
      message: "Article deactivated",
      data: article,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to delete article",
      error: err.message,
    });
  }
};
