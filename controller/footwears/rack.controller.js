const mongoose = require("mongoose");
const Rack = require("../../models/footwears/Rack");
const RackStock = require("../../models/footwears/RackStock");

const up = (v) => String(v || "").trim().toUpperCase();

exports.listByLocation = async (req, res, next) => {
  try {
    const { id: storeId, locationId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(storeId)) return res.status(400).json({ message: "Invalid store id" });
    if (!mongoose.Types.ObjectId.isValid(locationId)) return res.status(400).json({ message: "Invalid location id" });

    const racks = await Rack.find({ storeId, locationId, isActive: true })
      .select("_id storeId locationId rackCode rackName categoryGroup category capacityPairs isActive createdAt")
      .sort({ rackCode: 1 })
      .lean();

    if (!racks.length) return res.json({ items: [] });

    const rackIds = racks.map((r) => r._id);

    // Sum used qty from RackStock for these racks
    const usedAgg = await RackStock.aggregate([
      { $match: { rackId: { $in: rackIds } } },
      { $group: { _id: "$rackId", usedPairs: { $sum: { $ifNull: ["$qty", 0] } } } },
    ]);

    const usedMap = new Map(usedAgg.map((x) => [String(x._id), Number(x.usedPairs || 0)]));

    const items = racks.map((r) => {
      const usedPairs = usedMap.get(String(r._id)) || 0;

      // capacityPairs = 0 means unlimited in your UI
      const cap = Number(r.capacityPairs || 0);

      const freePairs = cap > 0 ? Math.max(0, cap - usedPairs) : null; // null => unlimited

      return {
        ...r,
        usedPairs,
        freePairs,
      };
    });

    return res.json({ items });
  } catch (e) {
    next(e);
  }
};

exports.createForLocation = async (req, res, next) => {
  try {
    const { id: storeId, locationId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(storeId)) return res.status(400).json({ message: "Invalid store id" });
    if (!mongoose.Types.ObjectId.isValid(locationId)) return res.status(400).json({ message: "Invalid location id" });

    const rackCode = up(req.body.rackCode);
    const rackName = up(req.body.rackName);
    const categoryGroup = up(req.body.categoryGroup);
    const category = up(req.body.category);
    const capacityPairs = Math.max(0, Number(req.body.capacityPairs || 0));

    if (!rackCode) return res.status(400).json({ message: "rackCode required" });
    if (!rackName) return res.status(400).json({ message: "rackName required" });
    if (!["MEN", "WOMEN", "KIDS", "UNISEX"].includes(categoryGroup)) return res.status(400).json({ message: "Invalid categoryGroup" });
    if (!category) return res.status(400).json({ message: "category required" });

    const doc = await Rack.create({
      storeId,
      locationId,
      rackCode,
      rackName,
      categoryGroup,
      category,
      capacityPairs,
      isActive: true,
    });

    res.json({ message: "Created", item: doc });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ message: "Rack code already exists in this location" });
    next(e);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { rackId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(rackId)) {
      return res.status(400).json({ message: "Invalid rack id" });
    }

    const rack = await Rack.findById(rackId)
      .select("_id storeId locationId rackCode rackName categoryGroup category capacityPairs isActive createdAt updatedAt")
      .lean();

    if (!rack || rack.isActive === false) {
      return res.status(404).json({ message: "Rack not found" });
    }

    // ✅ compute used qty in this rack (sum of RackStock.qty)
    const usedAgg = await RackStock.aggregate([
      { $match: { rackId: new mongoose.Types.ObjectId(rackId) } },
      { $group: { _id: null, usedPairs: { $sum: "$qty" } } },
    ]);

    const usedPairs = Number(usedAgg?.[0]?.usedPairs || 0);
    const capacityPairs = Number(rack.capacityPairs || 0);
    const freePairs = capacityPairs > 0 ? Math.max(0, capacityPairs - usedPairs) : null;

    return res.json({
      item: {
        ...rack,
        usedPairs,
        freePairs,
      },
    });
  } catch (e) {
    next(e);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { rackId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(rackId)) return res.status(400).json({ message: "Invalid rack id" });

    const patch = {};
    if (req.body.rackCode != null) patch.rackCode = up(req.body.rackCode);
    if (req.body.rackName != null) patch.rackName = up(req.body.rackName);

    if (req.body.categoryGroup != null) {
      const cg = up(req.body.categoryGroup);
      if (!["MEN", "WOMEN", "KIDS", "UNISEX"].includes(cg)) return res.status(400).json({ message: "Invalid categoryGroup" });
      patch.categoryGroup = cg;
    }
    if (req.body.category != null) patch.category = up(req.body.category);

    if (req.body.capacityPairs != null) patch.capacityPairs = Math.max(0, Number(req.body.capacityPairs || 0));
    if (req.body.isActive != null) patch.isActive = !!req.body.isActive;

    if (Object.keys(patch).length === 0) return res.status(400).json({ message: "No fields to update" });

    const doc = await Rack.findByIdAndUpdate(rackId, { $set: patch }, { new: true }).lean();
    if (!doc) return res.status(404).json({ message: "Rack not found" });

    res.json({ message: "Updated", item: doc });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ message: "Rack code already exists in this location" });
    next(e);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const { rackId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(rackId)) return res.status(400).json({ message: "Invalid rack id" });

    const doc = await Rack.findByIdAndUpdate(rackId, { $set: { isActive: false } }, { new: true }).lean();
    if (!doc) return res.status(404).json({ message: "Rack not found" });

    res.json({ message: "Deleted" });
  } catch (e) {
    next(e);
  }
};
