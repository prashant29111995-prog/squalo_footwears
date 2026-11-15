const express = require("express");

const router = express.Router();

const authController = require(
  "../../controller/footwears/posAuth.controller"
);

const stockController = require(
  "../../controller/footwears/posStock.controller"
);

const dashboardController = require(
  "../../controller/footwears/dashboard.controller"
);

const setupController = require(
  "../../controller/footwears/stockPositionSetup.controller"
);

const {
  checkPosOrigin,
  requirePosSession,
  requirePosPasswordChanged,
  requirePosRole,
} = require("../../middleware/footwear-access");

// --------------------------------------------------
// Shared response settings and origin validation
// --------------------------------------------------

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.use(checkPosOrigin);

// --------------------------------------------------
// Public login and logout
// --------------------------------------------------

router.get("/login", authController.getLogin);

router.post(
  "/login",
  authController.limitLogin,
  authController.login
);

// Allow clearing the cookie even when the session has expired.
router.post("/logout", authController.logout);

// --------------------------------------------------
// Authenticated staff session
// --------------------------------------------------

router.use(requirePosSession);

// Temporary-password users can access these routes.
router.get(
  "/change-password",
  authController.getPasswordChange
);

router.post(
  "/change-password",
  authController.changePassword
);

// --------------------------------------------------
// Operational access requires a completed password change
// --------------------------------------------------

router.use(requirePosPasswordChanged);

router.get(
  "/stores/:storeId/stock/setup",
  requirePosRole("OWNER", "MANAGER"),
  setupController.page
);

router.get(
  "/stores/:storeId/stock/setup/data",
  requirePosRole("OWNER", "MANAGER"),
  setupController.getData
);

router.patch(
  "/stores/:storeId/stock/setup/locations/:locationId",
  requirePosRole("OWNER", "MANAGER"),
  setupController.classifyLocation
);

router.post(
  "/stores/:storeId/stock/setup/verify",
  requirePosRole("OWNER", "MANAGER"),
  setupController.verify
);


router.get("/", (req, res) => {
  return res.redirect("/pos/dashboard");
});

router.get(
  "/stores/:storeId/stock/sources",
  requirePosRole(
    "OWNER",
    "MANAGER",
    "CASHIER",
    "SALESPERSON",
    "STOCKIST"
  ),
  stockController.listSources
);

router.get(
  "/dashboard",
  dashboardController.getDashboard
);

// Add future scoped billing, stock and receipt routes here.

// --------------------------------------------------
// Unknown POS route
// --------------------------------------------------

router.use((req, res) => {
  return res.status(404).json({
    ok: false,
    message: "POS route not found",
  });
});

// --------------------------------------------------
// Error handler
// --------------------------------------------------

router.use((error, req, res, next) => {
  console.error("POS request failed", error);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    ok: false,
    message: "Unable to complete this POS request",
  });
});

module.exports = router;