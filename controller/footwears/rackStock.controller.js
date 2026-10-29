const mongoose = require("mongoose");
const RackStock = require("../../models/footwears/RackStock");
const Rack = require("../../models/footwears/Rack");
const StockLedger = require("../../models/footwears/StockLedger");

// 🔒 Calculate how much qty of a SKU is still free to assign across all racks

async function getUnallocatedQty({ skuId, storeId = null, exceptRackStockId = null }) {
  const sid = mongoose.Types.ObjectId.isValid(skuId) ? new mongoose.Types.ObjectId(skuId) : null;
  if (!sid) return 0;

  // 1) TOTAL from StockLedger (match both ObjectId + string)
  const ledgerMatch = {
    $or: [{ skuId: sid }, { skuId: String(skuId) }],
  };
  // apply store filter only if your ledger actually stores it
  if (storeId && mongoose.Types.ObjectId.isValid(storeId)) {
    ledgerMatch.storeId = new mongoose.Types.ObjectId(storeId);
  }

  const totalAgg = await StockLedger.aggregate([
  { $match: ledgerMatch },
  {
    $group: {
      _id: null,
      total: { $sum: { $ifNull: ["$qtyDelta", 0] } }, // ✅ correct field
    },
  },
]);

const total = Number(totalAgg?.[0]?.total || 0);
  // 2) ALREADY allocated in racks
  const rackMatch = { skuId: sid };

  if (exceptRackStockId && mongoose.Types.ObjectId.isValid(exceptRackStockId)) {
    rackMatch._id = { $ne: new mongoose.Types.ObjectId(exceptRackStockId) };
  }

  if (storeId && mongoose.Types.ObjectId.isValid(storeId)) {
    rackMatch.storeId = new mongoose.Types.ObjectId(storeId);
  }

  const usedAgg = await RackStock.aggregate([
    { $match: rackMatch },
    {
      $group: {
        _id: null,
        used: { $sum: { $toDouble: { $ifNull: ["$qty", 0] } } },
      },
    },
  ]);

  const used = Number(usedAgg?.[0]?.used || 0);

  return Math.max(0, total - used);
}


exports.listByRack = async (req, res, next) => {
  try {
    const { rackId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(rackId)) {
      return res.status(400).json({ message: "Invalid rack id" });
    }

    const rows = await RackStock.find({ rackId })
      .populate({
        path: "skuId",
        // include both possible field names
        select: "sku skuCode brand articleName color colors size mrp categoryGroup category",
      })
      .select("_id skuId qty updatedAt")
      .sort({ updatedAt: -1 })
      .lean();

    const pickColor = (sku) => {
      // supports multiple schema styles
      if (!sku) return "";
      if (sku.color) return sku.color;

      // if you store array like colors:[{raw, normalized}] or ["BLACK/WHITE"]
      const c0 = sku.colors?.[0];
      if (typeof c0 === "string") return c0;
      if (c0?.raw) return c0.raw;
      if (c0?.normalized) return c0.normalized;

      return "";
    };

    const items = rows.map((r) => {
      const s = r.skuId || {};
      return {
        _id: r._id,
        skuId: s._id,
        sku: s.skuCode || s.sku || "",
        brand: s.brand || "",
        articleName: s.articleName || "",
        color: pickColor(s),
        size: s.size || "",
        mrp: s.mrp || 0,
        qty: r.qty || 0,
        updatedAt: r.updatedAt,
      };
    });

    return res.json({ items });
  } catch (e) {
    next(e);
  }
};


// ✅ Add sku to rack OR increment if already exists
exports.upsertQty = async (req, res, next) => {
  try {
    const { rackId } = req.params;
    const { skuId } = req.body;
    const qty = Math.max(0, Number(req.body.qty || 0));

    if (!mongoose.Types.ObjectId.isValid(rackId)) return res.status(400).json({ message: "Invalid rack id" });
    if (!mongoose.Types.ObjectId.isValid(skuId)) return res.status(400).json({ message: "Invalid skuId" });

    const rack = await Rack.findById(rackId).lean();
    if (!rack) return res.status(404).json({ message: "Rack not found" });
   
const unallocated = await getUnallocatedQty({ skuId });

if (qty > unallocated) {
  return res.status(400).json({
    message: `Only ${unallocated} pairs available for this size. Already allocated in other racks.`,
  });
}
    // Upsert with store/location filled from rack
    const doc = await RackStock.findOneAndUpdate(
      { rackId, skuId },
      {
        $setOnInsert: { storeId: rack.storeId, locationId: rack.locationId, rackId, skuId },
        $inc: { qty },
        $set: { updatedBy: req.user?._id },
      },
      { new: true, upsert: true }
    ).lean();

    res.json({ message: "Saved", item: doc });
  } catch (e) {
    next(e);
  }
};

// set exact qty
exports.setQty = async (req, res, next) => {
  try {
    const { rackStockId } = req.params;
    const qty = Math.max(0, Number(req.body.qty || 0));

    ;
const existing = await RackStock.findById(rackStockId).lean();
if (!existing) return res.status(404).json({ message: "Row not found" });

const unallocated = await getUnallocatedQty({
  skuId: existing.skuId,
  exceptRackStockId: rackStockId,
});

if (qty > unallocated) {
  return res.status(400).json({
    message: `Only ${unallocated} pairs available for this size.`,
  });
}

const doc = await RackStock.findByIdAndUpdate(
  rackStockId,
  { $set: { qty, updatedBy: req.user?._id } },
  { new: true }
).lean();

res.json({ message: "Updated", item: doc });
  } catch (e) {
    next(e);
  }
};

exports.removeRow = async (req, res, next) => {
  try {
    const { rackStockId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(rackStockId)) return res.status(400).json({ message: "Invalid rackStock id" });

    await RackStock.findByIdAndDelete(rackStockId);
    res.json({ message: "Deleted" });
  } catch (e) {
    next(e);
  }
};

// move qty between racks
exports.moveQty = async (req, res, next) => {
  try {
    const { rackId } = req.params;
    const { skuId, toRackId } = req.body;
    const qty = Math.max(0, Number(req.body.qty || 0));
    if (qty <= 0) return res.status(400).json({ message: "qty must be > 0" });

    if (!mongoose.Types.ObjectId.isValid(rackId)) return res.status(400).json({ message: "Invalid rackId" });
    if (!mongoose.Types.ObjectId.isValid(toRackId)) return res.status(400).json({ message: "Invalid toRackId" });
    if (!mongoose.Types.ObjectId.isValid(skuId)) return res.status(400).json({ message: "Invalid skuId" });

    const toRack = await Rack.findById(toRackId).lean();
    if (!toRack) return res.status(404).json({ message: "Destination rack not found" });

    const from = await RackStock.findOne({ rackId, skuId });
    if (!from) return res.status(404).json({ message: "SKU not found in source rack" });
    if (from.qty < qty) return res.status(400).json({ message: "Not enough qty in source rack" });

    from.qty -= qty;
    from.updatedBy = req.user?._id;
    await from.save();
    // 🔒 Ensure destination does not exceed total stock
const unallocated = await getUnallocatedQty({
  skuId,
  exceptRackStockId: from._id, // moving from source
});

if (qty > unallocated) {
  return res.status(400).json({
    message: `Cannot move ${qty}. Only ${unallocated} pairs free for this size.`,
  });
}
    await RackStock.updateOne(
      { rackId: toRackId, skuId },
      {
        $setOnInsert: { storeId: toRack.storeId, locationId: toRack.locationId, rackId: toRackId, skuId },
        $inc: { qty },
        $set: { updatedBy: req.user?._id },
      },
      { upsert: true }
    );

    res.json({ message: "Moved" });
  } catch (e) {
    next(e);
  }
};

exports.allocatedBySku = async (req, res, next) => {
  try {
    const { skuId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(skuId)) {
      return res.status(400).json({ message: "Invalid skuId" });
    }

    // If you want store-specific allocation, uncomment storeId filter
    // const storeId = req.query.storeId;
    // if (storeId && !mongoose.Types.ObjectId.isValid(storeId)) {
    //   return res.status(400).json({ message: "Invalid storeId" });
    // }

    const match = { skuId: new mongoose.Types.ObjectId(skuId) };
    // if (storeId) match.storeId = new mongoose.Types.ObjectId(storeId);

    const agg = await RackStock.aggregate([
      { $match: match },
      { $group: { _id: null, allocatedQty: { $sum: "$qty" } } },
    ]);

    const allocatedQty = Number(agg?.[0]?.allocatedQty || 0);

    return res.json({ allocatedQty });
  } catch (e) {
    next(e);
  }
};
