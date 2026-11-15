const mongoose = require("mongoose");

const Store = require("../../models/footwears/Store");
const Sku = require("../../models/footwears/Sku");
const Article = require("../../models/footwears/Article");
const Rack = require("../../models/footwears/Rack");
const StoreLocation = require(
  "../../models/footwears/StoreLocation"
);
const StockLedger = require("../../models/footwears/StockLedger");
const StockPosition = require(
  "../../models/footwears/StockPosition"
);
const StockPositionSetup = require(
  "../../models/footwears/StockPositionSetup"
);

const {
  posStoreFilter,
} = require("../../middleware/footwear-access");

const LOCATION_TYPES = [
  "FRONT",
  "BASEMENT",
  "RESERVE",
  "QUARANTINE",
  "OTHER",
];

const validId = (value) =>
  typeof value === "string" &&
  /^[a-f\d]{24}$/i.test(value);

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function paise(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    fail(400, "Invalid MRP or cost");
  }

  const converted = Math.round(value * 100);

  if (
    !Number.isSafeInteger(converted) ||
    Math.abs(value * 100 - converted) > 0.000001
  ) {
    fail(400, "MRP and cost must have at most two decimal places");
  }

  return converted;
}

function batchKey(batch) {
  return [
    String(batch.articleId),
    batch.color,
    batch.mrpPaise,
    batch.costPaise,
  ].join("|");
}

async function authorisedStore(req, session) {
  if (!validId(req.params.storeId)) {
    fail(400, "Invalid store ID");
  }

  const store = await Store.findOne({
    $and: [
      posStoreFilter(req),
      { _id: req.params.storeId },
    ],
  }).session(session || null);

  if (!store) {
    fail(403, "Store unavailable or outside your access");
  }

  return store;
}

function respondError(res, error) {
  if (error.status) {
    return res.status(error.status).json({
      ok: false,
      message: error.message,
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      ok: false,
      message:
        "This batch or position is already allocated. Reload setup before continuing.",
    });
  }

  if (error.name === "ValidationError") {
    return res.status(400).json({
      ok: false,
      message: Object.values(error.errors)
        .map((item) => item.message)
        .join(". "),
    });
  }

  console.error("Stock-position setup failed", error);

  return res.status(500).json({
    ok: false,
    message: "Unable to complete stock-position setup",
  });
}

exports.page = async (req, res, next) => {
  try {
    const store = await authorisedStore(req);

    return res.render("pos/stock-position-setup", {
      pageTitle: "Squalo POS | Stock Setup",
      businessName: req.pos.business.name,
      staffName: req.pos.user.name,
      role: req.pos.membership.role,
      store,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).send(error.message);
    }

    return next(error);
  }
};

exports.getData = async (req, res) => {
  try {
    const store = await authorisedStore(req);

    const [balances, completed, locations, racks] =
      await Promise.all([
        StockLedger.aggregate([
          {
            $match: {
              storeId: store._id,
            },
          },
          {
            $group: {
              _id: {
                articleId: "$articleId",
                color: "$color",
                mrp: "$mrp",
                cost: "$cost",
              },
              qty: { $sum: "$qtyDelta" },
              articleName: { $first: "$articleName" },
              brand: { $first: "$brand" },
            },
          },
          {
            $match: {
              qty: { $gt: 0 },
            },
          },
          {
            $sort: {
              brand: 1,
              articleName: 1,
              "_id.color": 1,
            },
          },
        ]),

        StockPositionSetup.find({
          businessId: req.pos.business._id,
          storeId: store._id,
        }).lean(),

        StoreLocation.find({
          storeId: store._id,
          isActive: true,
        })
          .select("_id name code locationType")
          .sort({ name: 1 })
          .lean(),

        Rack.find({
          storeId: store._id,
          isActive: true,
        })
          .select("_id locationId rackCode rackName")
          .sort({ rackCode: 1 })
          .lean(),
      ]);

    const completedKeys = new Set(
      completed.map((item) => batchKey(item))
    );

    const batches = balances.map(function (row) {
      const batch = {
        articleId: row._id.articleId,
        articleName: row.articleName,
        brand: row.brand,
        color: row._id.color,
        mrp: row._id.mrp,
        cost: row._id.cost,
        qty: row.qty,
      };

      try {
        batch.mrpPaise = paise(batch.mrp);
        batch.costPaise = paise(batch.cost);
        batch.completed = completedKeys.has(batchKey(batch));
      } catch (error) {
        batch.completed = false;
        batch.error = error.message;
      }

      return batch;
    });

    return res.json({
      ok: true,
      data: {
        batches,
        locations,
        racks,
        managed: store.posStockManaged === true,
      },
    });
  } catch (error) {
    return respondError(res, error);
  }
};

exports.classifyLocation = async (req, res) => {
  try {
    const store = await authorisedStore(req);

    const { locationId } = req.params;
    const locationType = req.body && req.body.locationType;

    if (
      !validId(locationId) ||
      !LOCATION_TYPES.includes(locationType)
    ) {
      fail(400, "Invalid location or location type");
    }

    const location = await StoreLocation.findOneAndUpdate(
      {
        _id: locationId,
        storeId: store._id,
        isActive: true,
      },
      {
        $set: { locationType },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!location) {
      fail(404, "Location not found in this store");
    }

    return res.json({
      ok: true,
      message: "Location classification saved",
    });
  } catch (error) {
    return respondError(res, error);
  }
};

exports.verify = async (req, res) => {
  let session;

  try {
    const body = req.body || {};

    if (
      !validId(body.articleId) ||
      typeof body.color !== "string" ||
      !body.color ||
      body.color.length > 100 ||
      !Array.isArray(body.rows) ||
      !body.rows.length ||
      body.rows.length > 500
    ) {
      fail(400, "Select a valid batch and add counted rows");
    }

    const mrpPaise = paise(body.mrp);
    const costPaise = paise(body.cost);
    const color = body.color.trim().toUpperCase();

    const allowedSystems = ["UK", "EU", "US", "LABEL"];
    const allowedConditions = [
      "FRESH",
      "FACTORY_SECOND",
      "DAMAGED",
    ];

    const keys = new Set();

    const rows = body.rows.map(function (row) {
      if (
        !row ||
        !validId(row.rackId) ||
        typeof row.size !== "string" ||
        !row.size.trim() ||
        row.size.trim().length > 30 ||
        !allowedSystems.includes(row.sizeSystem) ||
        !allowedConditions.includes(row.condition) ||
        !Number.isSafeInteger(row.qty) ||
        row.qty < 1
      ) {
        fail(400, "Each row needs a rack, size, system, condition and whole-pair count");
      }

      const normalized = {
        rackId: row.rackId.toLowerCase(),
        size: row.size.trim().toUpperCase(),
        sizeSystem: row.sizeSystem,
        condition: row.condition,
        qty: row.qty,
      };

      const key = [
        normalized.rackId,
        normalized.size,
        normalized.sizeSystem,
        normalized.condition,
      ].join("|");

      if (keys.has(key)) {
        fail(400, "Combine duplicate rack/size/condition rows");
      }

      keys.add(key);
      return normalized;
    });

    const countedQty = rows.reduce(
      (total, row) => total + row.qty,
      0
    );

    if (!Number.isSafeInteger(countedQty)) {
      fail(400, "Count is too large");
    }

    session = await mongoose.startSession();

    let result;

    await session.withTransaction(async () => {
      const store = await authorisedStore(req, session);

      // Serialise setup submissions for this store.
      await Store.updateOne(
        { _id: store._id },
        {
          $set: { posStockManaged: true },
          $inc: { posStockRevision: 1 },
        },
        { session }
      );

      const batchFilter = {
        businessId: req.pos.business._id,
        storeId: store._id,
        articleId: body.articleId,
        color,
        mrpPaise,
        costPaise,
      };

      const existingSetup = await StockPositionSetup.findOne(
        batchFilter
      ).session(session);

      if (existingSetup) {
        fail(409, "This batch has already been allocated");
      }

      const article = await Article.findOne({
        _id: body.articleId,
        isActive: true,
      }).session(session);

      if (!article) {
        fail(409, "The article is missing or inactive");
      }

      const sku = await Sku.findOne({
        articleId: article._id,
        "color.normalized": color,
        isActive: true,
      }).session(session);

      if (!sku) {
        fail(
          409,
          "No active SKU exactly matches this article and ledger colour. Create or correct that SKU before allocating."
        );
      }

      const balanceRows = await StockLedger.aggregate([
        {
          $match: {
            storeId: store._id,
            articleId: article._id,
            color,
            mrp: body.mrp,
            cost: body.cost,
          },
        },
        {
          $group: {
            _id: null,
            qty: { $sum: "$qtyDelta" },
          },
        },
      ]).session(session);

      const ledgerQty = balanceRows.length
        ? balanceRows[0].qty
        : 0;

      if (
        !Number.isSafeInteger(ledgerQty) ||
        ledgerQty <= 0 ||
        countedQty !== ledgerQty
      ) {
        fail(
          409,
          `Allocation must match the current ledger balance. Ledger: ${ledgerQty}; counted: ${countedQty}.`
        );
      }

      // Reject an unexplained partial position setup.
      const existingPosition = await StockPosition.findOne({
        businessId: req.pos.business._id,
        storeId: store._id,
        skuId: sku._id,
        mrpPaise,
        costPaise,
      }).session(session);

      if (existingPosition) {
        fail(
          409,
          "Positions already exist for this batch. Review them before initial allocation."
        );
      }

      const rackIds = Array.from(
        new Set(rows.map((row) => row.rackId))
      );

      const racks = await Rack.find({
        _id: { $in: rackIds },
        storeId: store._id,
        isActive: true,
      }).session(session);

      if (racks.length !== rackIds.length) {
        fail(400, "Every rack must be active and belong to this store");
      }

      const locationIds = Array.from(
        new Set(racks.map((rack) => String(rack.locationId)))
      );

      const locations = await StoreLocation.find({
        _id: { $in: locationIds },
        storeId: store._id,
        isActive: true,
      }).session(session);

      if (locations.length !== locationIds.length) {
        fail(400, "A rack has an unavailable or invalid location");
      }

      const rackMap = new Map(
        racks.map((rack) => [String(rack._id), rack])
      );

      const locationMap = new Map(
        locations.map((location) => [
          String(location._id),
          location,
        ])
      );

      const actorId = req.pos.user._id;
      const verifiedAt = new Date();

      const documents = rows.map(function (row) {
        const rack = rackMap.get(row.rackId);
        const location = locationMap.get(
          String(rack.locationId)
        );

        const type = location.locationType || "OTHER";

        if (type === "OTHER") {
          fail(
            400,
            `Classify location ${location.name} before allocating stock`
          );
        }

        if (
          row.condition === "DAMAGED" &&
          type !== "QUARANTINE"
        ) {
          fail(400, "Damaged stock must be placed in quarantine");
        }

        return {
          businessId: req.pos.business._id,
          storeId: store._id,
          locationId: location._id,
          rackId: rack._id,
          skuId: sku._id,
          size: row.size,
          sizeSystem: row.sizeSystem,
          condition: row.condition,
          mrpPaise,
          costPaise,
          qty: row.qty,
          isActive: true,
          isVerified: true,
          verifiedAt,
          verifiedBy: actorId,
          updatedBy: actorId,
        };
      });

      const positions = await StockPosition.create(
        documents,
        { session }
      );

      const setups = await StockPositionSetup.create(
        [
          {
            ...batchFilter,
            skuId: sku._id,
            countedQty,
            positionIds: positions.map((position) => position._id),
            verifiedBy: actorId,
            verifiedAt,
          },
        ],
        { session }
      );

      result = {
        setupId: setups[0]._id,
        countedQty,
        positionCount: positions.length,
      };
    });

    return res.status(201).json({
      ok: true,
      message: "Stock allocated and verified. Ledger total unchanged.",
      data: result,
    });
  } catch (error) {
    return respondError(res, error);
  } finally {
    if (session) await session.endSession();
  }
};