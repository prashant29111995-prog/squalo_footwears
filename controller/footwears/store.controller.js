// /controllers/store.controller.js
const mongoose = require("mongoose");
const Store = require("../../models/footwears/store");
mongoose.set("useFindAndModify", false);
/**
 * Helpers
 */
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const pick = (obj, keys) =>
  keys.reduce((acc, k) => {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) acc[k] = obj[k];
    return acc;
  }, {});

const escapeRegex = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * POST /stores
 * Create a new store
 */
exports.create = async (req, res) => {
  try {
    const payload = pick(req.body, ["code", "name", "type", "address", "isActive"]);

    if (!payload.code || !payload.name) {
      return res.status(400).json({ ok: false, message: "code and name are required" });
    }

    // Normalize
    payload.code = String(payload.code).trim().toUpperCase();
    payload.name = String(payload.name).trim();

    if (payload.type) payload.type = String(payload.type).trim().toUpperCase();

    // Ensure unique code
    const exists = await Store.findOne({ code: payload.code }).lean();
    if (exists) {
      return res.status(409).json({ ok: false, message: "Store code already exists" });
    }

    const store = await Store.create(payload);

    return res.status(201).json({ ok: true, data: store });
  } catch (err) {
    // Mongoose duplicate key safeguard
    if (err?.code === 11000) {
      return res.status(409).json({ ok: false, message: "Duplicate store code" });
    }
    return res.status(500).json({ ok: false, message: "Failed to create store", error: err.message });
  }
};

/**
 * GET /stores
 * List stores with filters + pagination
 * Query:
 *  - q (search on code/name)
 *  - type (RETAIL/GODOWN/WAREHOUSE)
 *  - isActive (true/false)
 *  - page, limit
 *  - sort (e.g. "createdAt" or "-createdAt")
 */
exports.list = async (req, res) => {
  try {
    const {
      q,
      type,
      isActive,
      page = 1,
      limit = 25,
      sort = "-createdAt",
    } = req.query;

    // ✅ Default: only active stores
    const filter = {
      isActive: true,
    };

    // Allow explicit override
    if (typeof isActive !== "undefined") {
      filter.isActive = String(isActive).toLowerCase() === "true";
    }

    if (type) {
      filter.type = String(type).trim().toUpperCase();
    }

    if (q && String(q).trim().length) {
      const rx = new RegExp(escapeRegex(String(q).trim()), "i");
      filter.$or = [{ code: rx }, { name: rx }];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Store.find(filter).sort(sort).skip(skip).limit(limitNum).lean(),
      Store.countDocuments(filter),
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
      message: "Failed to list stores",
      error: err.message,
    });
  }
};

/**
 * GET /stores/:id
 * Get a store by id
 */
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid store id" });
    }

    const store = await Store.findById(id).lean();
    if (!store) {
      return res.status(404).json({ ok: false, message: "Store not found" });
    }

    return res.json({ ok: true, data: store });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to get store", error: err.message });
  }
};

/**
 * PATCH /stores/:id
 * Update store fields
 * Allowed:
 *  - code, name, type, address, isActive
 */
exports.update = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid store id" });
    }

    const updates = pick(req.body, ["code", "name", "type", "address", "isActive"]);

    if (updates.code !== undefined) updates.code = String(updates.code).trim().toUpperCase();
    if (updates.name !== undefined) updates.name = String(updates.name).trim();
    if (updates.type !== undefined) updates.type = String(updates.type).trim().toUpperCase();

    // If updating code, ensure unique
    if (updates.code) {
      const dup = await Store.findOne({ code: updates.code, _id: { $ne: id } }).lean();
      if (dup) {
        return res.status(409).json({ ok: false, message: "Store code already exists" });
      }
    }

    const store = await Store.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!store) {
      return res.status(404).json({ ok: false, message: "Store not found" });
    }

    return res.json({ ok: true, data: store });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ ok: false, message: "Duplicate store code" });
    }
    return res.status(500).json({ ok: false, message: "Failed to update store", error: err.message });
  }
};

/**
 * DELETE /stores/:id
 * Soft delete recommended: sets isActive=false
 * If you want hard delete, replace with Store.findByIdAndDelete
 */
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
console.log("hello")
    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid store id" });
    }

    const store = await Store.findById(id);
    if (!store) {
      return res.status(404).json({ ok: false, message: "Store not found" });
    }

    // ✅ Soft delete (BEST PRACTICE)
    store.isActive = false;

    await store.save();

    return res.json({
      ok: true,
      message: "Store deactivated",
      data: store,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to delete store",
      error: err.message,
    });
  }
};

