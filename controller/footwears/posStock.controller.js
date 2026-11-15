const Store = require("../../models/footwears/Store");
const StockPosition = require(
  "../../models/footwears/StockPosition"
);

// Register models used by populate.
require("../../models/footwears/Article");
require("../../models/footwears/Sku");
require("../../models/footwears/Rack");
require("../../models/footwears/StoreLocation");

const {
  posStoreFilter,
} = require("../../middleware/footwear-access");

const validId = (value) =>
  typeof value === "string" &&
  /^[a-f\d]{24}$/i.test(value);

const PRIORITY = {
  FRONT: 0,
  BASEMENT: 1,
  RESERVE: 2,
  OTHER: 3,
};

const text = (value) => String(value == null ? "" : value);

exports.listSources = async (req, res, next) => {
  try {
    const { storeId } = req.params;

    if (!validId(storeId)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid store ID",
      });
    }

    const store = await Store.findOne({
      $and: [
        posStoreFilter(req),
        { _id: storeId },
      ],
    })
      .select("_id code name")
      .lean();

    if (!store) {
      return res.status(403).json({
        ok: false,
        message: "This store is unavailable or outside your access",
      });
    }

    const query = req.query.q === undefined ? "" : req.query.q;
    const size = req.query.size;
    const skuId = req.query.skuId;

    if (
      typeof query !== "string" ||
      query.length > 100 ||
      (
        size !== undefined &&
        (typeof size !== "string" || size.length > 30)
      ) ||
      (skuId !== undefined && !validId(skuId))
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid stock search",
      });
    }

    const page = Number(req.query.page || 1);
    const requestedLimit = Number(req.query.limit || 50);

    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(requestedLimit) ||
      requestedLimit < 1
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid pagination",
      });
    }

    const limit = Math.min(requestedLimit, 100);
    const offset = (page - 1) * limit;

    if (!Number.isSafeInteger(offset)) {
      return res.status(400).json({
        ok: false,
        message: "page is too large",
      });
    }

    const filter = {
      businessId: req.pos.business._id,
      storeId: store._id,
      isVerified: true,
      isActive: true,
      qty: { $gt: 0 },
      condition: { $in: ["FRESH", "FACTORY_SECOND"] },
    };

    if (size && size.trim()) {
      filter.size = size.trim().toUpperCase();
    }

    if (skuId) {
      filter.skuId = skuId;
    }

    // This first implementation is bounded for a single outlet.
    // It fails explicitly rather than returning incomplete availability.
    const MAX_POSITIONS = 10000;

    const positions = await StockPosition.find(filter)
      .select(
        "_id skuId size sizeSystem condition qty mrpPaise " +
        "rackId locationId"
      )
      .populate({
        path: "skuId",
        select: "skuCode brand articleName color articleId isActive",
        populate: {
          path: "articleId",
          select: "isActive",
        },
      })
      .populate({
        path: "rackId",
        select: "storeId locationId rackCode rackName isActive",
      })
      .populate({
        path: "locationId",
        select: "storeId name code locationType isActive",
      })
      .limit(MAX_POSITIONS + 1)
      .lean();

    if (positions.length > MAX_POSITIONS) {
      return res.status(422).json({
        ok: false,
        message:
          "This outlet requires database-side stock search pagination before POS search can continue.",
      });
    }

    const normalizedQuery = query.trim().toUpperCase();

    const sources = [];

    for (const position of positions) {
      const sku = position.skuId;
      const rack = position.rackId;
      const location = position.locationId;

      if (
        !sku ||
        !sku.isActive ||
        !sku.articleId ||
        !sku.articleId.isActive ||
        !rack ||
        !rack.isActive ||
        !location ||
        !location.isActive
      ) {
        continue;
      }

      if (
        String(rack.storeId) !== String(store._id) ||
        String(location.storeId) !== String(store._id) ||
        String(rack.locationId) !== String(location._id)
      ) {
        continue;
      }

      const locationType = location.locationType || "OTHER";

      if (
        locationType === "QUARANTINE" ||
        PRIORITY[locationType] === undefined
      ) {
        continue;
      }

      const color =
        typeof sku.color === "string"
          ? sku.color
          : sku.color &&
            (sku.color.raw || sku.color.normalized);

      const searchable = [
        sku.brand,
        sku.articleName,
        sku.skuCode,
        color,
        position.size,
      ]
        .map(text)
        .join(" ")
        .toUpperCase();

      if (
        normalizedQuery &&
        !searchable.includes(normalizedQuery)
      ) {
        continue;
      }

      sources.push({
        stockPositionId: position._id,
        skuId: sku._id,
        articleId: sku.articleId._id,
        skuCode: sku.skuCode,
        brand: sku.brand,
        articleName: sku.articleName,
        color: color || "",
        size: position.size,
        sizeSystem: position.sizeSystem,
        condition: position.condition,
        availableQty: position.qty,
        mrpPaise: position.mrpPaise,

        locationId: location._id,
        locationName: location.name,
        locationType,

        rackId: rack._id,
        rackCode: rack.rackCode,
        rackName: rack.rackName,

        sourcePriority: PRIORITY[locationType],
      });
    }

    sources.sort(function (a, b) {
      return (
        a.sourcePriority - b.sourcePriority ||
        text(a.articleName).localeCompare(text(b.articleName)) ||
        text(a.size).localeCompare(
          text(b.size),
          undefined,
          { numeric: true }
        ) ||
        text(a.rackCode).localeCompare(
          text(b.rackCode),
          undefined,
          { numeric: true }
        ) ||
        String(a.stockPositionId).localeCompare(
          String(b.stockPositionId)
        )
      );
    });

    return res.json({
      ok: true,
      data: sources.slice(offset, offset + limit),
      meta: {
        page,
        limit,
        total: sources.length,
        pages: Math.ceil(sources.length / limit),
      },
      store: {
        _id: store._id,
        code: store.code,
        name: store.name,
      },
    });
  } catch (error) {
    return next(error);
  }
};