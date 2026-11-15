const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const User = require("../../models/user");
const Business = require("../../models/footwears/Business");
const Party = require("../../models/footwears/Party");
const Store = require("../../models/footwears/Store");
const BusinessMembership = require(
  "../../models/footwears/BusinessMembership"
);

const ROLES = [
  "OWNER",
  "MANAGER",
  "CASHIER",
  "SALESPERSON",
  "STOCKIST",
];

const isValidId = (value) =>
  typeof value === "string" &&
  /^[a-f\d]{24}$/i.test(value);

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function requiredText(value, field, maxLength) {
  if (typeof value !== "string") {
    fail(400, `${field} is required`);
  }

  const result = value.trim();

  if (!result || result.length > maxLength) {
    fail(
      400,
      `${field} must contain between 1 and ${maxLength} characters`
    );
  }

  return result;
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
      message: "Staff validation failed",
      errors: Object.values(error.errors).map(
        (item) => item.message
      ),
    });
  }

  if (error.code === 11000) {
    const fields = Object.keys(error.keyPattern || {});

    const deviceConflict =
      fields.includes("user_device") ||
      String(error.message).includes("user_device");

    return res.status(409).json({
      ok: false,
      message: deviceConflict
        ? "The existing user_device unique index prevents creating another account without a device. Update that index before creating staff."
        : "The email, phone, or business membership already exists",
    });
  }

  console.error(message, error);

  return res.status(500).json({
    ok: false,
    message,
  });
}

async function getBusiness(businessId, session) {
  const business = await Business.findById(businessId)
    .session(session || null);

  if (!business) {
    fail(404, "Business workspace not found");
  }

  return business;
}

async function requireUsablePartyWorkspace(business, session) {
  if (!business.isActive) {
    fail(409, "Business workspace is inactive");
  }

  if (business.businessType !== "PARTY") {
    fail(
      400,
      "This staff workflow is for buying-party POS workspaces"
    );
  }

  const party = await Party.findById(business.sourcePartyId)
    .session(session);

  if (
    !party ||
    !party.isActive ||
    !party.posEnabled ||
    !["CUSTOMER", "BOTH"].includes(party.partyType)
  ) {
    fail(
      409,
      "The linked party must be active, eligible, and POS enabled"
    );
  }

  if (
    !party.businessId ||
    String(party.businessId) !== String(business._id)
  ) {
    fail(409, "The party workspace link needs repair");
  }

  if (
    (party.ownershipType || "INDEPENDENT_BUYER") !==
    business.ownershipType
  ) {
    fail(409, "Party and workspace ownership types differ");
  }
}

function parseAssignment(body) {
  const role = requiredText(body.role, "role", 30).toUpperCase();

  if (!ROLES.includes(role)) {
    fail(400, "Invalid staff role");
  }

  const storeAccess = (
    body.storeAccess === undefined
      ? "ASSIGNED"
      : requiredText(body.storeAccess, "storeAccess", 20)
  ).toUpperCase();

  if (!["ALL", "ASSIGNED"].includes(storeAccess)) {
    fail(400, "storeAccess must be ALL or ASSIGNED");
  }

  const rawStoreIds =
    body.storeIds === undefined ? [] : body.storeIds;

  if (
    !Array.isArray(rawStoreIds) ||
    rawStoreIds.length > 200 ||
    rawStoreIds.some((id) => !isValidId(id))
  ) {
    fail(400, "storeIds must be an array of valid store IDs");
  }

  const storeIds = Array.from(
    new Set(rawStoreIds.map((id) => id.toLowerCase()))
  );

  const defaultStoreId =
    body.defaultStoreId === undefined ||
    body.defaultStoreId === null ||
    body.defaultStoreId === ""
      ? null
      : body.defaultStoreId;

  if (defaultStoreId && !isValidId(defaultStoreId)) {
    fail(400, "Invalid defaultStoreId");
  }

  return {
    role,
    storeAccess,
    storeIds,
    defaultStoreId: defaultStoreId
      ? defaultStoreId.toLowerCase()
      : null,
  };
}

async function validateStores(businessId, assignment, session) {
  const ids = Array.from(
    new Set([
      ...assignment.storeIds,
      ...(assignment.defaultStoreId
        ? [assignment.defaultStoreId]
        : []),
    ])
  );

  if (!ids.length) return;

  const stores = await Store.find({
    _id: { $in: ids },
    businessId,
    isActive: true,
  })
    .select("_id")
    .session(session)
    .lean();

  if (stores.length !== ids.length) {
    fail(
      400,
      "Every selected store must be active and belong to this business"
    );
  }
}

// POST /businesses/:businessId/staff
exports.create = async (req, res) => {
  let session;

  try {
    const { businessId } = req.params;

    if (!isValidId(businessId)) {
      fail(400, "Invalid businessId");
    }

    const body = req.body;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      fail(400, "A JSON object is required");
    }

    const name = requiredText(body.name, "name", 150);
    const email = requiredText(body.email, "email", 254)
      .toLowerCase();

    // Retain the existing numeric phone schema for compatibility.
    // The UI must submit phone as a string.
    const phoneText = requiredText(body.phone, "phone", 15);

    if (!/^[1-9]\d{6,14}$/.test(phoneText)) {
      fail(
        400,
        "Phone must contain 7–15 digits without spaces or a leading zero"
      );
    }

    const phone = Number(phoneText);

    if (!Number.isSafeInteger(phone)) {
      fail(400, "Invalid phone number");
    }

    // Do not trim passwords.
    const password = body.temporaryPassword;

    if (
      typeof password !== "string" ||
      password.length < 10 ||
      Buffer.byteLength(password, "utf8") > 72 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      fail(
        400,
        "Temporary password must have at least 10 characters, contain a letter and a number, and fit within 72 UTF-8 bytes"
      );
    }

    const assignment = parseAssignment(body);

    const actorId = req.user && req.user.userId;

    if (!isValidId(actorId)) {
      fail(401, "Please sign in again");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    session = await mongoose.startSession();

    let responseData;

    await session.withTransaction(async () => {
      const business = await getBusiness(businessId, session);

      await requireUsablePartyWorkspace(business, session);
      await validateStores(business._id, assignment, session);

      const existingUser = await User.findOne({
        $or: [{ email }, { phone }],
      })
        .select("_id")
        .session(session)
        .lean();

      if (existingUser) {
        fail(
          409,
          "An account already uses this email or phone. Existing accounts must be linked through a separate membership workflow."
        );
      }

      const users = await User.create(
        [
          {
            name,
            email,
            phone,
            user_type: "PartyStaff",
            portalAccess: "POS",
            is_active: true,
            password: passwordHash,
            mustChangePassword: true,
            authVersion: 0,
            createdby: actorId,
          },
        ],
        { session }
      );

      const user = users[0];

      const memberships = await BusinessMembership.create(
        [
          {
            userId: user._id,
            businessId: business._id,
            ...assignment,
            isActive: true,
            createdBy: actorId,
            updatedBy: actorId,
          },
        ],
        { session }
      );

      // Return an explicit projection, never the full User document.
      responseData = {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          is_active: user.is_active,
          mustChangePassword: user.mustChangePassword,
        },
        membership: memberships[0].toObject(),
      };
    });

    return res.status(201).json({
      ok: true,
      message: "Staff account and business membership created",
      data: responseData,
    });
  } catch (error) {
    return handleError(res, error, "Failed to create staff account");
  } finally {
    if (session) await session.endSession();
  }
};

// GET /businesses/:businessId/staff?page=1&limit=25
exports.list = async (req, res) => {
  try {
    const { businessId } = req.params;

    if (!isValidId(businessId)) {
      fail(400, "Invalid businessId");
    }

    await getBusiness(businessId);

    const page = Number(req.query.page || 1);
    const limit = Math.min(Number(req.query.limit || 25), 100);

    if (
      !Number.isSafeInteger(page) ||
      !Number.isSafeInteger(limit) ||
      page < 1 ||
      limit < 1 ||
      !Number.isSafeInteger((page - 1) * limit)
    ) {
      fail(400, "Invalid pagination");
    }

    const filter = { businessId };

    const [items, total] = await Promise.all([
      BusinessMembership.find(filter)
        .populate(
          "userId",
          "name email phone user_type is_active mustChangePassword"
        )
        .populate("storeIds", "code name isActive")
        .populate("defaultStoreId", "code name isActive")
        .sort({ createdAt: -1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      BusinessMembership.countDocuments(filter),
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
    return handleError(res, error, "Failed to list staff");
  }
};