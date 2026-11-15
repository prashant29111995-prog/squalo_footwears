const mongoose = require("mongoose");

const Store = require("../../models/footwears/Store");
const Business = require("../../models/footwears/Business");

const STORE_TYPES = ["RETAIL", "GODOWN", "WAREHOUSE"];

const has = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);

const isValidObjectId = (value) =>
  typeof value === "string" &&
  /^[a-f\d]{24}$/i.test(value) &&
  mongoose.Types.ObjectId.isValid(value);

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function requireBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    fail(400, "A JSON object is required");
  }
}

function readText(value, field, required = false) {
  if (typeof value !== "string") {
    fail(400, `${field} must be a string`);
  }

  const result = value.trim();

  if (required && !result) {
    fail(400, `${field} is required`);
  }

  return result;
}

function readBoolean(value, field) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;

  fail(400, `${field} must be true or false`);
}

function readPositiveInteger(value, fallback, field) {
  if (value === undefined) return fallback;

  const result = Number(value);

  if (!Number.isSafeInteger(result) || result < 1) {
    fail(400, `${field} must be a positive integer`);
  }

  return result;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function handleError(res, error, message) {
  if (error.status) {
    return res.status(error.status).json({
      ok: false,
      message: error.message,
    });
  }

  if (error.name === "ValidationError") {
    return res.status(400).json({
      ok: false,
      message: "Store validation failed",
      errors: Object.values(error.errors).map((item) => item.message),
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      ok: false,
      message: "Store code already exists",
    });
  }

  console.error(message, error);

  return res.status(500).json({
    ok: false,
    message,
  });
}

function applyStoreFields(store, body) {
  if (has(body, "code")) {
    store.code = readText(body.code, "code", true).toUpperCase();
  }

  if (has(body, "name")) {
    store.name = readText(body.name, "name", true);
  }

  if (has(body, "type")) {
    const type = readText(body.type, "type", true).toUpperCase();

    if (!STORE_TYPES.includes(type)) {
      fail(400, "type must be RETAIL, GODOWN, or WAREHOUSE");
    }

    store.type = type;
  }

  if (has(body, "isActive")) {
    store.isActive = readBoolean(body.isActive, "isActive");
  }

  if (has(body, "address")) {
    if (
      !body.address ||
      typeof body.address !== "object" ||
      Array.isArray(body.address)
    ) {
      fail(400, "address must be an object");
    }

    // Merge supplied address fields rather than erase omitted fields.
    for (const field of ["line1", "city", "state", "pincode"]) {
      if (has(body.address, field)) {
        store.set(
          `address.${field}`,
          readText(body.address[field], `address.${field}`)
        );
      }
    }
  }
}

async function requireActiveBusiness(businessId) {
  if (!isValidObjectId(businessId)) {
    fail(400, "A valid businessId is required");
  }

  const business = await Business.findById(businessId)
    .select("_id isActive")
    .lean();

  if (!business) {
    fail(404, "Business workspace not found");
  }

  if (!business.isActive) {
    fail(409, "Business workspace is inactive");
  }

  return business;
}

// POST /stores
exports.create = async (req, res) => {
  try {
    requireBody(req.body);

    await requireActiveBusiness(req.body.businessId);

    const store = new Store({
      businessId: req.body.businessId,
    });

    applyStoreFields(store, req.body);

    if (!store.code || !store.name) {
      fail(400, "code and name are required");
    }

    await store.save();

    return res.status(201).json({
      ok: true,
      data: store,
    });
  } catch (error) {
    return handleError(res, error, "Failed to create store");
  }
};

// GET /stores
exports.list = async (req, res) => {
  try {
    const filter = {};

    if (req.query.isActive === "all") {
      // Central administrator can request all account statuses.
    } else {
      filter.isActive =
        req.query.isActive === undefined
          ? true
          : readBoolean(req.query.isActive, "isActive");
    }

    if (req.query.businessId !== undefined) {
      if (!isValidObjectId(req.query.businessId)) {
        fail(400, "Invalid businessId");
      }

      filter.businessId = req.query.businessId;
    }

    if (req.query.type !== undefined) {
      const type = readText(req.query.type, "type", true).toUpperCase();

      if (!STORE_TYPES.includes(type)) {
        fail(400, "type must be RETAIL, GODOWN, or WAREHOUSE");
      }

      filter.type = type;
    }

    if (req.query.q !== undefined) {
      const query = readText(req.query.q, "q");

      if (query.length > 100) {
        fail(400, "Search text must be 100 characters or fewer");
      }

      if (query) {
        const rx = new RegExp(escapeRegex(query), "i");
        filter.$or = [{ code: rx }, { name: rx }];
      }
    }

    const page = readPositiveInteger(req.query.page, 1, "page");
    const limit = Math.min(
      readPositiveInteger(req.query.limit, 25, "limit"),
      200
    );

    const skip = (page - 1) * limit;

    if (!Number.isSafeInteger(skip)) {
      fail(400, "page is too large");
    }

    const requestedSort = req.query.sort || "-createdAt";
    const allowedSorts = [
      "createdAt",
      "-createdAt",
      "updatedAt",
      "-updatedAt",
      "name",
      "-name",
      "code",
      "-code",
    ];

    if (!allowedSorts.includes(requestedSort)) {
      fail(400, "Invalid sort field");
    }

    const descending = requestedSort.startsWith("-");
    const sortField = descending
      ? requestedSort.slice(1)
      : requestedSort;

    const sort = {
      [sortField]: descending ? -1 : 1,
      _id: 1,
    };

    const [items, total] = await Promise.all([
      Store.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Store.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      data: items,
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleError(res, error, "Failed to list stores");
  }
};

// GET /stores/:id
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      fail(400, "Invalid store id");
    }

    const store = await Store.findById(id).lean();

    if (!store) {
      fail(404, "Store not found");
    }

    return res.json({
      ok: true,
      data: store,
    });
  } catch (error) {
    return handleError(res, error, "Failed to get store");
  }
};

// PATCH /stores/:id
exports.update = async (req, res) => {
  let session;

  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      fail(400, "Invalid store id");
    }

    requireBody(req.body);

    session = await mongoose.startSession();

    let result;

    await session.withTransaction(async () => {
      const store = await Store.findById(id).session(session);

      if (!store) {
        fail(404, "Store not found");
      }

      if (has(req.body, "businessId")) {
        const requestedBusinessId = req.body.businessId;

        if (!isValidObjectId(requestedBusinessId)) {
          fail(400, "Invalid businessId");
        }

        const existingBusinessId = store.businessId
          ? String(store.businessId)
          : "";

        const normalizedRequestedId = String(
          new mongoose.Types.ObjectId(requestedBusinessId)
        );

        if (
          existingBusinessId &&
          existingBusinessId !== normalizedRequestedId
        ) {
          fail(
            409,
            "This store already belongs to a business. Ownership changes require a separate migration."
          );
        }

        const business = await Business.findById(requestedBusinessId)
          .select("_id isActive")
          .session(session)
          .lean();

        if (!business) {
          fail(404, "Business workspace not found");
        }

        if (!business.isActive) {
          fail(409, "Business workspace is inactive");
        }

        store.businessId = requestedBusinessId;
      }

      applyStoreFields(store, req.body);

      await store.save({ session });

      result = store.toObject();
    });

    return res.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return handleError(res, error, "Failed to update store");
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

// DELETE /stores/:id
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      fail(400, "Invalid store id");
    }

    const store = await Store.findById(id);

    if (!store) {
      fail(404, "Store not found");
    }

    store.isActive = false;
    await store.save();

    return res.json({
      ok: true,
      message: "Store deactivated",
      data: store,
    });
  } catch (error) {
    return handleError(res, error, "Failed to deactivate store");
  }
};