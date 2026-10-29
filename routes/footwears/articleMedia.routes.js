const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const ctrl = require("../../controller/footwears/articleMedia.controller");

const router = express.Router();

//
// UPLOAD DIRECTORY
//

const uploadDir = path.join(
  process.cwd(),
  "public",
  "uploads",
  "article-media"
);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

//
// STORAGE
//

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },

  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();

    const fileName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      ext;

    cb(null, fileName);
  },
});

//
// FILE FILTER
//

const fileFilter = (req, file, cb) => {
  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
  ];

  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only image files allowed"));
  }

  cb(null, true);
};

//
// MULTER
//

const upload = multer({
  storage,
  fileFilter,

  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 10,
  },
});

//
// MULTER ERROR WRAPPER
//

function uploadImagesMiddleware(req, res, next) {
  upload.array("images", 10)(req, res, function (err) {
    if (err) {
      return res.status(400).json({
        ok: false,
        message: "Upload failed",
        error: err.message,
      });
    }

    next();
  });
}

//
// ROUTES
//

router.post(
  "/upload",
  uploadImagesMiddleware,
  ctrl.uploadImages
);

router.get("/", ctrl.list);

router.post("/export-zip", ctrl.exportZip);

router.post("/export-catalogue-json", ctrl.exportCatalogueJson);

router.get("/:id", ctrl.getById);

router.patch(
  "/:mediaId/primary/:imageId",
  ctrl.setPrimary
);

router.delete(
  "/:mediaId/image/:imageId",
  ctrl.removeImage
);

router.patch(
  "/:mediaId/catalogue-visible",
  ctrl.toggleCatalogueVisible
);

router.delete("/:id", ctrl.remove);

module.exports = router;