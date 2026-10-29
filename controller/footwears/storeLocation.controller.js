const mongoose = require("mongoose");
const StoreLocation = require("../../models/footwears/StoreLocation");
const Rack = require("../../models/footwears/Rack");
const RackStock = require("../../models/footwears/RackStock");
// helpers
function normUpper(v) {
  return String(v || "").trim().toUpperCase();
}

exports.listByStore = async (req, res, next) => {
  try {
    const storeId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      return res.status(400).json({ message: "Invalid store id" });
    }

    const items = await StoreLocation.find({ storeId, isActive: true })
      .select("_id storeId name code createdAt updatedAt")
      .sort({ name: 1 })
      .lean();

    res.json({ items });
  } catch (err) {
    next(err);
  }
};

exports.createForStore = async (req, res, next) => {
  try {
    const storeId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      return res.status(400).json({ message: "Invalid store id" });
    }

    const name = normUpper(req.body.name);
    const code = normUpper(req.body.code);

    if (!name) return res.status(400).json({ message: "name required" });

    const doc = await StoreLocation.create({
      storeId,
      name,
      code,
      isActive: true,
    });

    res.json({ message: "Created", item: doc });
  } catch (err) {
    // duplicate key friendly message
    if (err && err.code === 11000) {
      return res.status(409).json({ message: "Location already exists for this store" });
    }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const locationId = req.params.locationId;

    if (!mongoose.Types.ObjectId.isValid(locationId)) {
      return res.status(400).json({ message: "Invalid location id" });
    }

    const patch = {};
    if (req.body.name != null) patch.name = normUpper(req.body.name);
    if (req.body.code != null) patch.code = normUpper(req.body.code);

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const doc = await StoreLocation.findByIdAndUpdate(
      locationId,
      { $set: patch },
      { new: true }
    ).lean();

    if (!doc) return res.status(404).json({ message: "Location not found" });

    res.json({ message: "Updated", item: doc });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: "Location name already exists for this store" });
    }
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const locationId = req.params.locationId;

    if (!mongoose.Types.ObjectId.isValid(locationId)) {
      return res.status(400).json({ message: "Invalid location id" });
    }

    // soft delete
    const doc = await StoreLocation.findByIdAndUpdate(
      locationId,
      { $set: { isActive: false } },
      { new: true }
    ).lean();

    if (!doc) return res.status(404).json({ message: "Location not found" });

    res.json({ message: "Deleted" });
  } catch (err) {
    next(err);
  }
};
