const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");

const Article = require("../../models/footwears/Article");
const ArticleMedia = require("../../models/footwears/ArticleMedia");


const AdmZip = require("adm-zip");

function cleanFileName(v) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function publicUrlToFilePath(url) {
  const cleanUrl = String(url || "").replace(/^\/+/, "");
  return path.join(process.cwd(), "public", cleanUrl.replace(/^public[\\/]/, ""));
}

function pickPrimaryImage(media) {
  const images = media?.images || [];
  return images.find((x) => x.isPrimary) || images[0] || null;
}

function isValidObjectId(v) {
  return mongoose.Types.ObjectId.isValid(v);
}

function safe(v) {
  return v === null || v === undefined ? "" : String(v);
}

function up(v) {
  return safe(v).trim().toUpperCase();
}

function fileUrl(file) {
  return `/uploads/article-media/${file.filename}`;
}

/**
 * POST /apis/footwears/article-media/upload
 * FormData:
 * - articleId
 * - color
 * - images[]
 */
exports.uploadImages = async (req, res) => {
  try {
    const articleId = String(req.body.articleId || "").trim();
    const color = up(req.body.color);

    if (!isValidObjectId(articleId)) {
      return res.status(400).json({
        ok: false,
        message: "Valid articleId required",
      });
    }

    if (!color) {
      return res.status(400).json({
        ok: false,
        message: "Color required",
      });
    }

    const files = req.files || [];

    if (!files.length) {
      return res.status(400).json({
        ok: false,
        message: "At least one image required",
      });
    }

    const article = await Article.findById(articleId).lean();

    if (!article) {
      return res.status(404).json({
        ok: false,
        message: "Article not found",
      });
    }

    const existing = await ArticleMedia.findOne({
      articleId,
      color,
    });

    const newImages = files.map((f, idx) => ({
      url: fileUrl(f),
      filename: f.filename,
      isPrimary: false,
      uploadedAt: new Date(),
      sortOrder: existing?.images?.length
        ? existing.images.length + idx
        : idx,
    }));

    if (!existing || !existing.images || existing.images.length === 0) {
      newImages[0].isPrimary = true;
    }

    const media = await ArticleMedia.findOneAndUpdate(
      { articleId, color },
      {
        $setOnInsert: {
          articleId,
          color,
          brand: up(article.brand),
          articleName: up(article.articleName || article.name),
          isCatalogueVisible: true,
        },
        $push: {
          images: {
            $each: newImages,
          },
        },
      },
      {
        new: true,
        upsert: true,
      }
    );

    return res.status(201).json({
      ok: true,
      message: "Images uploaded",
      data: media,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to upload images",
      error: err.message,
    });
  }
};

/**
 * GET /apis/footwears/article-media?articleId=&color=
 */
exports.list = async (req, res) => {
  try {
    const { articleId, color, brand, articleName, visible } = req.query;

    const filter = {};

    if (articleId) {
      if (!isValidObjectId(articleId)) {
        return res.status(400).json({
          ok: false,
          message: "Invalid articleId",
        });
      }

      filter.articleId = articleId;
    }

    if (color) filter.color = up(color);
    if (brand) filter.brand = up(brand);
    if (articleName) filter.articleName = new RegExp(safe(articleName), "i");

    if (visible !== undefined && visible !== "") {
      filter.isCatalogueVisible = String(visible) === "true";
    }

    const items = await ArticleMedia.find(filter)
      .sort({ brand: 1, articleName: 1, color: 1 })
      .populate("articleId", "brand articleName categoryGroup category")
      .lean();

    return res.json({
      ok: true,
      data: items,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch article media",
      error: err.message,
    });
  }
};


exports.exportZip = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    if (!items.length) {
      return res.status(400).json({
        ok: false,
        message: "No items selected for export",
      });
    }

    const normalized = items
      .map((x) => ({
        articleId: String(x.articleId || "").trim(),
        color: up(x.color),
        brand: up(x.brand),
        articleName: up(x.articleName),
        mrp: Number(x.mrp || 0),
        qty: Number(x.balanceQty || x.qty || 0),
      }))
      .filter((x) => isValidObjectId(x.articleId) && x.color);

    if (!normalized.length) {
      return res.status(400).json({
        ok: false,
        message: "No valid items found for export",
      });
    }

    const mediaRows = await ArticleMedia.find({
      $or: normalized.map((x) => ({
        articleId: new mongoose.Types.ObjectId(x.articleId),
        color: x.color,
        isCatalogueVisible: true,
      })),
    }).lean();

    const mediaMap = new Map();

    mediaRows.forEach((m) => {
      mediaMap.set(`${String(m.articleId)}_${up(m.color)}`, m);
    });

    const zip = new AdmZip();
    let added = 0;
    const missing = [];

    normalized.forEach((item, index) => {
      const media = mediaMap.get(`${item.articleId}_${item.color}`);
      const img = pickPrimaryImage(media);

      if (!img?.url) {
        missing.push(item);
        return;
      }

      const filePath = publicUrlToFilePath(img.url);

      if (!fs.existsSync(filePath)) {
        missing.push(item);
        return;
      }

      const ext = path.extname(filePath) || ".jpg";

      const fileName =
        [
          String(index + 1).padStart(3, "0"),
          cleanFileName(item.brand),
          cleanFileName(item.articleName),
          cleanFileName(item.color),
          `MRP${item.mrp}`,
          `QTY${item.qty}`,
        ].join("_") + ext;

      zip.addLocalFile(filePath, "", fileName);
      added++;
    });

    zip.addFile(
      "manifest.json",
      Buffer.from(
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            totalSelected: normalized.length,
            imagesAdded: added,
            missingImages: missing,
          },
          null,
          2
        )
      )
    );

    const zipBuffer = zip.toBuffer();

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="squalo-catalogue-images-${Date.now()}.zip"`
    );

    return res.send(zipBuffer);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to export images",
      error: err.message,
    });
  }
};

exports.exportCatalogueJson = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    const normalized = items
      .map((x) => ({
        articleId: String(x.articleId || "").trim(),
        color: up(x.color),
        brand: up(x.brand),
        articleName: up(x.articleName),
        categoryGroup: up(x.categoryGroup),
        category: up(x.category),
        mrp: Number(x.mrp || 0),
        qty: Number(x.balanceQty || x.qty || 0),
      }))
      .filter((x) => isValidObjectId(x.articleId) && x.color);

    const mediaRows = await ArticleMedia.find({
      $or: normalized.map((x) => ({
        articleId: new mongoose.Types.ObjectId(x.articleId),
        color: x.color,
        isCatalogueVisible: true,
      })),
    }).lean();

    const mediaMap = new Map();

    mediaRows.forEach((m) => {
      mediaMap.set(`${String(m.articleId)}_${up(m.color)}`, m);
    });

    const catalogue = normalized.map((item) => {
      const media = mediaMap.get(`${item.articleId}_${item.color}`);
      const img = pickPrimaryImage(media);

     return {
  ...item,
  mediaId: media?._id || "",
  imageUrl: img?.url || "",
  imageCount: media?.images?.length || 0,
  hasImage: Boolean(img?.url),
};
    });

    return res.json({
      ok: true,
      data: catalogue,
      meta: {
        total: catalogue.length,
        withImages: catalogue.filter((x) => x.hasImage).length,
        withoutImages: catalogue.filter((x) => !x.hasImage).length,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to export catalogue data",
      error: err.message,
    });
  }
};

/**
 * GET /apis/footwears/article-media/:id
 */
exports.getById = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid media id",
      });
    }

    const item = await ArticleMedia.findById(id)
      .populate("articleId", "brand articleName categoryGroup category")
      .lean();

    if (!item) {
      return res.status(404).json({
        ok: false,
        message: "Article media not found",
      });
    }

    return res.json({
      ok: true,
      data: item,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch article media",
      error: err.message,
    });
  }
};

/**
 * PATCH /apis/footwears/article-media/:mediaId/primary/:imageId
 */
exports.setPrimary = async (req, res) => {
  try {
    const { mediaId, imageId } = req.params;

    if (!isValidObjectId(mediaId) || !isValidObjectId(imageId)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid id",
      });
    }

    const media = await ArticleMedia.findById(mediaId);

    if (!media) {
      return res.status(404).json({
        ok: false,
        message: "Article media not found",
      });
    }

    let found = false;

    media.images.forEach((img) => {
      const isTarget = String(img._id) === String(imageId);
      img.isPrimary = isTarget;
      if (isTarget) found = true;
    });

    if (!found) {
      return res.status(404).json({
        ok: false,
        message: "Image not found",
      });
    }

    await media.save();

    return res.json({
      ok: true,
      message: "Primary image updated",
      data: media,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to set primary image",
      error: err.message,
    });
  }
};

/**
 * DELETE /apis/footwears/article-media/:mediaId/image/:imageId
 */
exports.removeImage = async (req, res) => {
  try {
    const { mediaId, imageId } = req.params;

    if (!isValidObjectId(mediaId) || !isValidObjectId(imageId)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid id",
      });
    }

    const media = await ArticleMedia.findById(mediaId);

    if (!media) {
      return res.status(404).json({
        ok: false,
        message: "Article media not found",
      });
    }

    const img = media.images.id(imageId);

    if (!img) {
      return res.status(404).json({
        ok: false,
        message: "Image not found",
      });
    }

    const wasPrimary = img.isPrimary;

    img.remove();

    if (wasPrimary && media.images.length > 0) {
      media.images[0].isPrimary = true;
    }

    await media.save();

    return res.json({
      ok: true,
      message: "Image removed",
      data: media,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to remove image",
      error: err.message,
    });
  }
};

/**
 * PATCH /apis/footwears/article-media/:mediaId/catalogue-visible
 * body: { isCatalogueVisible: true/false }
 */
exports.toggleCatalogueVisible = async (req, res) => {
  try {
    const mediaId = String(req.params.mediaId || "").trim();

    if (!isValidObjectId(mediaId)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid media id",
      });
    }

    const media = await ArticleMedia.findById(mediaId);

    if (!media) {
      return res.status(404).json({
        ok: false,
        message: "Article media not found",
      });
    }

    media.isCatalogueVisible =
      req.body.isCatalogueVisible !== undefined
        ? Boolean(req.body.isCatalogueVisible)
        : !media.isCatalogueVisible;

    await media.save();

    return res.json({
      ok: true,
      message: "Catalogue visibility updated",
      data: media,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to update visibility",
      error: err.message,
    });
  }
};

/**
 * DELETE /apis/footwears/article-media/:id
 */
exports.remove = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid media id",
      });
    }

    const deleted = await ArticleMedia.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        ok: false,
        message: "Article media not found",
      });
    }

    return res.json({
      ok: true,
      message: "Article media deleted",
      data: deleted,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to delete article media",
      error: err.message,
    });
  }
};