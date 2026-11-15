const mongoose = require("mongoose");
const Party = require("../../models/footwears/Party");

const PARTY_TYPES = ["SUPPLIER", "CUSTOMER", "BOTH"];
const OWNERSHIP_TYPES = ["INDEPENDENT_BUYER", "OWNED_OUTLET"];

const has = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);

const up = (value) => String(value ?? "").trim().toUpperCase();
const text = (value) => String(value ?? "").trim();

const isValidObjectId = (value) =>
  typeof value === "string" &&
  /^[a-f\d]{24}$/i.test(value) &&
  mongoose.Types.ObjectId.isValid(value);

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizeBoolean(value, field) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;

  throw badRequest(`${field} must be true or false`);
}

function normalizeEnum(value, allowed, field) {
  const normalized = up(value);

  if (!allowed.includes(normalized)) {
    throw badRequest(`${field} must be ${allowed.join(", ")}`);
  }

  return normalized;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sendError(res, error, message) {
  if (error.status === 400) {
    return res.status(400).json({
      ok: false,
      message: error.message,
    });
  }

  if (error.name === "ValidationError") {
    return res.status(400).json({
      ok: false,
      message: "Party validation failed",
      errors: Object.values(error.errors).map((item) => item.message),
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      ok: false,
      message: "A record with this unique value already exists",
    });
  }

  console.error(message, error);

  return res.status(500).json({
    ok: false,
    message,
  });
}

function applyPartyFields(party, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw badRequest("A JSON object is required");
  }

  // Workspace links must be assigned by the dedicated
  // provisioning workflow, not by general party editing.
  if (has(body, "businessId")) {
    throw badRequest(
      "businessId must be assigned through workspace provisioning"
    );
  }

  if (has(body, "name")) {
    const name = up(body.name);

    if (!name) {
      throw badRequest("Party name required");
    }

    party.name = name;
  }

  const textFields = [
    "phone",
    "whatsapp",
    "address",
    "notes",
  ];

  for (const field of textFields) {
    if (has(body, field)) {
      party[field] = text(body[field]);
    }
  }

  for (const field of ["city", "area", "gstin"]) {
    if (has(body, field)) {
      party[field] = up(body[field]);
    }
  }

  if (has(body, "partyType")) {
    party.partyType = normalizeEnum(
      body.partyType,
      PARTY_TYPES,
      "partyType"
    );
  }

  if (has(body, "ownershipType")) {
    party.ownershipType = normalizeEnum(
      body.ownershipType,
      OWNERSHIP_TYPES,
      "ownershipType"
    );
  }

  if (has(body, "isActive")) {
    party.isActive = normalizeBoolean(body.isActive, "isActive");
  }

  if (has(body, "posEnabled")) {
    party.posEnabled = normalizeBoolean(body.posEnabled, "posEnabled");
  }

  // Deactivating a party or changing it to supplier-only
  // also disables its POS setting.
  const isBuyer =
    party.partyType === "CUSTOMER" || party.partyType === "BOTH";

  if (!party.isActive || !isBuyer) {
    if (has(body, "posEnabled") && party.posEnabled) {
      throw badRequest(
        "POS can only be enabled for an active CUSTOMER or BOTH party"
      );
    }

    party.posEnabled = false;
  }

  // Accounting balances, publicLedgerToken, businessId,
  // and sales/payment totals are intentionally not editable here.
}

exports.create = async (req, res) => {
  try {
    const party = new Party();

    applyPartyFields(party, req.body);

    if (!party.name) {
      throw badRequest("Party name required");
    }

    await party.save();

    return res.status(201).json({
      ok: true,
      data: party,
    });
  } catch (error) {
    return sendError(res, error, "Failed to create party");
  }
};

exports.list = async (req, res) => {
  try {
    const filter = {};

    // Preserve your current default: list active parties.
    filter.isActive =
      req.query.isActive === undefined
        ? true
        : normalizeBoolean(req.query.isActive, "isActive");

    if (req.query.partyType !== undefined) {
      filter.partyType = normalizeEnum(
        req.query.partyType,
        PARTY_TYPES,
        "partyType"
      );
    }

    if (req.query.ownershipType !== undefined) {
      const ownershipType = normalizeEnum(
        req.query.ownershipType,
        OWNERSHIP_TYPES,
        "ownershipType"
      );

      // Older records may not contain the new field yet.
      filter.$and = [
        ownershipType === "INDEPENDENT_BUYER"
          ? {
              $or: [
                { ownershipType: "INDEPENDENT_BUYER" },
                { ownershipType: { $exists: false } },
              ],
            }
          : { ownershipType },
      ];
    }

    if (req.query.posEnabled !== undefined) {
      const enabled = normalizeBoolean(
        req.query.posEnabled,
        "posEnabled"
      );

      // Missing fields on older records mean POS is disabled.
      if (enabled) {
        filter.posEnabled = true;
      } else {
        filter.$and = filter.$and || [];
        filter.$and.push({
          $or: [
            { posEnabled: false },
            { posEnabled: { $exists: false } },
          ],
        });
      }
    }

    if (req.query.q !== undefined) {
      if (typeof req.query.q !== "string") {
        throw badRequest("q must be a string");
      }

      const query = req.query.q.trim();

      if (query.length > 100) {
        throw badRequest("Search text must be 100 characters or fewer");
      }

      if (query) {
        const rx = new RegExp(escapeRegex(query), "i");

        filter.$or = [
          { name: rx },
          { phone: rx },
        ];
      }
    }

    const requestedLimit =
      req.query.limit === undefined ? 100 : Number(req.query.limit);

    if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
      throw badRequest("limit must be a positive integer");
    }

    const items = await Party.find(filter)
      .sort({ name: 1, _id: 1 })
      .limit(Math.min(requestedLimit, 200))
      .lean();

    // Provide consistent defaults for records created before this update.
    const data = items.map((party) => ({
      ...party,
      ownershipType: party.ownershipType || "INDEPENDENT_BUYER",
      posEnabled: party.posEnabled === true,
    }));

    return res.json({
      ok: true,
      data,
    });
  } catch (error) {
    return sendError(res, error, "Failed to list parties");
  }
};

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      throw badRequest("Invalid party id");
    }

    const party = await Party.findById(id).lean();

    if (!party) {
      return res.status(404).json({
        ok: false,
        message: "Party not found",
      });
    }

    return res.json({
      ok: true,
      data: {
        ...party,
        ownershipType: party.ownershipType || "INDEPENDENT_BUYER",
        posEnabled: party.posEnabled === true,
      },
    });
  } catch (error) {
    return sendError(res, error, "Failed to get party");
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      throw badRequest("Invalid party id");
    }

    const party = await Party.findById(id);

    if (!party) {
      return res.status(404).json({
        ok: false,
        message: "Party not found",
      });
    }

    applyPartyFields(party, req.body);

    await party.save();

    return res.json({
      ok: true,
      data: party,
    });
  } catch (error) {
    return sendError(res, error, "Failed to update party");
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      throw badRequest("Invalid party id");
    }

    const party = await Party.findById(id);

    if (!party) {
      return res.status(404).json({
        ok: false,
        message: "Party not found",
      });
    }

    party.isActive = false;
    party.posEnabled = false;

    await party.save();

    return res.json({
      ok: true,
      message: "Party deactivated and POS disabled",
    });
  } catch (error) {
    return sendError(res, error, "Failed to remove party");
  }
};