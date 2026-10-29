const express = require("express");
const router = express.Router();

const auditController = require("../../controller/footwears/audit.controller");
const auditLineController = require("../../controller/footwears/auditLine.controller");

// Audit CRUD
router.post("/", auditController.create);
router.get("/", auditController.list);
router.get("/:id", auditController.getById);
router.patch("/:id", auditController.update);
router.delete("/:id", auditController.remove);


// upload middleware
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

// Audit Lines CRUD (nested)
router.post("/:auditId/lines", auditLineController.create);
router.get("/:auditId/lines", auditLineController.list);
router.patch("/:auditId/lines/:lineId", auditLineController.update);
router.delete("/:auditId/lines/:lineId", auditLineController.remove);

router.post(
  "/:auditId/upload-lines",
  upload.single("file"),
  auditLineController.uploadExcel
);

// Workflow actions
router.post("/:id/submit", auditController.submit);
router.post("/:id/approve", auditController.approve);
router.post("/:id/lock", auditController.lock);

module.exports = router;
