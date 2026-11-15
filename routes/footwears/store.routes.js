const express = require("express");

const router = express.Router();

const storeController = require(
  "../../controller/footwears/store.controller"
);

const {
  checkApiAuth,
  requireFootwearAdmin,
} = require("../../middleware/check-auth");

router.use(checkApiAuth);

router.post(
  "/",
  requireFootwearAdmin("createAny"),
  storeController.create
);

router.get(
  "/",
  requireFootwearAdmin("readAny"),
  storeController.list
);

router.get(
  "/:id",
  requireFootwearAdmin("readAny"),
  storeController.getById
);

router.patch(
  "/:id",
  requireFootwearAdmin("updateAny"),
  storeController.update
);

router.delete(
  "/:id",
  requireFootwearAdmin("deleteAny"),
  storeController.remove
);

module.exports = router;