// ------------------------- Bill controller-----------------------------------

const mongoose = require("mongoose");

const Bill = require("../../models/footwears/Bill");
const Party = require("../../models/footwears/Party");
const Store = require("../../models/footwears/store");
const Article = require("../../models/footwears/Article");
const StockLedger = require("../../models/footwears/StockLedger");
const PartyLedger = require("../../models/footwears/PartyLedger");

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const up = (s) => String(s || "").trim().toUpperCase();

const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

function calcTotals(lines = []) {
  let qtyTotal = 0;
  let subTotal = 0;
  let discountTotal = 0;
  let netTotal = 0;

  for (const l of lines) {
    const qty = num(l.qty, 0);
    const mrp = num(l.mrp, 0);
    const rate = num(l.rate, 0); // final selling rate after discount

    const gross = qty * mrp;
    const amount = qty * rate;
    const discountAmount = Math.max(gross - amount, 0);

    l.amount = Number(amount.toFixed(2));

    qtyTotal += qty;
    subTotal += gross;
    discountTotal += discountAmount;
    netTotal += amount;
  }

  return {
    qtyTotal,
    subTotal: Number(subTotal.toFixed(2)),
    discountTotal: Number(discountTotal.toFixed(2)),
    netTotal: Math.round(netTotal),
  };
}

function recalcLine(line) {
  const qty = num(line.qty, 0);
  const mrp = num(line.mrp, 0);
  const discount = num(line.discount, 0);

  line.rate = Number(
    (mrp - (mrp * discount) / 100).toFixed(2)
  );

  line.amount = Number(
    (qty * line.rate).toFixed(2)
  );

  return line;
}

async function getAvailableQty({
  storeId,
  articleId,
  color,
  mrp,
  cost,
  session,
}) {
  const match = {
    storeId: new mongoose.Types.ObjectId(String(storeId)),
    articleId: new mongoose.Types.ObjectId(String(articleId)),
    color: up(color),
    mrp: Number(mrp || 0),
    cost: Number(cost || 0),
  };

  const rows = await StockLedger.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: "$qtyDelta" },
      },
    },
  ]).session(session || null);

  return num(rows?.[0]?.total, 0);
}
/**
 * POST /bills
 */
exports.create = async (req, res) => {
  try {
    const storeId = req.body.storeId;
    const partyId = req.body.partyId;

    if (!storeId || !partyId || !req.body.billDate) {
      return res.status(400).json({
        ok: false,
        message: "storeId, partyId, billDate required",
      });
    }

    if (!isValidObjectId(storeId) || !isValidObjectId(partyId)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid storeId/partyId",
      });
    }

    const [store, party] = await Promise.all([
      Store.findById(storeId).lean(),
      Party.findById(partyId).lean(),
    ]);

    if (!store) return res.status(404).json({ ok: false, message: "Store not found" });
    if (!party) return res.status(404).json({ ok: false, message: "Party not found" });

    const bill = await Bill.create({
      storeId,
      partyId,
      partyName: up(party.name),
      billDate: new Date(req.body.billDate),
      billNo: up(req.body.billNo),
      notes: String(req.body.notes || "").trim(),
      status: "DRAFT",
      lines: [],
      totals: {
        subTotal: 0,
        discountTotal: 0,
        netTotal: 0,
        qtyTotal: 0,
      },
      createdBy: req.user?._id,
    });

    return res.status(201).json({ ok: true, data: bill });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to create bill",
      error: err.message,
    });
  }
};

/**
 * GET /bills
 */
exports.list = async (req, res) => {
  try {
    const {
      storeId,
      partyId,
      status,
      from,
      to,
      page = 1,
      limit = 1000,
      all,
    } = req.query;

    const filter = {};

    if (storeId) {
      if (!isValidObjectId(storeId)) {
        return res.status(400).json({ ok: false, message: "Invalid storeId" });
      }
      filter.storeId = storeId;
    }

    if (partyId) {
      if (!isValidObjectId(partyId)) {
        return res.status(400).json({ ok: false, message: "Invalid partyId" });
      }
      filter.partyId = partyId;
    }

    if (status) {
      filter.status = up(status);
    }

    if (from || to) {
      filter.billDate = {};
      if (from) filter.billDate.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.billDate.$lte = toDate;
      }
    }

    const query = Bill.find(filter)
      .sort({ billDate: -1, createdAt: -1 })
      .populate("partyId", "name phone partyType type")
      .populate("storeId", "code name storeName")
      .lean();

    const total = await Bill.countDocuments(filter);

    // Fetch all bills when ?all=1
    if (String(all) === "1") {
      const items = await query;

      return res.json({
        ok: true,
        data: items,
        meta: {
          page: 1,
          limit: items.length,
          total,
          pages: 1,
          all: true,
        },
      });
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);

    // Allow large pagination, useful for client-side DataTable
    const limitNum = Math.min(
      Math.max(parseInt(limit, 10) || 1000, 1),
      10000
    );

    const skip = (pageNum - 1) * limitNum;

    const items = await query.skip(skip).limit(limitNum);

    return res.json({
      ok: true,
      data: items,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
        all: false,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to list bills",
      error: err.message,
    });
  }
};

/**
 * GET /bills/:id
 */
exports.getById = async (req, res) => {
  try {
    const billId = req.params.id;

    if (!isValidObjectId(billId)) {
      return res.status(400).json({ ok: false, message: "Invalid bill id" });
    }

    const bill = await Bill.findById(billId)
      .populate("storeId", "code name storeName")
      .populate("partyId", "name phone partyType type")
      .populate("lines.articleId", "brand articleName category categoryGroup")
      .lean();

    if (!bill) {
      return res.status(404).json({ ok: false, message: "Bill not found" });
    }

    if (!Array.isArray(bill.lines)) bill.lines = [];

    return res.json({ ok: true, data: bill });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to get bill",
      error: err.message,
    });
  }
};

/**
 * PATCH /bills/:id
 */
exports.update = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid bill id" });
    }

    const bill = await Bill.findById(id);

    if (!bill) {
      return res.status(404).json({ ok: false, message: "Bill not found" });
    }

    if (bill.status !== "DRAFT") {
      return res.status(409).json({
        ok: false,
        message: "Only DRAFT bills can be updated",
      });
    }

    if (req.body.billDate) bill.billDate = new Date(req.body.billDate);
    if (req.body.billNo !== undefined) bill.billNo = up(req.body.billNo);
    if (req.body.notes !== undefined) bill.notes = String(req.body.notes || "").trim();

    bill.totals = calcTotals(bill.lines || []);
    await bill.save();

    return res.json({ ok: true, data: bill });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to update bill",
      error: err.message,
    });
  }
};

/**
 * POST /bills/:id/lines
 * body:
 * {
 *   articleId,
 *   color,
 *   qty,
 *   mrp,
 *   rate,
 *   discount,
 *   remarks
 * }
 */
exports.addLine = async (req, res) => {
  try {
    const billId = req.params.id;

    if (!isValidObjectId(billId)) {
      return res.status(400).json({ ok: false, message: "Invalid bill id" });
    }

    const bill = await Bill.findById(billId);

    if (!bill) {
      return res.status(404).json({ ok: false, message: "Bill not found" });
    }

    if (up(bill.status) !== "DRAFT") {
      return res.status(400).json({ ok: false, message: "Bill is not editable" });
    }

    if (!Array.isArray(bill.lines)) bill.lines = [];

    const body = req.body || {};

    const articleId = body.articleId;
    const color = up(body.color || body.colorRaw);
    const qty = num(body.qty, NaN);
    const mrp = num(body.mrp, 0);
    const discount = num(body.discount, 0);
    const cost = num(body.cost, 0);
    const purchaseDiscountPercent = num(body.purchaseDiscountPercent, 0);

    if (!articleId || !isValidObjectId(articleId)) {
      return res.status(400).json({ ok: false, message: "Valid articleId required" });
    }

    if (!color) {
      return res.status(400).json({ ok: false, message: "Valid color required" });
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ ok: false, message: "Valid qty required" });
    }

    if (mrp <= 0) {
      return res.status(400).json({ ok: false, message: "MRP required" });
    }

    if (cost < 0) {
      return res.status(400).json({ ok: false, message: "Valid cost required" });
    }

    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      return res.status(400).json({ ok: false, message: "Valid discount required" });
    }

    const article = await Article.findById(articleId).lean();

    if (!article) {
      return res.status(404).json({ ok: false, message: "Article not found" });
    }

    const availableQty = await getAvailableQty({
      storeId: bill.storeId,
      articleId,
      color,
      mrp,
      cost,
    });

    const existingLine = (bill.lines || []).find(
      (x) =>
        String(x.articleId) === String(articleId) &&
        up(x.color) === color &&
        Number(x.mrp || 0) === Number(mrp) &&
        Number(x.cost || 0) === Number(cost)
    );

    const existingQty = existingLine ? num(existingLine.qty, 0) : 0;
    const requestedTotalQty = existingQty + qty;

    if (requestedTotalQty > availableQty) {
      return res.status(400).json({
        ok: false,
        message: `Available stock only ${availableQty}. Already in bill: ${existingQty}, adding: ${qty}`,
      });
    }

    if (existingLine) {
      existingLine.qty = requestedTotalQty;
      existingLine.mrp = mrp;
      existingLine.cost = cost;
      existingLine.purchaseDiscountPercent = purchaseDiscountPercent;
      existingLine.discount = discount;

      if (body.remarks !== undefined) {
        existingLine.remarks = String(body.remarks || "").trim();
      }

      recalcLine(existingLine);
    } else {
      const newLine = {
        articleId,
        brand: up(article.brand),
        articleName: up(article.articleName || article.name),
        color,
        qty,
        mrp,
        cost,
        purchaseDiscountPercent,
        discount,
        remarks: String(body.remarks || "").trim(),
        snap: {
          category: up(article.category),
          categoryGroup: up(article.categoryGroup),
        },
      };

      recalcLine(newLine);
      bill.lines.push(newLine);
    }

    bill.totals = calcTotals(bill.lines || []);
    await bill.save();

    return res.json({
      ok: true,
      message: existingLine ? "Existing line updated" : "Line added",
      data: bill,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to add line",
      error: err.message,
    });
  }
};

/**
 * PATCH /bills/:id/lines/:lineId
 */
exports.updateLine = async (req, res) => {
  try {
    const { id: billId, lineId } = req.params;

    if (!isValidObjectId(billId) || !isValidObjectId(lineId)) {
      return res.status(400).json({ ok: false, message: "Invalid id" });
    }

    const bill = await Bill.findById(billId);

    if (!bill) {
      return res.status(404).json({ ok: false, message: "Bill not found" });
    }

    if (up(bill.status) !== "DRAFT") {
      return res.status(400).json({
        ok: false,
        message: "Only DRAFT bill lines can be updated",
      });
    }

    const line = (bill.lines || []).id(lineId);

    if (!line) {
      return res.status(404).json({ ok: false, message: "Line not found" });
    }

    if (req.body.color !== undefined || req.body.colorRaw !== undefined) {
      line.color = up(req.body.color || req.body.colorRaw);
    }

    if (req.body.qty !== undefined) {
      const qty = num(req.body.qty, NaN);

      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({
          ok: false,
          message: "Valid qty required",
        });
      }

      line.qty = qty;
    }

    if (req.body.mrp !== undefined) {
      const mrp = num(req.body.mrp, 0);

      if (mrp <= 0) {
        return res.status(400).json({
          ok: false,
          message: "MRP required",
        });
      }

      line.mrp = mrp;
    }

    if (req.body.cost !== undefined) {
      const cost = num(req.body.cost, 0);

      if (cost < 0) {
        return res.status(400).json({
          ok: false,
          message: "Valid cost required",
        });
      }

      line.cost = cost;
    }

    if (req.body.purchaseDiscountPercent !== undefined) {
      const purchaseDiscountPercent = num(req.body.purchaseDiscountPercent, 0);

      if (
        !Number.isFinite(purchaseDiscountPercent) ||
        purchaseDiscountPercent < 0 ||
        purchaseDiscountPercent > 100
      ) {
        return res.status(400).json({
          ok: false,
          message: "Valid purchase discount required",
        });
      }

      line.purchaseDiscountPercent = purchaseDiscountPercent;
    }

    if (req.body.discount !== undefined) {
      const discount = num(req.body.discount, NaN);

      if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
        return res.status(400).json({
          ok: false,
          message: "Valid discount required",
        });
      }

      line.discount = discount;
    }

    if (!line.mrp || Number(line.mrp) <= 0) {
      return res.status(400).json({
        ok: false,
        message: "MRP required",
      });
    }

    if (line.cost === undefined || line.cost === null || Number(line.cost) < 0) {
      return res.status(400).json({
        ok: false,
        message: "Cost required for selected batch",
      });
    }

    recalcLine(line);

    const availableQty = await getAvailableQty({
      storeId: bill.storeId,
      articleId: line.articleId,
      color: line.color,
      mrp: line.mrp,
      cost: line.cost,
    });

    if (num(line.qty, 0) > availableQty) {
      return res.status(400).json({
        ok: false,
        message: `Available stock only ${availableQty}`,
      });
    }

    if (req.body.remarks !== undefined) {
      line.remarks = String(req.body.remarks || "").trim();
    }

    bill.totals = calcTotals(bill.lines || []);
    await bill.save();

    return res.json({
      ok: true,
      message: "Line updated",
      data: bill,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to update line",
      error: err.message,
    });
  }
};
/**
 * DELETE /bills/:id/lines/:lineId
 */
exports.deleteLine = async (req, res) => {
  try {
    const { id: billId, lineId } = req.params;

    if (!isValidObjectId(billId) || !isValidObjectId(lineId)) {
      return res.status(400).json({ ok: false, message: "Invalid id" });
    }

    const bill = await Bill.findById(billId);

    if (!bill) {
      return res.status(404).json({ ok: false, message: "Bill not found" });
    }

    if (up(bill.status) !== "DRAFT") {
      return res.status(400).json({
        ok: false,
        message: "Only DRAFT bills can be edited",
      });
    }

    const before = Array.isArray(bill.lines) ? bill.lines.length : 0;

    bill.lines = (bill.lines || []).filter(
      (l) => String(l?._id || "") !== String(lineId)
    );

    if (bill.lines.length === before) {
      return res.status(404).json({ ok: false, message: "Line not found" });
    }

    bill.markModified("lines");
    bill.totals = calcTotals(bill.lines || []);

    await bill.save();

    return res.json({
      ok: true,
      message: "Line deleted",
      data: bill,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to delete line",
      error: err.message,
    });
  }
};

/**
 * Deprecated endpoint.
 */
exports.updateBreakup = async (req, res) => {
  return res.status(410).json({
    ok: false,
    message: "Size breakup removed. Billing now uses Article + Color + Qty.",
  });
};

/**
 * POST /bills/:id/finalize
 */
exports.finalize = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const billId = String(req.params.id || "").trim();

    if (!isValidObjectId(billId)) {
      return res.status(400).json({ ok: false, message: "Invalid bill id" });
    }

    let responsePayload = null;

    await session.withTransaction(async () => {
      const bill = await Bill.findById(billId).session(session);

      if (!bill) throw new Error("Bill not found");
      if (up(bill.status) !== "DRAFT") {
        throw new Error("Only DRAFT bills can be finalized");
      }

      const storeId = String(bill.storeId || "");
      if (!isValidObjectId(storeId)) {
        throw new Error("Bill storeId missing/invalid");
      }

      const partyId = String(bill.partyId || "");
      if (!isValidObjectId(partyId)) {
        throw new Error("Bill partyId missing/invalid");
      }

      const lines = Array.isArray(bill.lines) ? bill.lines : [];
      if (!lines.length) {
        throw new Error("Cannot finalize bill without lines");
      }

      const txnAt = bill.billDate ? new Date(bill.billDate) : new Date();
      if (Number.isNaN(txnAt.getTime())) {
        throw new Error("Invalid billDate");
      }

      const saleRows = [];

      for (const line of lines) {
        const articleId = String(line.articleId || "");
        const articleName = up(line.articleName);
        const brand = up(line.brand);
        const color = up(line.color);
        const qty = num(line.qty, 0);
        const mrp = num(line.mrp, 0);
        const cost = num(line.cost, 0);
        const purchaseDiscountPercent = num(line.purchaseDiscountPercent, 0);

        if (!isValidObjectId(articleId)) {
          throw new Error(`Invalid articleId in line ${articleName || "UNKNOWN"}`);
        }

        if (!brand || !articleName || !color) {
          throw new Error(`Missing brand/article/color in line ${articleName || "UNKNOWN"}`);
        }

        if (qty <= 0) throw new Error(`Invalid qty for ${articleName}`);
        if (mrp <= 0) throw new Error(`Missing MRP batch for ${brand} ${articleName} ${color}`);

        if (!Number.isFinite(cost) || cost <= 0) {
          throw new Error(
            `Missing cost batch for ${brand} ${articleName} ${color}. Delete this line and add it again from MRP batch.`
          );
        }

        const available = await getAvailableQty({
          storeId,
          articleId,
          color,
          mrp,
          cost,
          session,
        });

        if (qty > available) {
          throw new Error(
            `Not enough stock for ${brand} ${articleName} ${color} MRP ${mrp}. Available ${available}, requested ${qty}`
          );
        }

        saleRows.push({
          storeId: new mongoose.Types.ObjectId(storeId),
          articleId: new mongoose.Types.ObjectId(articleId),
          articleName,
          brand,
          color,
          mrp,
          cost,
          purchaseDiscountPercent,
          txnType: "SALE",
          qtyDelta: -qty,
          balanceAfter: available - qty,
          txnAt,
          ref: {
            billId: bill._id,
            documentNo: String(bill.billNo || bill._id),
            note: `SALE from Bill ${bill.billNo || bill._id}`,
          },
          createdBy: req.user?._id || undefined,
        });
      }

      bill.totals = calcTotals(bill.lines || []);

      const billAmount = num(
  bill.totals?.payableTotal || Math.round(bill.totals?.netTotal || 0),
  0
);

      if (billAmount <= 0) {
        throw new Error("Bill amount must be greater than 0");
      }

      await StockLedger.insertMany(saleRows, { session });

      const party = await Party.findById(partyId).session(session);

      if (!party) {
        throw new Error("Party not found for ledger posting");
      }

      const currentBalance = num(party.currentBalance, 0);
      const signedBalance = currentBalance + billAmount;

      await PartyLedger.create(
        [
          {
            partyId: new mongoose.Types.ObjectId(partyId),
            storeId: new mongoose.Types.ObjectId(storeId),

            txnDate: txnAt,
            txnType: "SALE_BILL",

            debit: billAmount,
            credit: 0,

            balanceAfter: Math.abs(signedBalance),
            balanceType: signedBalance >= 0 ? "DR" : "CR",

            ref: {
              billId: bill._id,
              documentNo: String(bill.billNo || bill._id),
              note: `Sales Bill ${bill.billNo || bill._id}`,
            },

            createdBy: req.user?._id || undefined,
          },
        ],
        { session }
      );

      party.currentBalance = signedBalance;
      party.totalSalesAmount = num(party.totalSalesAmount, 0) + billAmount;
      party.lastSaleDate = txnAt;

      await party.save({ session });

      bill.status = "FINAL";
      bill.finalizedAt = new Date();
      bill.finalizedBy = req.user?._id || undefined;

      await bill.save({ session });

      responsePayload = {
        ok: true,
        message: "Bill finalized. StockLedger SALE and PartyLedger BILL entries created.",
        data: {
          billId: bill._id,
          saleCount: saleRows.length,
          totals: bill.totals,
          partyBalance: party.currentBalance,
        },
      };
    });

    return res.json(responsePayload);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: err.message || "Failed to finalize bill",
      error: err.message,
    });
  } finally {
    session.endSession();
  }
};
/**
 * POST /bills/:id/cancel
 */
exports.cancel = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid bill id" });
    }

    const bill = await Bill.findById(id);

    if (!bill) {
      return res.status(404).json({ ok: false, message: "Bill not found" });
    }

    if (bill.status === "CANCELLED") {
      return res.json({
        ok: true,
        message: "Already cancelled",
        data: bill,
      });
    }

    if (bill.status === "FINAL") {
      return res.status(409).json({
        ok: false,
        message: "FINAL bill cannot be cancelled directly. Use Return flow.",
      });
    }

    bill.status = "CANCELLED";
    bill.cancelledBy = req.user?._id;
    bill.cancelledAt = new Date();

    await bill.save();

    return res.json({
      ok: true,
      message: "Bill cancelled",
      data: bill,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to cancel bill",
      error: err.message,
    });
  }
};

exports.reverseFinalBill = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const billId = String(req.params.id || "").trim();

    if (!isValidObjectId(billId)) {
      return res.status(400).json({ ok: false, message: "Invalid bill id" });
    }

    let responsePayload = null;

    await session.withTransaction(async () => {
      const bill = await Bill.findById(billId).session(session);

      if (!bill) throw new Error("Bill not found");

      if (up(bill.status) !== "FINAL") {
        throw new Error("Only FINAL bills can be reversed");
      }

      const storeId = String(bill.storeId || "");
      const partyId = String(bill.partyId || "");

      if (!isValidObjectId(storeId)) {
        throw new Error("Bill storeId missing/invalid");
      }

      if (!isValidObjectId(partyId)) {
        throw new Error("Bill partyId missing/invalid");
      }

      const reversalRows = [];

      for (const line of bill.lines || []) {
        const articleId = String(line.articleId || "");
        const qty = num(line.qty, 0);
        const mrp = num(line.mrp, 0);
        const cost = num(line.cost, 0);

        if (!isValidObjectId(articleId) || qty <= 0) continue;

        const available = await getAvailableQty({
          storeId,
          articleId,
          color: line.color,
          mrp,
          cost,
          session,
        });

        reversalRows.push({
          storeId: new mongoose.Types.ObjectId(storeId),
          articleId: new mongoose.Types.ObjectId(articleId),

          articleName: up(line.articleName),
          brand: up(line.brand),
          color: up(line.color),

          mrp,
          cost,
          purchaseDiscountPercent: num(line.purchaseDiscountPercent, 0),

          txnType: "SALE_RETURN",
          qtyDelta: qty,
          balanceAfter: available + qty,
          txnAt: new Date(),

          ref: {
            billId: bill._id,
            documentNo: String(bill.billNo || bill._id),
            note: `REVERSAL of Sale Bill ${bill.billNo || bill._id}`,
          },

          createdBy: req.user?._id || undefined,
        });
      }

      if (!reversalRows.length) {
        throw new Error("No bill lines found for reversal");
      }

      await StockLedger.insertMany(reversalRows, { session });

      const billAmount = num(
  bill.totals?.payableTotal || Math.round(bill.totals?.netTotal || 0),
  0
);

      if (billAmount <= 0) {
        throw new Error("Bill amount missing for ledger reversal");
      }

      const party = await Party.findById(partyId).session(session);

      if (!party) {
        throw new Error("Party not found for ledger reversal");
      }

      const currentBalance = num(party.currentBalance, 0);
      const signedBalance = currentBalance - billAmount;

      await PartyLedger.create(
        [
          {
            partyId: new mongoose.Types.ObjectId(partyId),
            storeId: new mongoose.Types.ObjectId(storeId),

            txnDate: new Date(),
            txnType: "SALE_REVERSED",

            debit: 0,
            credit: billAmount,

            balanceAfter: Math.abs(signedBalance),
            balanceType: signedBalance >= 0 ? "DR" : "CR",

            ref: {
              billId: bill._id,
              documentNo: String(bill.billNo || bill._id),
              note: `Reversal of Sales Bill ${bill.billNo || bill._id}`,
            },

            createdBy: req.user?._id || undefined,
          },
        ],
        { session }
      );

      party.currentBalance = signedBalance;
      party.totalSalesAmount = Math.max(
        num(party.totalSalesAmount, 0) - billAmount,
        0
      );

      await party.save({ session });

      bill.status = "CANCELLED";
      bill.cancelledAt = new Date();
      bill.cancelledBy = req.user?._id || undefined;
      bill.notes = `${bill.notes || ""}\nReversed final sale bill and restored stock`.trim();

      await bill.save({ session });

      responsePayload = {
        ok: true,
        message: "Final bill reversed successfully. Stock and party ledger updated.",
        data: {
          billId: bill._id,
          reversalCount: reversalRows.length,
          partyBalance: party.currentBalance,
        },
      };
    });

    return res.json(responsePayload);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: err.message || "Failed to reverse bill",
      error: err.message,
    });
  } finally {
    session.endSession();
  }
};