//-------------------------------------------- Stock In controller----------------------------------------------------------------------

const mongoose = require("mongoose");

const StockInBill = require("../../models/footwears/StockInBill");
const StockInBillLine = require("../../models/footwears/StockInBillLine");
const Party = require("../../models/footwears/Party");
const Tesseract = require("tesseract.js");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const StockLedger = require("../../models/footwears/StockLedger");
const Article = require("../../models/footwears/Article");
const Jimp = require("jimp");
const { spawn } = require("child_process");
const path = require("path");




const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const up = (s) => String(s || "").trim().toUpperCase();
const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

function isPdf(filePath) {
  return String(filePath || "").toLowerCase().endsWith(".pdf");
}

function isImage(filePath) {
  return /\.(jpg|jpeg|png|webp)$/i.test(String(filePath || ""));
}

function runOCRInChildProcess(filePath) {
  return new Promise((resolve, reject) => {
    // IMPORTANT:
    // You wrote util/ocr, so keep this path if your folder is /util/ocr/runOcr.js
    const scriptPath = path.join(__dirname, "../../util/ocr/runOcr.js");

    const child = spawn(
      "node",
      ["--max-old-space-size=1024", scriptPath, filePath],
      {
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let output = "";
    let errorOutput = "";
    let settled = false;

    const finishReject = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    const finishResolve = (text) => {
      if (settled) return;
      settled = true;
      resolve(text);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finishReject(new Error("OCR timeout"));
    }, 180000);

    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      finishReject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      try {
        const match = output.match(
          /__OCR_JSON_START__\s*([\s\S]*?)\s*__OCR_JSON_END__/
        );

        if (!match) {
          console.error("OCR CHILD EXIT CODE:", code);
          console.error("OCR CHILD STDOUT:", output);
          console.error("OCR CHILD STDERR:", errorOutput);

          return finishReject(new Error("Invalid OCR response"));
        }

        const json = JSON.parse(match[1]);

        if (!json.ok) {
          return finishReject(new Error(json.error || "OCR failed"));
        }

        return finishResolve(json.text || "");
      } catch (err) {
        console.error("OCR PARSE ERROR:", err.message);
        console.error("OCR CHILD STDOUT:", output);
        console.error("OCR CHILD STDERR:", errorOutput);

        return finishReject(new Error("Invalid OCR response"));
      }
    });
  });
}

async function prepareImageForOCR(inputPath) {
  const ext = path.extname(inputPath);
  const outputPath = inputPath.replace(ext, "-table-ocr.jpg");

  const image = await Jimp.read(inputPath);

  console.log("OCR IMAGE META:", {
    width: image.bitmap.width,
    height: image.bitmap.height,
  });

  const width = image.bitmap.width;
  const height = image.bitmap.height;

  const cropTop = Math.floor(height * 0.37);
  const cropHeight = Math.floor(height * 0.36);

  image
    .crop(0, cropTop, width, cropHeight)
    .resize(900, Jimp.AUTO)
    .greyscale()
    .contrast(0.2)
    .quality(70);

  await image.writeAsync(outputPath);

  console.log("OCR TABLE IMAGE CREATED:", outputPath);

  return outputPath;
}

async function runOCR(imagePath) {
  const worker = Tesseract.createWorker({
    logger: (m) => {
      if (m.status) console.log("OCR:", m.status, m.progress || "");
    },
  });

  try {
    await worker.load();
    await worker.loadLanguage("eng");
    await worker.initialize("eng");

    const result = await worker.recognize(imagePath);

    return result.data.text || "";
  } finally {
    await worker.terminate();
  }
}

async function recalcBillTotals(billId, session = null) {
  const rows = await StockInBillLine.aggregate([
    { $match: { billId: new mongoose.Types.ObjectId(String(billId)) } },
    {
      $group: {
        _id: null,
        totalQty: { $sum: "$qty" },
        totalLines: { $sum: 1 },
      },
    },
  ]).session(session || null);

  const totalQty = rows[0]?.totalQty || 0;
  const totalLines = rows[0]?.totalLines || 0;

  await StockInBill.findByIdAndUpdate(
    billId,
    { totalQty, totalLines },
    { session }
  );

  return { totalQty, totalLines };
}

async function getSupplierSnapshot(supplierId) {
  const supplier = await Party.findById(supplierId).lean();
  if (!supplier) {
    throw new Error("Supplier not found");
  }

  if (!["SUPPLIER", "BOTH"].includes(String(supplier.partyType || ""))) {
    throw new Error("Selected party is not a supplier");
  }

  if (supplier.isActive === false) {
    throw new Error("Selected supplier is inactive");
  }

  return supplier;
}

function normalizeLine(line, lineNo) {
  const articleId = line.articleId || null;
  const articleName = up(line.articleName);
  const brand = up(line.brand);
  const color = up(line.color);

  const qty = num(line.qty, NaN);
  const mrp = num(line.mrp, NaN);
  const discountPercent = num(line.discountPercent, 0);

  const remarks = String(line.remarks || "").trim();

  if (!articleId || !isValidObjectId(articleId)) {
    throw new Error(`Invalid articleId at line ${lineNo}`);
  }

  if (!articleName) {
    throw new Error(`articleName required at line ${lineNo}`);
  }

  if (!brand) {
    throw new Error(`brand required at line ${lineNo}`);
  }

  if (!color) {
    throw new Error(`color required at line ${lineNo}`);
  }

  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error(`Valid qty required at line ${lineNo}`);
  }

  if (!Number.isFinite(mrp) || mrp <= 0) {
    throw new Error(`Valid MRP required at line ${lineNo}`);
  }

  if (
    !Number.isFinite(discountPercent) ||
    discountPercent < 0 ||
    discountPercent > 100
  ) {
    throw new Error(`Valid discountPercent required at line ${lineNo}`);
  }

  const cost = Number((mrp - (mrp * discountPercent) / 100).toFixed(2));
  const amount = Number((qty * cost).toFixed(2));

  return {
    lineNo,
    articleId,
    articleName,
    brand,
    color,
    qty,
    mrp,
    discountPercent,
    cost,
    amount,
    remarks,
  };
}
// ---------------- BILL HEADER ----------------

exports.createBill = async (req, res) => {
  try {
    console.log("controller called")
    const supplierId = req.body.supplierId;
    const billNo = up(req.body.billNo);
    const billDate = req.body.billDate;
    const storeId = req.body.storeId || null;
    const attachment = String(req.body.attachment || "").trim();

    if (!supplierId || !isValidObjectId(supplierId)) {
      return res.status(400).json({ ok: false, message: "Valid supplierId required" });
    }

    if (!billNo) {
      return res.status(400).json({ ok: false, message: "billNo required" });
    }

    if (!billDate) {
      return res.status(400).json({ ok: false, message: "billDate required" });
    }

    if (!storeId || !isValidObjectId(storeId)) {
      return res.status(400).json({ ok: false, message: "Valid storeId required" });
    }

    const supplier = await getSupplierSnapshot(supplierId);

    const exists = await StockInBill.findOne({
      supplierId,
      billNo,
    }).lean();

    if (exists) {
      return res.status(400).json({
        ok: false,
        message: "Bill number already exists for this supplier",
      });
    }

    const bill = await StockInBill.create({
      supplierId,
      supplierName: up(supplier.name),
      billNo,
      billDate,
      storeId,
      attachment,
      status: "DRAFT",
      totalQty: 0,
      totalLines: 0,
    });

    return res.status(201).json({ ok: true, data: bill });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to create stock-in bill",
      error: err.message,
    });
  }
};

exports.listBills = async (req, res) => {
  try {
    const {
      q,
      status,
      supplierId,
      storeId,
      from,
      to,
      limit = 50,
    } = req.query;

    const filter = {};

    if (status) filter.status = up(status);
    if (supplierId && isValidObjectId(supplierId)) filter.supplierId = supplierId;
    if (storeId && isValidObjectId(storeId)) filter.storeId = storeId;

    if (from || to) {
      filter.billDate = {};
      if (from) filter.billDate.$gte = new Date(from);
      if (to) filter.billDate.$lte = new Date(to);
    }

    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim(), "i");
      filter.$or = [{ billNo: rx }, { supplierName: rx }];
    }

    const bills = await StockInBill.find(filter)
      .sort({ billDate: -1, createdAt: -1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .lean();

    const billIds = bills.map((b) => b._id);

    const lineAgg = await StockInBillLine.aggregate([
      {
        $match: {
          billId: { $in: billIds },
        },
      },
      {
        $group: {
          _id: "$billId",
          totalQty: { $sum: "$qty" },
          totalLines: { $sum: 1 },
          totalAmount: {
            $sum: {
              $multiply: [
                { $ifNull: ["$qty", 0] },
                {
                  $ifNull: [
                    "$cost",
                    {
                      $ifNull: [
                        "$rate",
                        {
                          $ifNull: ["$purchaseCost", 0],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    ]);

    const lineMap = new Map(
      lineAgg.map((x) => [
        String(x._id),
        {
          totalQty: Number(x.totalQty || 0),
          totalLines: Number(x.totalLines || 0),
          totalAmount: Number(x.totalAmount || 0),
        },
      ])
    );

    const items = bills.map((b) => {
      const lineTotals = lineMap.get(String(b._id)) || {
        totalQty: 0,
        totalLines: 0,
        totalAmount: 0,
      };

      const totalAmount =
        Number(
          b.totalAmount ||
            b.billAmount ||
            b.amount ||
            b.totals?.netTotal ||
            b.totals?.subTotal ||
            b.totals?.purchaseTotal ||
            0
        ) || lineTotals.totalAmount;

      return {
        ...b,
        totalQty: Number(b.totalQty || b.totals?.qtyTotal || 0) || lineTotals.totalQty,
        totalLines: Number(b.totalLines || 0) || lineTotals.totalLines,
        totalAmount,
      };
    });

    return res.json({ ok: true, data: items });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to list stock-in bills",
      error: err.message,
    });
  }
};

exports.getBillById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid bill id" });
    }

    const bill = await StockInBill.findById(id).lean();
    if (!bill) {
      return res.status(404).json({ ok: false, message: "Stock-in bill not found" });
    }

    const lines = await StockInBillLine.find({ billId: id })
      .sort({ lineNo: 1, createdAt: 1 })
      .lean();

    return res.json({
      ok: true,
      data: {
        ...bill,
        lines,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to get stock-in bill",
      error: err.message,
    });
  }
};

exports.updateBill = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid bill id" });
    }

    const bill = await StockInBill.findById(id);
    if (!bill) {
      return res.status(404).json({ ok: false, message: "Stock-in bill not found" });
    }

    if (bill.status !== "DRAFT") {
      return res.status(400).json({
        ok: false,
        message: "Only draft bills can be updated",
      });
    }

    if (req.body.supplierId !== undefined) {
      if (!isValidObjectId(req.body.supplierId)) {
        return res.status(400).json({ ok: false, message: "Valid supplierId required" });
      }

      const supplier = await getSupplierSnapshot(req.body.supplierId);
      bill.supplierId = req.body.supplierId;
      bill.supplierName = up(supplier.name);
    }

    if (req.body.billNo !== undefined) {
      const nextBillNo = up(req.body.billNo);
      if (!nextBillNo) {
        return res.status(400).json({ ok: false, message: "billNo required" });
      }

      const duplicate = await StockInBill.findOne({
        _id: { $ne: bill._id },
        supplierId: bill.supplierId,
        billNo: nextBillNo,
      }).lean();

      if (duplicate) {
        return res.status(400).json({
          ok: false,
          message: "Bill number already exists for this supplier",
        });
      }

      bill.billNo = nextBillNo;
    }

    if (req.body.billDate !== undefined) {
      if (!req.body.billDate) {
        return res.status(400).json({ ok: false, message: "billDate required" });
      }
      bill.billDate = req.body.billDate;
    }

    if (req.body.storeId !== undefined) {
      if (!req.body.storeId || !isValidObjectId(req.body.storeId)) {
        return res.status(400).json({ ok: false, message: "Valid storeId required" });
      }
      bill.storeId = req.body.storeId;
    }

    if (req.body.attachment !== undefined) {
      bill.attachment = String(req.body.attachment || "").trim();
    }

    await bill.save();

    return res.json({ ok: true, data: bill });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to update stock-in bill",
      error: err.message,
    });
  }
};

exports.cancelBill = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid bill id" });
    }

    const bill = await StockInBill.findById(id);
    if (!bill) {
      return res.status(404).json({ ok: false, message: "Stock-in bill not found" });
    }

    if (bill.status === "CONFIRMED") {
      return res.status(400).json({
        ok: false,
        message: "Confirmed bill cannot be cancelled directly",
      });
    }

    if (bill.status === "CANCELLED") {
      return res.json({ ok: true, data: bill, message: "Bill already cancelled" });
    }

    bill.status = "CANCELLED";
    bill.cancelledAt = new Date();
    bill.cancelledBy = req.user?._id || null;

    await bill.save();

    return res.json({ ok: true, data: bill, message: "Bill cancelled" });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to cancel stock-in bill",
      error: err.message,
    });
  }
};

exports.confirmBill = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid bill id" });
    }

    let responsePayload = null;

    await session.withTransaction(async () => {
      const bill = await StockInBill.findById(id).session(session);

      if (!bill) {
        throw new Error("Stock-in bill not found");
      }

      if (bill.status === "CANCELLED") {
        throw new Error("Cancelled bill cannot be confirmed");
      }

      if (bill.status === "CONFIRMED") {
        responsePayload = {
          ok: true,
          data: bill,
          message: "Bill already confirmed",
        };
        return;
      }

      const lines = await StockInBillLine.find({ billId: bill._id })
        .sort({ lineNo: 1 })
        .session(session)
        .lean();

      if (!lines.length) {
        throw new Error("Cannot confirm bill without lines");
      }

      const ledgerEntries = [];
      let totalQty = 0;

      for (const line of lines) {
        const articleId = line.articleId;
        const articleName = up(line.articleName);
        const brand = up(line.brand);
        const color = up(line.color);
        const qty = Number(line.qty || 0);

        if (!articleId || !isValidObjectId(articleId)) {
          throw new Error(`Invalid articleId in line ${line.lineNo}`);
        }

        if (!qty || qty <= 0) {
          throw new Error(`Invalid qty in line ${line.lineNo}`);
        }

        const article = await Article.findById(articleId).session(session).lean();

        if (!article) {
          throw new Error(`Article not found for line ${line.lineNo}`);
        }

        ledgerEntries.push({
          storeId: bill.storeId,
          articleId,
          articleName,
          brand,
          color,
          txnType: "PURCHASE_IN",
          qtyDelta: qty,
          mrp: Number(line.mrp || 0),
          cost: Number(line.cost || 0),
          purchaseDiscountPercent: Number(line.discountPercent || 0),

          // For now 0. Later we can update this after Stock model is added.
          balanceAfter: 0,

          ref: {
            stockInBillId: bill._id,
            documentNo: bill.billNo,
            note: `Stock in from supplier ${bill.supplierName}`,
          },

          txnAt: bill.billDate,
          createdBy: req.user?._id || null,
        });

        totalQty += qty;
      }

      if (ledgerEntries.length) {
        await StockLedger.insertMany(ledgerEntries, {
          ordered: true,
          session,
        });
      }

      bill.totalQty = totalQty;
      bill.totalLines = lines.length;
      bill.status = "CONFIRMED";
      bill.confirmedAt = new Date();
      bill.confirmedBy = req.user?._id || null;

      await bill.save({ session });

      responsePayload = {
        ok: true,
        message: "Bill confirmed and ledger updated",
        data: {
          billId: bill._id,
          totalLines: lines.length,
          totalQty,
          ledgerEntries: ledgerEntries.length,
        },
      };
    });

    return res.json(responsePayload);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to confirm stock-in bill",
      error: err.message,
    });
  } finally {
    session.endSession();
  }
};
// ---------------- BILL LINES ----------------

exports.listBillLines = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid bill id" });
    }

    const bill = await StockInBill.findById(id).lean();
    if (!bill) {
      return res.status(404).json({ ok: false, message: "Stock-in bill not found" });
    }

    const items = await StockInBillLine.find({ billId: id })
      .sort({ lineNo: 1, createdAt: 1 })
      .lean();

    return res.json({ ok: true, data: items });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to list stock-in bill lines",
      error: err.message,
    });
  }
};

exports.addBillLines = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid bill id" });
    }

    session.startTransaction();

    const bill = await StockInBill.findById(id).session(session);
    if (!bill) {
      await session.abortTransaction();
      return res.status(404).json({ ok: false, message: "Stock-in bill not found" });
    }

    if (bill.status !== "DRAFT") {
      await session.abortTransaction();
      return res.status(400).json({
        ok: false,
        message: "Lines can be added only in draft bills",
      });
    }

    const inputLines = Array.isArray(req.body.lines) ? req.body.lines : [];
    if (!inputLines.length) {
      await session.abortTransaction();
      return res.status(400).json({ ok: false, message: "lines array required" });
    }

    const lastLine = await StockInBillLine.findOne({ billId: id })
      .sort({ lineNo: -1 })
      .session(session)
      .lean();

    let nextLineNo = (lastLine?.lineNo || 0) + 1;

    const docs = inputLines.map((line) => {
      const normalized = normalizeLine(line, nextLineNo);
      nextLineNo += 1;
      return {
        billId: id,
        ...normalized,
      };
    });
    for (const doc of docs) {
  const existing = await StockInBillLine.findOne({
    billId: id,
    articleId: doc.articleId,
    color: doc.color,
    mrp: doc.mrp,
    cost: doc.cost,
  }).session(session);

  if (existing) {
    existing.qty = Number(existing.qty || 0) + Number(doc.qty || 0);
    existing.amount = Number((existing.qty * existing.cost).toFixed(2));

    if (doc.remarks) {
      existing.remarks = existing.remarks
        ? `${existing.remarks} | ${doc.remarks}`
        : doc.remarks;
    }

    await existing.save({ session });
  } else {
    await StockInBillLine.create([doc], { session });
  }
}

    await recalcBillTotals(id, session);

    await session.commitTransaction();

    const items = await StockInBillLine.find({ billId: id })
      .sort({ lineNo: 1 })
      .lean();

    return res.status(201).json({
      ok: true,
      data: items,
      message: "Lines added successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    return res.status(500).json({
      ok: false,
      message: "Failed to add bill lines",
      error: err.message,
    });
  } finally {
    session.endSession();
  }
};

exports.replaceBillLines = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid bill id" });
    }

    session.startTransaction();

    const bill = await StockInBill.findById(id).session(session);
    if (!bill) {
      await session.abortTransaction();
      return res.status(404).json({ ok: false, message: "Stock-in bill not found" });
    }

    if (bill.status !== "DRAFT") {
      await session.abortTransaction();
      return res.status(400).json({
        ok: false,
        message: "Lines can be replaced only in draft bills",
      });
    }

    const inputLines = Array.isArray(req.body.lines) ? req.body.lines : [];
    if (!inputLines.length) {
      await session.abortTransaction();
      return res.status(400).json({ ok: false, message: "lines array required" });
    }

    const docs = inputLines.map((line, idx) => ({
      billId: id,
      ...normalizeLine(line, idx + 1),
    }));

    await StockInBillLine.deleteMany({ billId: id }, { session });
    await StockInBillLine.insertMany(docs, { session });

    await recalcBillTotals(id, session);

    await session.commitTransaction();

    const items = await StockInBillLine.find({ billId: id })
      .sort({ lineNo: 1 })
      .lean();

    return res.json({
      ok: true,
      data: items,
      message: "Lines replaced successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    return res.status(500).json({
      ok: false,
      message: "Failed to replace bill lines",
      error: err.message,
    });
  } finally {
    session.endSession();
  }
};

exports.updateBillLine = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id, lineId } = req.params;

    if (!isValidObjectId(id) || !isValidObjectId(lineId)) {
      return res.status(400).json({ ok: false, message: "Invalid id" });
    }

    session.startTransaction();

    const bill = await StockInBill.findById(id).session(session);
    if (!bill) {
      await session.abortTransaction();
      return res.status(404).json({ ok: false, message: "Stock-in bill not found" });
    }

    if (bill.status !== "DRAFT") {
      await session.abortTransaction();
      return res.status(400).json({
        ok: false,
        message: "Only draft bill lines can be updated",
      });
    }

    const line = await StockInBillLine.findOne({
      _id: lineId,
      billId: id,
    }).session(session);

    if (!line) {
      await session.abortTransaction();
      return res.status(404).json({ ok: false, message: "Bill line not found" });
    }

    if (req.body.articleId !== undefined) {
      if (!isValidObjectId(req.body.articleId)) {
        await session.abortTransaction();
        return res.status(400).json({ ok: false, message: "Valid articleId required" });
      }
      line.articleId = req.body.articleId;
    }

    if (req.body.articleName !== undefined) line.articleName = up(req.body.articleName);
    if (req.body.brand !== undefined) line.brand = up(req.body.brand);
    if (req.body.color !== undefined) line.color = up(req.body.color);

    if (req.body.qty !== undefined) {
      const qty = num(req.body.qty, NaN);
      if (!Number.isFinite(qty) || qty <= 0) {
        await session.abortTransaction();
        return res.status(400).json({ ok: false, message: "Valid qty required" });
      }
      line.qty = qty;
    }

    if (req.body.mrp !== undefined) {
      const mrp = num(req.body.mrp, NaN);
      if (!Number.isFinite(mrp) || mrp <= 0) {
        await session.abortTransaction();
        return res.status(400).json({ ok: false, message: "Valid MRP required" });
      }
      line.mrp = mrp;
    }

    if (req.body.discountPercent !== undefined) {
      const discountPercent = num(req.body.discountPercent, NaN);
      if (
        !Number.isFinite(discountPercent) ||
        discountPercent < 0 ||
        discountPercent > 100
      ) {
        await session.abortTransaction();
        return res.status(400).json({
          ok: false,
          message: "Discount must be between 0 and 100",
        });
      }
      line.discountPercent = discountPercent;
    }

    if (req.body.remarks !== undefined) {
      line.remarks = String(req.body.remarks || "").trim();
    }

    const mrp = Number(line.mrp || 0);
    const discountPercent = Number(line.discountPercent || 0);
    const qty = Number(line.qty || 0);

    line.cost = Number((mrp - (mrp * discountPercent) / 100).toFixed(2));
    line.amount = Number((qty * line.cost).toFixed(2));

    await line.save({ session });
    await recalcBillTotals(id, session);

    await session.commitTransaction();

    return res.json({
      ok: true,
      data: line,
      message: "Bill line updated successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    return res.status(500).json({
      ok: false,
      message: "Failed to update bill line",
      error: err.message,
    });
  } finally {
    session.endSession();
  }
};

exports.deleteBillLine = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id, lineId } = req.params;

    if (!isValidObjectId(id) || !isValidObjectId(lineId)) {
      return res.status(400).json({ ok: false, message: "Invalid id" });
    }

    session.startTransaction();

    const bill = await StockInBill.findById(id).session(session);
    if (!bill) {
      await session.abortTransaction();
      return res.status(404).json({ ok: false, message: "Stock-in bill not found" });
    }

    if (bill.status !== "DRAFT") {
      await session.abortTransaction();
      return res.status(400).json({
        ok: false,
        message: "Only draft bill lines can be deleted",
      });
    }

    const deleted = await StockInBillLine.findOneAndDelete(
      { _id: lineId, billId: id },
      { session }
    );

    if (!deleted) {
      await session.abortTransaction();
      return res.status(404).json({ ok: false, message: "Bill line not found" });
    }

    await recalcBillTotals(id, session);

    await session.commitTransaction();

    return res.json({
      ok: true,
      message: "Bill line deleted successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    return res.status(500).json({
      ok: false,
      message: "Failed to delete bill line",
      error: err.message,
    });
  } finally {
    session.endSession();
  }
};

exports.getArticleColors = async (req, res) => {
  try {
    const { articleId } = req.params;

    if (!articleId || !isValidObjectId(articleId)) {
      return res.status(400).json({
        ok: false,
        message: "Valid articleId required",
      });
    }

    const objectArticleId = new mongoose.Types.ObjectId(String(articleId));

    const article = await Article.findById(objectArticleId).lean();

    if (!article) {
      return res.status(404).json({
        ok: false,
        message: "Article not found",
      });
    }

    const billLineColors = await StockInBillLine.distinct("color", {
      articleId: objectArticleId,
      color: { $exists: true, $ne: "" },
    });

    const ledgerColors = await StockLedger.distinct("color", {
      articleId: objectArticleId,
      color: { $exists: true, $ne: "" },
    });

    const colors = [
      ...new Set(
        [...billLineColors, ...ledgerColors]
          .map((c) => up(c))
          .filter(Boolean)
      ),
    ].sort();

    return res.json({
      ok: true,
      data: colors,
      meta: {
        articleId,
        articleName: article.articleName,
        brand: article.brand,
        totalColors: colors.length,
        source: "StockInBillLine + StockLedger",
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch article colors",
      error: err.message,
    });
  }
};


exports.uploadBillFile = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid bill id",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: "No file uploaded",
      });
    }

    const bill = await StockInBill.findById(id);

    if (!bill) {
      return res.status(404).json({
        ok: false,
        message: "Bill not found",
      });
    }

    if (bill.status !== "DRAFT") {
      return res.status(400).json({
        ok: false,
        message: "Only draft bill can be updated",
      });
    }

    bill.attachment = req.file.path;
    await bill.save();

    return res.json({
      ok: true,
      message: "Bill file uploaded",
      data: {
        file: req.file.path,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Upload failed",
      error: err.message,
    });
  }
};
function parseIndusBillText(text) {
  const rawText = String(text || "")
    .replace(/\|/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[’‘]/g, "'");

  const rows = rawText
    .split(/\n+/)
    .map((x) => x.trim().replace(/\s+/g, " "))
    .filter(Boolean);

  const parsed = [];

  for (const row of rows) {
    const cleaned = row.replace(/\s+/g, " ");

    // Detect product anywhere in row:
    // supports:
    // IN-33177-BLUSH-5X8
    // 1|IN-33177-BLUSH-5X8
    // 1 IN-33177-BLUSH-5X8 640219 1 Ctn 36 Pair 299.00 ...
    const descriptionMatch = cleaned.match(/IN-[A-Z0-9]+(?:-[A-Z0-9]+)+/i);

    if (!descriptionMatch) continue;

    const description = descriptionMatch[0].toUpperCase();

    const parsedDesc = parseIndusDescription(description);

    // Try quantity from "36 Pair"
    let qty = 0;
    const qtyMatch = cleaned.match(/(\d+)\s*Pair/i);
    if (qtyMatch) {
      qty = Number(qtyMatch[1]) || 0;
    }

    // Extract all numbers from row
    const nums = cleaned.match(/\d+(?:\.\d+)?/g) || [];
    const numbers = nums.map(Number).filter((n) => Number.isFinite(n));

    let mrp = 0;
    let disc1 = 0;
    let tradeDisc = 0;
    let cost = 0;
    let amount = 0;
    let discountPercent = 0;

    /*
      Expected Indus row structure:
      HSN  AltQty  Qty  MRP  Per  Disc%  TradeDisc%  Rate  Amount

      Example:
      640219 1 Ctn 36 Pair 299.00 Pair 38 % 10 % 166.84 6006.31
    */

    // MRP: usually first decimal/number between 100 and 5000 after description
    const mrpCandidates = numbers.filter((n) => n >= 100 && n <= 5000);

    if (mrpCandidates.length) {
      // avoid HSN 640219 and invoice/date numbers by choosing likely MRP range
      mrp = mrpCandidates.find((n) => n <= 2000) || 0;
    }

    // Quantity fallback: choose common pair quantity if OCR missed "Pair"
    if (!qty) {
      const possibleQty = numbers.find((n) => [24, 30, 36, 48, 60, 72, 96].includes(n));
      qty = possibleQty || 0;
    }

    // Cost/rate and amount usually last 2 decimal numbers
    const decimalNumbers = (cleaned.match(/\d+\.\d+/g) || []).map(Number);

    if (decimalNumbers.length >= 2) {
      amount = decimalNumbers[decimalNumbers.length - 1] || 0;
      cost = decimalNumbers[decimalNumbers.length - 2] || 0;
    }

    // If cost not found, calculate from mrp and known discounts if present
    const percentMatches = cleaned.match(/(\d+(?:\.\d+)?)\s*%/g) || [];
    const percents = percentMatches
      .map((p) => Number(String(p).replace("%", "").trim()))
      .filter((n) => Number.isFinite(n));

    if (percents.length) {
      disc1 = percents[0] || 0;
      tradeDisc = percents[1] || 0;
    } else {
      // Fallback for Indus OCR rows where "%" is not read properly
      // common values in your bill: 38, 45, 10
      const possiblePercents = numbers.filter((n) => n > 0 && n <= 80);
      disc1 = possiblePercents.find((n) => n === 38 || n === 45) || 0;
      tradeDisc = possiblePercents.find((n) => n === 10) || 0;
    }

    // Combined discount from MRP to final cost
    if (mrp && cost) {
      discountPercent = Number((((mrp - cost) / mrp) * 100).toFixed(2));
    } else if (mrp && (disc1 || tradeDisc)) {
      const afterDisc1 = mrp - (mrp * disc1) / 100;
      const afterTrade = afterDisc1 - (afterDisc1 * tradeDisc) / 100;

      cost = Number(afterTrade.toFixed(2));
      discountPercent = Number((((mrp - cost) / mrp) * 100).toFixed(2));

      if (qty) {
        amount = Number((qty * cost).toFixed(2));
      }
    }

    parsed.push({
      brand: "INDUS",
      articleName: parsedDesc.articleName,
      color: parsedDesc.color,
      qty,
      mrp,
      discountPercent,
      cost,
      amount,
      remarks: parsedDesc.remarks,
      raw: cleaned,
    });
  }

  console.log("PARSED ITEMS:", parsed.length);
  console.log(parsed);

  return parsed.filter((x) => x.articleName && x.color);
}

function parseIndusDescription(description) {
  const raw = up(description).replace(/^IN-/, "");
  const parts = raw.split("-").filter(Boolean);

  const last = parts[parts.length - 1] || "";
  const secondLast = parts[parts.length - 2] || "";

  const sizeSetPattern = /^\d+\s*X\s*\d+$/i;

  let set = "";
  let color = "";
  let articleParts = [];

  if (sizeSetPattern.test(last)) {
    set = last;
    color = secondLast;
    articleParts = parts.slice(0, -2);
  } else {
    color = last;
    articleParts = parts.slice(0, -1);
  }

  return {
    articleName: articleParts.join("-"),
    color,
    remarks: set ? `Set: ${set}` : "",
  };
}


exports.scanBill = async (req, res) => { try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid bill id",
      });
    }

    const bill = await StockInBill.findById(id);

    if (!bill || !bill.attachment) {
      return res.status(400).json({
        ok: false,
        message: "No bill file found",
      });
    }

    if (!fs.existsSync(bill.attachment)) {
      return res.status(404).json({
        ok: false,
        message: "Uploaded bill file not found on server",
        file: bill.attachment,
      });
    }

    console.log("SCAN STARTED:", bill.attachment);

    let text = "";

    if (isPdf(bill.attachment)) {
      console.log("PDF parse started");

      const dataBuffer = fs.readFileSync(bill.attachment);
      const pdfData = await pdfParse(dataBuffer);

      text = pdfData.text || "";

      console.log("PDF parse done");
    } else if (isImage(bill.attachment)) {
      console.log("Image OCR started");

      const ocrImagePath = await prepareImageForOCR(bill.attachment);
      text = await runOCRInChildProcess(ocrImagePath);

      console.log("Image OCR done");
      console.log("OCR TEXT LENGTH:", text.length);
      console.log("OCR TEXT PREVIEW:", text.slice(0, 1000));
    } else {
      return res.status(400).json({
        ok: false,
        message: "Unsupported bill file type",
      });
    }

   let parsed = [];

try {
  parsed = parseIndusBillText(text);
} catch (parseErr) {
  console.error("PARSE ERROR:", parseErr);

  return res.status(500).json({
    ok: false,
    message: "OCR completed but parsing failed",
    error: parseErr.message,
    rawText: text.slice(0, 2000),
  });
}

    return res.json({
      ok: true,
      data: parsed,
      meta: {
        totalLines: parsed.length,
        textLength: text.length,
        file: bill.attachment,
      },
      rawText: text.slice(0, 2000),
    });
  } catch (err) {
    console.error("SCAN ERROR:", err);

    return res.status(500).json({
      ok: false,
      message: "Scan failed",
      error: err.message,
    });
  }
};

exports.importScannedLines = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const { lines } = req.body;

    if (!Array.isArray(lines) || !lines.length) {
      return res.status(400).json({
        ok: false,
        message: "Lines required",
      });
    }

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid bill id",
      });
    }

    await session.withTransaction(async () => {
      const bill = await StockInBill.findById(id).session(session);

      if (!bill) {
        throw new Error("Bill not found");
      }

      if (bill.status !== "DRAFT") {
        throw new Error("Only draft bill allowed");
      }

      let lineNo = await StockInBillLine.countDocuments({
        billId: id,
      });

      const docs = [];

      for (const l of lines) {
        const articleName = up(l.articleName);
        const brand = up(l.brand);
        const color = up(l.color);

        const qty = Number(l.qty || 0);
        const mrp = Number(l.mrp || 0);
        const discountPercent = Number(l.discountPercent || 0);

        if (!articleName || !brand || !color || qty <= 0) {
          continue;
        }

        // find or create article
        let article = await Article.findOne({
          brand,
          articleName,
        }).session(session);

        if (!article) {
          article = await Article.create(
            [
              {
                brand,
                articleName,
                categoryGroup: "MEN",
                category: "UNMAPPED",
              },
            ],
            { session }
          ).then((r) => r[0]);
        }

        const cost = mrp - (mrp * discountPercent) / 100;
        const amount = cost * qty;

        lineNo++;

        docs.push({
          billId: id,
          lineNo,
          articleId: article._id,
          articleName,
          brand,
          color,
          qty,
          mrp,
          discountPercent,
          cost,
          amount,
          remarks: l.remarks || "",
        });
      }

     for (const doc of docs) {
  const existing = await StockInBillLine.findOne({
    billId: id,
    articleId: doc.articleId,
    color: doc.color,
    mrp: doc.mrp,
    cost: doc.cost,
  }).session(session);

  if (existing) {
    existing.qty = Number(existing.qty || 0) + Number(doc.qty || 0);
    existing.amount = Number((existing.qty * existing.cost).toFixed(2));

    if (doc.remarks) {
      existing.remarks = existing.remarks
        ? `${existing.remarks} | ${doc.remarks}`
        : doc.remarks;
    }

    await existing.save({ session });
  } else {
    await StockInBillLine.create([doc], { session });
  }
}

      await recalcBillTotals(id, session);
    });

    return res.json({
      ok: true,
      message: "Scanned lines imported",
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Import failed",
      error: err.message,
    });
  } finally {
    session.endSession();
  }
};

exports.revertConfirmedBill = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid stock-in bill id",
      });
    }

    let result = null;

    await session.withTransaction(async () => {
      const bill = await StockInBill.findById(id).session(session);

      if (!bill) {
        throw new Error("Stock-in bill not found");
      }

      if (bill.status !== "CONFIRMED") {
        throw new Error("Only CONFIRMED stock-in bill can be reverted");
      }

      const deletedLedger = await StockLedger.deleteMany(
        {
          txnType: "PURCHASE_IN",
          "ref.stockInBillId": bill._id,
        },
        { session }
      );

      bill.status = "DRAFT";
      bill.confirmedAt = null;
      bill.confirmedBy = null;

      await bill.save({ session });

      result = {
        billId: bill._id,
        deletedLedgerRows: deletedLedger.deletedCount,
        status: bill.status,
      };
    });

    return res.json({
      ok: true,
      message: "Stock-in bill reverted to DRAFT and ledger entries removed",
      data: result,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to revert stock-in bill",
      error: err.message,
    });
  } finally {
    session.endSession();
  }
};

exports.uploadAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: "No file uploaded",
      });
    }

    return res.json({
      ok: true,
      message: "Attachment uploaded",
      data: {
        path: `/uploads/stock-in-bills/${req.file.filename}`,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to upload attachment",
      error: err.message,
    });
  }
};

exports.uploadAttachmentToBill = async (req, res) => {
  try {
    const billId = String(req.params.id || "").trim();

    if (!isValidObjectId(billId)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid bill id",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: "No file uploaded",
      });
    }

    const bill = await StockInBill.findById(billId);

    if (!bill) {
      return res.status(404).json({
        ok: false,
        message: "Stock-in bill not found",
      });
    }

    if (up(bill.status) !== "DRAFT") {
      return res.status(400).json({
        ok: false,
        message: "Only DRAFT bill attachment can be updated",
      });
    }

    const filePath = `/uploads/stock-in-bills/${req.file.filename}`;

    bill.attachment = filePath;
    await bill.save();

    return res.json({
      ok: true,
      message: "Attachment uploaded and linked to bill",
      data: {
        bill,
        attachment: {
          path: filePath,
          filename: req.file.filename,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to upload bill attachment",
      error: err.message,
    });
  }
};