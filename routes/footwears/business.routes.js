const express = require("express");
const router = express.Router();

const businessController = require(
  "../../controller/footwears/business.controller"
);

const staffController = require(
  "../../controller/footwears/staff.controller"
);

const {
  checkApiAuth,
  requireFootwearAdmin,
} = require("../../middleware/check-auth");

router.use(checkApiAuth);

// List business workspaces for the Store ownership dropdown.
router.get(
  "/",
  requireFootwearAdmin("readAny"),
  businessController.list
);

// List staff belonging to a business.
router.get(
  "/:businessId/staff",
  requireFootwearAdmin("readAny"),
  staffController.list
);

// Create staff login and membership.
router.post(
  "/:businessId/staff",
  requireFootwearAdmin("createAny"),
  staffController.create
);

module.exports = router;