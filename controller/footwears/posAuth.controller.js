const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const config = require("../../config/config");
const User = require("../../models/user");
const Store = require("../../models/footwears/Store");
const Business = require("../../models/footwears/Business");
const Party = require("../../models/footwears/Party");
const BusinessMembership = require(
  "../../models/footwears/BusinessMembership"
);

const {
  posStoreFilter,
} = require("../../middleware/footwear-access");

const COOKIE_NAME = "squalo_pos";

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/pos",
  };
}

function issueSession(res, user, membershipId) {
  const token = jwt.sign(
    {
      purpose: "POS_SESSION",
      membershipId: String(membershipId),
      authVersion: user.authVersion || 0,
    },
    config.secret,
    {
      algorithm: "HS256",
      subject: String(user._id),
      audience: "squalo-pos",
      issuer: "squalo",
      expiresIn: "9h",
    }
  );

  res.cookie(COOKIE_NAME, token, {
    ...cookieOptions(),
    maxAge: 9 * 60 * 60 * 1000,
  });
}

// Basic single-process login throttling.
// For multiple server instances, replace with a shared limiter.
const loginAttempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 30;

exports.limitLogin = (req, res, next) => {
  const now = Date.now();

  // Bound memory use and remove expired entries.
  for (const [key, record] of loginAttempts) {
    if (record.expiresAt <= now) {
      loginAttempts.delete(key);
    }
  }

  const key = req.ip || req.socket.remoteAddress || "unknown";
  let record = loginAttempts.get(key);

  if (!record) {
    if (loginAttempts.size >= 10000) {
      return res.status(429).json({
        ok: false,
        message: "Login is busy. Please try again later.",
      });
    }

    record = {
      count: 0,
      expiresAt: now + WINDOW_MS,
    };

    loginAttempts.set(key, record);
  }

  record.count += 1;

  if (record.count > MAX_ATTEMPTS) {
    res.set(
      "Retry-After",
      String(Math.ceil((record.expiresAt - now) / 1000))
    );

    return res.status(429).json({
      ok: false,
      message: "Too many login attempts. Please try again later.",
    });
  }

  return next();
};

exports.getLogin = (req, res) => {
  res.set("Cache-Control", "no-store");

  return res.render("pos/auth", {
    mode: "login",
    pageTitle: "Squalo POS | Staff Login",
  });
};

exports.login = async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");

    const {
      email,
      password,
      workspaceCode,
    } = req.body || {};

    function rejectLogin(reason) {
      // Diagnostic logging only; never log passwords or tokens.
      console.warn("[POS LOGIN REJECTED]", reason);

      return res.status(401).json({
        ok: false,
        message: "Invalid login details or POS access is unavailable",
      });
    }

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof workspaceCode !== "string" ||
      !email.trim() ||
      email.length > 254 ||
      !workspaceCode.trim() ||
      workspaceCode.length > 100 ||
      !password ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        ok: false,
        message: "Enter your workspace code, email and password",
      });
    }

    const user = await User.findOne({
  email: email.trim().toLowerCase(),
}).select(
  "_id name email user_type portalAccess is_active " +
  "mustChangePassword authVersion password"
);

    if (!user) {
      return rejectLogin("USER_NOT_FOUND");
    }

    if (user.user_type !== "PartyStaff") {
      return rejectLogin("USER_IS_NOT_PARTY_STAFF");
    }

    if (!user.is_active) {
      return rejectLogin("USER_INACTIVE");
    }

    if (user.portalAccess !== "POS") {
      return rejectLogin("USER_PORTAL_ACCESS_IS_NOT_POS");
    }

    if (!user.password) {
      return rejectLogin("PASSWORD_HASH_MISSING");
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return rejectLogin("PASSWORD_MISMATCH");
    }

    const business = await Business.findOne({
      code: workspaceCode.trim().toUpperCase(),
    }).lean();

    if (!business) {
      return rejectLogin("WORKSPACE_CODE_NOT_FOUND");
    }

    if (business.businessType !== "PARTY") {
      return rejectLogin("WORKSPACE_IS_NOT_PARTY_TYPE");
    }

    if (!business.isActive) {
      return rejectLogin("WORKSPACE_INACTIVE");
    }

    const membership = await BusinessMembership.findOne({
      userId: user._id,
      businessId: business._id,
    }).lean();

    if (!membership) {
      return rejectLogin("USER_HAS_NO_MEMBERSHIP_IN_THIS_WORKSPACE");
    }

    if (!membership.isActive) {
      return rejectLogin("MEMBERSHIP_INACTIVE");
    }

    const allowedRoles = [
      "OWNER",
      "MANAGER",
      "CASHIER",
      "SALESPERSON",
      "STOCKIST",
    ];

    if (
      !allowedRoles.includes(membership.role) ||
      !["ALL", "ASSIGNED"].includes(membership.storeAccess) ||
      (
        membership.storeAccess === "ALL" &&
        !["OWNER", "MANAGER"].includes(membership.role)
      )
    ) {
      return rejectLogin("MEMBERSHIP_ACCESS_CONFIGURATION_INVALID");
    }

    const party = await Party.findById(
      business.sourcePartyId
    )
      .select(
        "_id businessId isActive posEnabled partyType ownershipType"
      )
      .lean();

    if (!party) {
      return rejectLogin("WORKSPACE_SOURCE_PARTY_NOT_FOUND");
    }

    if (
      !party.businessId ||
      String(party.businessId) !== String(business._id)
    ) {
      return rejectLogin("PARTY_BUSINESS_LINK_MISMATCH");
    }

    if (!party.isActive) {
      return rejectLogin("PARTY_INACTIVE");
    }

    if (!party.posEnabled) {
      return rejectLogin("PARTY_POS_DISABLED");
    }

    if (!["CUSTOMER", "BOTH"].includes(party.partyType)) {
      return rejectLogin("PARTY_IS_NOT_A_BUYER");
    }

    if (
      (party.ownershipType || "INDEPENDENT_BUYER") !==
      business.ownershipType
    ) {
      return rejectLogin("PARTY_AND_WORKSPACE_OWNERSHIP_MISMATCH");
    }

    issueSession(res, user, membership._id);

    return res.json({
      ok: true,
      redirectURL: user.mustChangePassword
        ? "/pos/change-password"
        : "/pos/dashboard",
    });
  } catch (error) {
    return next(error);
  }
};

exports.getPasswordChange = (req, res) => {
  return res.render("pos/auth", {
    mode: "password",
    pageTitle: "Squalo POS | Change Password",
  });
};

exports.changePassword = async (req, res, next) => {
  try {
    const {
      oldPassword,
      newPassword,
      confirmPassword,
    } = req.body || {};

    if (
      typeof oldPassword !== "string" ||
      typeof newPassword !== "string" ||
      typeof confirmPassword !== "string" ||
      Buffer.byteLength(oldPassword, "utf8") > 72 ||
      newPassword !== confirmPassword ||
      newPassword.length < 10 ||
      Buffer.byteLength(newPassword, "utf8") > 72 ||
      !/[A-Za-z]/.test(newPassword) ||
      !/\d/.test(newPassword)
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "Use at least 10 characters with a letter and number. " +
          "Passwords must match and fit within 72 UTF-8 bytes.",
      });
    }

    const user = await User.findById(req.pos.user._id)
  .select("_id is_active authVersion password");

    if (
      !user ||
      !user.is_active ||
      !user.password ||
      (user.authVersion || 0) !==
        (req.pos.user.authVersion || 0)
    ) {
      return res.status(401).json({
        ok: false,
        message: "Please sign in again",
      });
    }

    if (!(await bcrypt.compare(oldPassword, user.password))) {
      return res.status(400).json({
        ok: false,
        message: "Current password is incorrect",
      });
    }

    if (await bcrypt.compare(newPassword, user.password)) {
      return res.status(400).json({
        ok: false,
        message: "Choose a different password",
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const result = await User.updateOne(
      {
        _id: user._id,
        is_active: true,
        password: user.password,
      },
      {
        $set: {
          password: passwordHash,
          mustChangePassword: false,
        },
        $unset: {
          originalpass: "",
        },
        $inc: {
          authVersion: 1,
        },
      }
    );

    const modified =
      result.modifiedCount !== undefined
        ? result.modifiedCount
        : result.nModified;

    if (modified !== 1) {
      return res.status(409).json({
        ok: false,
        message: "Your account changed. Please sign in again.",
      });
    }

    // Require a fresh login after changing the password.
    res.clearCookie(COOKIE_NAME, cookieOptions());

    return res.json({
      ok: true,
      redirectURL: "/pos/login",
      message: "Password changed. Sign in with your new password.",
    });
  } catch (error) {
    return next(error);
  }
};

exports.logout = (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());

  return res.json({
    ok: true,
    redirectURL: "/pos/login",
  });
};

// Initial authenticated landing page.
// Sales and operational metrics will be added in Step 6.
exports.getLanding = async (req, res, next) => {
  try {
    const stores = await Store.find(posStoreFilter(req))
      .select("_id code name type")
      .sort({ name: 1 })
      .lean();

    return res.render("pos/home", {
      pageTitle: "Squalo POS | Workspace",
      staffName: req.pos.user.name,
      businessName: req.pos.business.name,
      role: req.pos.membership.role,
      stores,
    });
  } catch (error) {
    return next(error);
  }
};