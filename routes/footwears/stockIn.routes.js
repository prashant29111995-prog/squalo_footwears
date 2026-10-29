const express = require("express");
const router = express.Router();

const multer = require("multer");
const path = require("path");
const fs = require("fs");

const stockInCtrl = require("../../controller/footwears/stockIn.controller");

// ---------------- FILE UPLOAD SETUP ----------------

const uploadDir = path.join(process.cwd(), "uploads", "stock-in-bills");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },

  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
  fileFilter: function (req, file, cb) {
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/jpg",
      "image/webp",
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only PDF or image bill files are allowed"));
    }

    cb(null, true);
  },
});

function uploadSingleBillFile(req, res, next) {
  upload.single("billFile")(req, res, function (err) {
    if (err) {
      return res.status(400).json({
        ok: false,
        message: "File upload failed",
        error: err.message,
      });
    }

    next();
  });
}

// ---------------- BILL ATTACHMENT UPLOAD ----------------

// general attachment upload for create/edit bill
router.post(
  "/upload-attachment",
  uploadSingleBillFile,
  stockInCtrl.uploadAttachment
);

// upload and attach file directly to existing draft bill
router.post(
  "/:id/upload-attachment",
  uploadSingleBillFile,
  stockInCtrl.uploadAttachmentToBill
);

// ---------------- BILL SCAN / OCR ----------------

// upload bill PDF/image and save attachment path on draft bill
router.post(
  "/:id/upload-bill",
  uploadSingleBillFile,
  stockInCtrl.uploadBillFile
);

// scan uploaded bill file and return extracted preview lines
router.post("/:id/scan-bill", stockInCtrl.scanBill);

// import selected scanned lines into bill lines
router.post("/:id/import-scanned-lines", stockInCtrl.importScannedLines);

// article color history
router.get("/article-colors/:articleId", stockInCtrl.getArticleColors);

// ---------------- BILL HEADER ----------------

// create new stock-in bill
router.post("/", stockInCtrl.createBill);

// list stock-in bills
router.get("/", stockInCtrl.listBills);

// get single bill with lines
router.get("/:id", stockInCtrl.getBillById);

// update bill header only if draft
router.patch("/:id", stockInCtrl.updateBill);

// cancel bill
router.patch("/:id/cancel", stockInCtrl.cancelBill);

// confirm bill and post stock
router.patch("/:id/confirm", stockInCtrl.confirmBill);

// ---------------- BILL LINES ----------------

// list bill lines
router.get("/:id/lines", stockInCtrl.listBillLines);

// revert confirmed bill
router.patch("/:id/revert-confirmed", stockInCtrl.revertConfirmedBill);

// add one or multiple lines to a bill
router.post("/:id/lines", stockInCtrl.addBillLines);

// replace all lines of a bill
router.put("/:id/lines", stockInCtrl.replaceBillLines);

// update single line
router.patch("/:id/lines/:lineId", stockInCtrl.updateBillLine);

// delete single line
router.delete("/:id/lines/:lineId", stockInCtrl.deleteBillLine);

module.exports = router;