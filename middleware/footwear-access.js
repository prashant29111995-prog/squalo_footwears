const jwt = require("jsonwebtoken");

const config = require("../config/config");
const User = require("../models/user");
const Party = require("../models/footwears/Party");
const Business = require("../models/footwears/Business");
const BusinessMembership = require(
  "../models/footwears/BusinessMembership"
);

const COOKIE_NAME = "squalo_pos";
const TOKEN_AUDIENCE = "squalo-pos";
const TOKEN_ISSUER = "squalo";

function reject(req, res, status, message) {
  res.set("Cache-Control", "no-store");

  if (status === 401 && req.method === "GET" && req.accepts("html")) {
    return res.redirect("/pos/login");
  }

  return res.status(status).json({
    ok: false,
    message,
  });
}

// Require JSON and a same-origin browser request for mutations.
// Use APP_ORIGIN in production, for example:
// APP_ORIGIN=https://your-domain.com
exports.checkPosOrigin = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  if (!req.is("application/json")) {
    return reject(req, res, 415, "Send an application/json request");
  }

  const origin = req.get("Origin");
  const expectedOrigin =
    process.env.APP_ORIGIN || `${req.protocol}://${req.get("host")}`;

  try {
    if (
      !origin ||
      new URL(origin).origin !== new URL(expectedOrigin).origin
    ) {
      return reject(req, res, 403, "Request origin is not allowed");
    }
  } catch (error) {
    return reject(req, res, 403, "Invalid request origin");
  }

  return next();
};

exports.requirePosSession = async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");

    const token = req.cookies && req.cookies[COOKIE_NAME];

    if (typeof token !== "string") {
      return reject(req, res, 401, "Please sign in to POS");
    }

    let claims;

    try {
      claims = jwt.verify(token, config.secret, {
        algorithms: ["HS256"],
        audience: TOKEN_AUDIENCE,
        issuer: TOKEN_ISSUER,
      });
    } catch (error) {
      return reject(req, res, 401, "Your POS session has expired");
    }

    const validId = (value) =>
      typeof value === "string" && /^[a-f\d]{24}$/i.test(value);

    if (
      !claims ||
      claims.purpose !== "POS_SESSION" ||
      !validId(claims.sub) ||
      !validId(claims.membershipId) ||
      !Number.isSafeInteger(claims.authVersion)
    ) {
      return reject(req, res, 401, "Invalid POS session");
    }

    const [user, membership] = await Promise.all([
      User.findById(claims.sub)
        .select(
          "name email user_type portalAccess is_active " +
          "mustChangePassword authVersion"
        )
        .lean(),

      BusinessMembership.findOne({
        _id: claims.membershipId,
        userId: claims.sub,
        isActive: true,
      }).lean(),
    ]);

    if (
      !user ||
      !user.is_active ||
      user.user_type !== "PartyStaff" ||
      user.portalAccess !== "POS" ||
      (user.authVersion || 0) !== claims.authVersion ||
      !membership
    ) {
      return reject(req, res, 401, "Your POS access is no longer active");
    }

    const business = await Business.findOne({
      _id: membership.businessId,
      businessType: "PARTY",
      isActive: true,
    }).lean();

    if (!business) {
      return reject(req, res, 403, "Business workspace is unavailable");
    }

    const party = await Party.findOne({
      _id: business.sourcePartyId,
      businessId: business._id,
      isActive: true,
      posEnabled: true,
      partyType: { $in: ["CUSTOMER", "BOTH"] },
    })
      .select("_id ownershipType")
      .lean();

    if (
      !party ||
      (party.ownershipType || "INDEPENDENT_BUYER") !==
        business.ownershipType
    ) {
      return reject(req, res, 403, "Party POS access is unavailable");
    }

    const knownRoles = [
      "OWNER",
      "MANAGER",
      "CASHIER",
      "SALESPERSON",
      "STOCKIST",
    ];

    if (
      !knownRoles.includes(membership.role) ||
      !["ALL", "ASSIGNED"].includes(membership.storeAccess) ||
      (
        membership.storeAccess === "ALL" &&
        !["OWNER", "MANAGER"].includes(membership.role)
      )
    ) {
      return reject(req, res, 403, "Invalid staff access configuration");
    }

    // Keep POS identity separate from legacy req.user.
    req.pos = {
      user,
      membership,
      business,
      partyId: party._id,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

exports.requirePosPasswordChanged = (req, res, next) => {
  if (!req.pos) {
    return reject(req, res, 401, "Please sign in to POS");
  }

  if (req.pos.user.mustChangePassword) {
    if (req.method === "GET" && req.accepts("html")) {
      return res.redirect("/pos/change-password");
    }

    return res.status(403).json({
      ok: false,
      code: "PASSWORD_CHANGE_REQUIRED",
      message: "Change your temporary password before continuing",
    });
  }

  return next();
};

// Used when operational routes are added.
exports.requirePosRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.pos) {
      return reject(req, res, 401, "Please sign in to POS");
    }

    if (!allowedRoles.includes(req.pos.membership.role)) {
      return reject(req, res, 403, "This action is not permitted for your role");
    }

    return next();
  };
};

// Build store queries from membership, never from browser input alone.
exports.posStoreFilter = (req) => {
  if (!req.pos) {
    throw new Error("POS authentication is required");
  }

  const filter = {
    businessId: req.pos.business._id,
    isActive: true,
  };

  if (req.pos.membership.storeAccess !== "ALL") {
    filter._id = {
      $in: req.pos.membership.storeIds || [],
    };
  }

  return filter;
};