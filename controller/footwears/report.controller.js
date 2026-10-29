const mongoose = require("mongoose");
const ExcelJS = require("exceljs");
const Audit = require("../../models/footwears/Audit");
const AuditLine = require("../../models/footwears/AuditLine");
const Sku = require("../../models/footwears/Sku");

const Bill = require("../../models/footwears/Bill");
const StockLedger = require("../../models/footwears/StockLedger");
const Party = require("../../models/footwears/Party");
const PartyPayment = require("../../models/footwears/PartyPayment");
const ArticleMedia = require("../../models/footwears/ArticleMedia");

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function up(v) {
  return String(v || "").trim().toUpperCase();
}

function dateRange(req) {
  const filter = {};

  if (req.query.from || req.query.to) {
    filter.$gte = req.query.from ? new Date(req.query.from) : new Date("2000-01-01");
    filter.$lte = req.query.to ? new Date(req.query.to) : new Date();
  }

  return filter;
}

function billMatch(req) {
  const match = {};

  const range = dateRange(req);
  if (range.$gte || range.$lte) match.billDate = range;

  if (req.query.storeId && isValidObjectId(req.query.storeId)) {
    match.storeId = new mongoose.Types.ObjectId(req.query.storeId);
  }

  return match;
}

function ledgerMatch(req) {
  const match = {};

  if (req.query.storeId && isValidObjectId(req.query.storeId)) {
    match.storeId = new mongoose.Types.ObjectId(req.query.storeId);
  }

  if (req.query.categoryGroup || req.query.category || req.query.q) {
    // handled later after grouping when article snapshots exist
  }

  return match;
}

/* -------------------------------------------------
   OLD: CONSUMPTION REPORT
-------------------------------------------------- */
exports.consumption = async (req, res) => {
  try {
    const { storeId, category, from, to } = req.query;

    if (!storeId || !category) {
      return res.status(400).json({
        ok: false,
        message: "storeId and category are required",
      });
    }

    if (!isValidObjectId(storeId)) {
      return res.status(400).json({ ok: false, message: "Invalid storeId" });
    }

    const filter = {
      storeId,
      "scope.category": category.toUpperCase(),
      status: { $in: ["APPROVED", "LOCKED"] },
    };

    if (from || to) {
      filter.auditDate = {};
      if (from) filter.auditDate.$gte = new Date(from);
      if (to) filter.auditDate.$lte = new Date(to);
    }

    const audits = await Audit.find(filter).sort({ auditDate: 1 }).lean();

    if (audits.length < 2) {
      return res.json({
        ok: true,
        message: "Not enough audits to calculate consumption",
        data: [],
      });
    }

    const consumptionMap = new Map();

    for (let i = 1; i < audits.length; i++) {
      const prevAudit = audits[i - 1];
      const currAudit = audits[i];

      const [prevLines, currLines] = await Promise.all([
        AuditLine.find({ auditId: prevAudit._id }).lean(),
        AuditLine.find({ auditId: currAudit._id }).lean(),
      ]);

      const prevMap = new Map(prevLines.map((l) => [String(l.skuId), l.countedQty]));
      const currMap = new Map(currLines.map((l) => [String(l.skuId), l.countedQty]));

      const skuIds = new Set([...prevMap.keys(), ...currMap.keys()]);

      for (const skuId of skuIds) {
        const prevQty = prevMap.get(skuId) || 0;
        const currQty = currMap.get(skuId) || 0;

        const consumed = prevQty - currQty;

        if (consumed > 0) {
          consumptionMap.set(skuId, (consumptionMap.get(skuId) || 0) + consumed);
        }
      }
    }

    const skuIds = Array.from(consumptionMap.keys());
    const skus = await Sku.find({ _id: { $in: skuIds } }).lean();
    const skuMap = new Map(skus.map((s) => [String(s._id), s]));

    const result = Array.from(consumptionMap.entries()).map(([skuId, qty]) => ({
      sku: skuMap.get(skuId),
      consumedQty: qty,
    }));

    result.sort((a, b) => b.consumedQty - a.consumedQty);

    return res.json({ ok: true, data: result });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to generate consumption report",
      error: err.message,
    });
  }
};

exports.fastMovers = async (req, res) => {
  return exports.consumption(req, res);
};

exports.shrinkage = async (req, res) => {
  try {
    const { storeId, category } = req.query;

    if (!storeId || !category) {
      return res.status(400).json({
        ok: false,
        message: "storeId and category are required",
      });
    }

    if (!isValidObjectId(storeId)) {
      return res.status(400).json({ ok: false, message: "Invalid storeId" });
    }

    const audits = await Audit.find({
      storeId,
      "scope.category": category.toUpperCase(),
      status: { $in: ["APPROVED", "LOCKED"] },
    })
      .sort({ auditDate: 1 })
      .lean();

    if (audits.length < 2) {
      return res.json({ ok: true, data: [] });
    }

    const shrinkMap = new Map();

    for (let i = 1; i < audits.length; i++) {
      const prevAudit = audits[i - 1];
      const currAudit = audits[i];

      const [prevLines, currLines] = await Promise.all([
        AuditLine.find({ auditId: prevAudit._id }).lean(),
        AuditLine.find({ auditId: currAudit._id }).lean(),
      ]);

      const prevMap = new Map(prevLines.map((l) => [String(l.skuId), l.countedQty]));
      const currMap = new Map(currLines.map((l) => [String(l.skuId), l.countedQty]));

      const skuIds = new Set([...prevMap.keys(), ...currMap.keys()]);

      for (const skuId of skuIds) {
        const prevQty = prevMap.get(skuId) || 0;
        const currQty = currMap.get(skuId) || 0;

        if (currQty > prevQty) {
          const diff = currQty - prevQty;
          shrinkMap.set(skuId, (shrinkMap.get(skuId) || 0) + diff);
        }
      }
    }

    const skuIds = Array.from(shrinkMap.keys());
    const skus = await Sku.find({ _id: { $in: skuIds } }).lean();
    const skuMap = new Map(skus.map((s) => [String(s._id), s]));

    const result = Array.from(shrinkMap.entries()).map(([skuId, qty]) => ({
      sku: skuMap.get(skuId),
      shrinkageQty: qty,
    }));

    result.sort((a, b) => b.shrinkageQty - a.shrinkageQty);

    return res.json({ ok: true, data: result });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to generate shrinkage report",
      error: err.message,
    });
  }
};

/* -------------------------------------------------
   NEW: DASHBOARD SUMMARY
-------------------------------------------------- */
exports.dashboardSummary = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [todayBills, todayPayments, parties, stockRows, mediaRows] = await Promise.all([
      Bill.find({
        status: "FINAL",
        billDate: { $gte: today, $lt: tomorrow },
      }).lean(),

      PartyPayment.find({
        $or: [{ status: { $ne: "REVERSED" } }, { status: { $exists: false } }],
        paymentDate: { $gte: today, $lt: tomorrow },
      }).lean(),

      Party.find({ isActive: { $ne: false } }).lean(),

      StockLedger.aggregate([
        {
          $group: {
            _id: {
              articleId: "$articleId",
              color: "$color",
              mrp: "$mrp",
              cost: "$cost",
            },
            qty: { $sum: "$qtyDelta" },
            brand: { $last: "$brand" },
            articleName: { $last: "$articleName" },
            cost: { $last: "$cost" },
          },
        },
        { $match: { qty: { $gt: 0 } } },
      ]),

      ArticleMedia.find({ isCatalogueVisible: { $ne: false } }).lean(),
    ]);

    let todaySales = 0;
    let todayQty = 0;
    let todayProfit = 0;

    todayBills.forEach((b) => {
      todaySales += num(b?.totals?.netTotal);
      todayQty += num(b?.totals?.qtyTotal);

      (b.lines || []).forEach((l) => {
        todayProfit += num(l.qty) * (num(l.rate) - num(l.cost));
      });
    });

    const todayCollection = todayPayments.reduce((s, p) => s + num(p.amount), 0);

    const stockQty = stockRows.reduce((s, x) => s + num(x.qty), 0);
    const stockValue = stockRows.reduce((s, x) => s + num(x.qty) * num(x.cost), 0);

    const totalProducts = stockRows.length;
    const mediaSet = new Set(mediaRows.map((m) => `${String(m.articleId)}_${up(m.color)}`));
    const withImages = stockRows.filter((x) =>
      mediaSet.has(`${String(x._id.articleId)}_${up(x._id.color)}`)
    ).length;

    return res.json({
      ok: true,
      data: {
        todaySales,
        todayCollection,
        todayProfit,
        todayQty,
        totalOutstanding: 0,
        activeParties: parties.length,
        stockQty,
        stockValue,
        deadStockValue: 0,
        catalogueReadyPercent: totalProducts ? (withImages / totalProducts) * 100 : 0,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to load dashboard summary",
      error: err.message,
    });
  }
};

/* -------------------------------------------------
   TOP PRODUCTS
-------------------------------------------------- */
exports.topProducts = async (req, res) => {
  try {
    const match = billMatch(req);
    match.status = "FINAL";

    const rows = await Bill.aggregate([
      { $match: match },
      { $unwind: "$lines" },
      {
        $group: {
          _id: {
            articleId: "$lines.articleId",
            brand: "$lines.brand",
            articleName: "$lines.articleName",
            color: "$lines.color",
            categoryGroup: "$lines.snap.categoryGroup",
            category: "$lines.snap.category",
          },
          qtySold: { $sum: "$lines.qty" },
          sales: { $sum: "$lines.amount" },
          profit: {
            $sum: {
              $multiply: [
                "$lines.qty",
                { $subtract: ["$lines.rate", { $ifNull: ["$lines.cost", 0] }] },
              ],
            },
          },
        },
      },
      { $sort: { qtySold: -1, sales: -1 } },
      { $limit: 100 },
    ]);

    const data = rows.map((x) => ({
      articleId: x._id.articleId,
      brand: x._id.brand,
      articleName: x._id.articleName,
      color: x._id.color,
      categoryGroup: x._id.categoryGroup,
      category: x._id.category,
      qtySold: num(x.qtySold),
      sales: num(x.sales),
      profit: num(x.profit),
      marginPercent: num(x.sales) ? (num(x.profit) / num(x.sales)) * 100 : 0,
    }));

    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to load top products",
      error: err.message,
    });
  }
};

/* -------------------------------------------------
   DEAD STOCK
-------------------------------------------------- */
exports.deadStock = async (req, res) => {
  try {
    const stockRows = await StockLedger.aggregate([
      { $match: ledgerMatch(req) },
      {
        $group: {
          _id: {
            articleId: "$articleId",
            color: "$color",
            mrp: "$mrp",
            cost: "$cost",
          },
          stockQty: { $sum: "$qtyDelta" },
          brand: { $last: "$brand" },
          articleName: { $last: "$articleName" },
          cost: { $last: "$cost" },
        },
      },
      { $match: { stockQty: { $gt: 0 } } },
      { $limit: 300 },
    ]);

    const sales = await StockLedger.aggregate([
      { $match: { txnType: "SALE" } },
      {
        $group: {
          _id: {
            articleId: "$articleId",
            color: "$color",
          },
          lastSaleDate: { $max: "$txnAt" },
        },
      },
    ]);

    const saleMap = new Map(
      sales.map((x) => [`${String(x._id.articleId)}_${up(x._id.color)}`, x.lastSaleDate])
    );

    const today = Date.now();

    const data = stockRows
      .map((x) => {
        const key = `${String(x._id.articleId)}_${up(x._id.color)}`;
        const lastSaleDate = saleMap.get(key);
        const daysUnsold = lastSaleDate
          ? Math.floor((today - new Date(lastSaleDate).getTime()) / 86400000)
          : 999;

        return {
          articleId: x._id.articleId,
          brand: x.brand,
          articleName: x.articleName,
          color: x._id.color,
          categoryGroup: "",
          category: "",
          stockQty: num(x.stockQty),
          stockValue: num(x.stockQty) * num(x.cost),
          lastSaleDate,
          daysUnsold,
          risk: daysUnsold >= 120 ? "HIGH" : daysUnsold >= 60 ? "MEDIUM" : "LOW",
        };
      })
      .filter((x) => x.daysUnsold >= 45)
      .sort((a, b) => b.stockValue - a.stockValue);

    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to load dead stock",
      error: err.message,
    });
  }
};

/* -------------------------------------------------
   BRAND ANALYSIS
-------------------------------------------------- */
exports.brandAnalysis = async (req, res) => {
  try {
    const match = billMatch(req);
    match.status = "FINAL";

    const rows = await Bill.aggregate([
      { $match: match },
      { $unwind: "$lines" },
      {
        $group: {
          _id: "$lines.brand",
          sales: { $sum: "$lines.amount" },
          qtySold: { $sum: "$lines.qty" },
          profit: {
            $sum: {
              $multiply: [
                "$lines.qty",
                { $subtract: ["$lines.rate", { $ifNull: ["$lines.cost", 0] }] },
              ],
            },
          },
        },
      },
      { $sort: { sales: -1 } },
    ]);

    const data = rows.map((x) => ({
      brand: x._id,
      sales: num(x.sales),
      profit: num(x.profit),
      marginPercent: num(x.sales) ? (num(x.profit) / num(x.sales)) * 100 : 0,
      stockQty: 0,
      stockValue: 0,
      deadStockValue: 0,
      performance: num(x.profit) > 0 ? "LOW" : "HIGH",
    }));

    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to load brand analysis",
      error: err.message,
    });
  }
};

/* -------------------------------------------------
   PARTY RISK
-------------------------------------------------- */
exports.partyRisk = async (req, res) => {
  try {
    const parties = await Party.find({ isActive: { $ne: false } }).lean();

    const bills = await Bill.find({ status: "FINAL" }).lean();
    const payments = await PartyPayment.find({
      $or: [{ status: { $ne: "REVERSED" } }, { status: { $exists: false } }],
    }).lean();

    const map = new Map();

    parties.forEach((p) => {
      map.set(String(p._id), {
        partyId: p._id,
        partyName: p.name,
        phone: p.phone,
        outstanding: 0,
        totalBusiness: 0,
        lastSaleDate: null,
        lastPaymentDate: null,
      });
    });

    bills.forEach((b) => {
      const id = String(b.partyId);
      if (!map.has(id)) return;

      const row = map.get(id);
      row.totalBusiness += num(b?.totals?.netTotal);
      row.outstanding += num(b?.totals?.netTotal);

      if (!row.lastSaleDate || new Date(b.billDate) > new Date(row.lastSaleDate)) {
        row.lastSaleDate = b.billDate;
      }
    });

    payments.forEach((p) => {
      const id = String(p.partyId);
      if (!map.has(id)) return;

      const row = map.get(id);
      row.outstanding -= num(p.amount);

      const pDate = p.paymentDate || p.date || p.createdAt;
      if (!row.lastPaymentDate || new Date(pDate) > new Date(row.lastPaymentDate)) {
        row.lastPaymentDate = pDate;
      }
    });

    const data = Array.from(map.values())
      .filter((x) => x.outstanding > 0)
      .map((x) => ({
        ...x,
        risk: x.outstanding > 50000 ? "HIGH" : x.outstanding > 15000 ? "MEDIUM" : "LOW",
      }))
      .sort((a, b) => b.outstanding - a.outstanding);

    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to load party risk",
      error: err.message,
    });
  }
};

exports.collections = exports.partyRisk;

/* -------------------------------------------------
   PROFIT ANALYSIS
-------------------------------------------------- */
exports.profitAnalysis = async (req, res) => {
  try {
    const match = billMatch(req);
    match.status = "FINAL";

    const rows = await Bill.aggregate([
      { $match: match },
      { $unwind: "$lines" },
      {
        $group: {
          _id: {
            brand: "$lines.brand",
            articleName: "$lines.articleName",
            color: "$lines.color",
            mrp: "$lines.mrp",
          },
          soldQty: { $sum: "$lines.qty" },
          avgCost: { $avg: "$lines.cost" },
          avgSaleRate: { $avg: "$lines.rate" },
        },
      },
      { $sort: { soldQty: -1 } },
      { $limit: 150 },
    ]);

    const data = rows.map((x) => {
      const profitPerPair = num(x.avgSaleRate) - num(x.avgCost);

      return {
        brand: x._id.brand,
        articleName: x._id.articleName,
        color: x._id.color,
        mrp: x._id.mrp,
        avgCost: num(x.avgCost),
        avgSaleRate: num(x.avgSaleRate),
        profitPerPair,
        marginPercent: num(x.avgSaleRate) ? (profitPerPair / num(x.avgSaleRate)) * 100 : 0,
        soldQty: num(x.soldQty),
      };
    });

    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to load profit analysis",
      error: err.message,
    });
  }
};

/* -------------------------------------------------
   CATALOGUE READINESS
-------------------------------------------------- */
exports.catalogue = async (req, res) => {
  try {
    const stockRows = await StockLedger.aggregate([
      {
        $group: {
          _id: {
            articleId: "$articleId",
            color: "$color",
          },
          stockQty: { $sum: "$qtyDelta" },
          brand: { $last: "$brand" },
          articleName: { $last: "$articleName" },
        },
      },
      { $match: { stockQty: { $gt: 0 } } },
      { $limit: 500 },
    ]);

    const media = await ArticleMedia.find({}).lean();
    const mediaSet = new Set(media.map((m) => `${String(m.articleId)}_${up(m.color)}`));

    const data = stockRows.map((x) => {
      const key = `${String(x._id.articleId)}_${up(x._id.color)}`;

      return {
        articleId: x._id.articleId,
        brand: x.brand,
        articleName: x.articleName,
        color: x._id.color,
        stockQty: num(x.stockQty),
        hasImage: mediaSet.has(key),
      };
    });

    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to load catalogue report",
      error: err.message,
    });
  }
};

/* -------------------------------------------------
   EXT-DIS ARTICLE SALES REPORT
   Columns:
   Article Name | Quantity | MRP | Discount | Date | Party
-------------------------------------------------- */

async function getExtDiscountSalesRows(req) {
  const {
    from,
    to,
    storeId,
    partyId,
    salespersonId,
  } = req.query;

  const billFilter = {
    status: "FINAL",
  };

  if (storeId) {
    if (!isValidObjectId(storeId)) {
      throw new Error("Invalid storeId");
    }

    billFilter.storeId = new mongoose.Types.ObjectId(storeId);
  }

  if (partyId) {
    if (!isValidObjectId(partyId)) {
      throw new Error("Invalid partyId");
    }

    billFilter.partyId = new mongoose.Types.ObjectId(partyId);
  }

  /*
   * Keep this only if your Bill schema has assignedSalesperson
   * or salesPerson field.
   */
  if (salespersonId) {
    if (!isValidObjectId(salespersonId)) {
      throw new Error("Invalid salespersonId");
    }

    billFilter.salesPerson = new mongoose.Types.ObjectId(salespersonId);
  }

  if (from || to) {
    billFilter.billDate = {};

    if (from) {
      const fromDate = new Date(from);

      if (Number.isNaN(fromDate.getTime())) {
        throw new Error("Invalid from date");
      }

      fromDate.setHours(0, 0, 0, 0);
      billFilter.billDate.$gte = fromDate;
    }

    if (to) {
      const toDate = new Date(to);

      if (Number.isNaN(toDate.getTime())) {
        throw new Error("Invalid to date");
      }

      toDate.setHours(23, 59, 59, 999);
      billFilter.billDate.$lte = toDate;
    }
  }

  const bills = await Bill.find(billFilter)
    .populate({
      path: "partyId",
      select: "name companyName phone",
    })
    .sort({
      billDate: 1,
      createdAt: 1,
    })
    .lean();

  const rows = [];

  for (const bill of bills) {
    const party =
      bill.partyId && typeof bill.partyId === "object"
        ? bill.partyId
        : null;

    const partyName =
      party?.companyName ||
      party?.name ||
      bill.partyName ||
      "UNKNOWN PARTY";

    for (const line of bill.lines || []) {
      const articleName = up(
        line.articleName ||
        line.articleId?.articleName ||
        line.snap?.articleName
      );

      /*
       * Only EXT-DIS- articles
       */
      if (!articleName.startsWith("EXT-DIS-")) {
        continue;
      }

      const quantity = num(line.qty);
      const mrp = num(line.mrp);
      const rate = num(line.rate || line.price);
      const storedDiscount = num(
        line.discountPercent ??
        line.discount ??
        line.saleDiscountPercent
      );

      /*
       * Prefer stored discount.
       * Otherwise calculate discount from MRP and sale rate.
       */
      let discountPercent = storedDiscount;

      if (!discountPercent && mrp > 0 && rate >= 0) {
        discountPercent = ((mrp - rate) / mrp) * 100;
      }

      rows.push({
        articleName,
        quantity,
        mrp,
        discount: Math.max(discountPercent, 0),
        date: bill.billDate || bill.createdAt,
        party: up(partyName),

        // Internal references, not included in Excel columns
        billId: bill._id,
        billNo: bill.billNo,
        partyId: party?._id || bill.partyId,
      });
    }
  }

  return rows;
}

/**
 * GET /reports/ext-dis-sales
 *
 * Optional query:
 * from=2026-06-01
 * to=2026-06-30
 * storeId=
 * partyId=
 * salespersonId=
 */
exports.extDiscountSales = async (req, res) => {
  try {
    const rows = await getExtDiscountSalesRows(req);

    const totalQty = rows.reduce(
      (sum, row) => sum + num(row.quantity),
      0
    );

    return res.json({
      ok: true,
      count: rows.length,
      totalQty,
      data: rows,
    });
  } catch (err) {
    return res.status(400).json({
      ok: false,
      message: "Failed to generate EXT-DIS sales report",
      error: err.message,
    });
  }
};

/**
 * GET /reports/ext-dis-sales/export
 *
 * Downloads an Excel workbook.
 */
exports.exportExtDiscountSales = async (req, res) => {
  try {
    const rows = await getExtDiscountSalesRows(req);

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Squalo Footwears";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("EXT-DIS Sales", {
      views: [
        {
          state: "frozen",
          ySplit: 1,
        },
      ],
    });

    worksheet.columns = [
      {
        header: "Article Name",
        key: "articleName",
        width: 28,
      },
      {
        header: "Quantity",
        key: "quantity",
        width: 14,
      },
      {
        header: "MRP",
        key: "mrp",
        width: 14,
      },
      {
        header: "Discount",
        key: "discount",
        width: 15,
      },
      {
        header: "Date",
        key: "date",
        width: 16,
      },
      {
        header: "Party",
        key: "party",
        width: 32,
      },
    ];

    /*
     * Header styling
     */
    const headerRow = worksheet.getRow(1);

    headerRow.height = 24;
    headerRow.font = {
      bold: true,
      color: {
        argb: "FFFFFFFF",
      },
    };

    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: "FF2563EB",
      },
    };

    headerRow.alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    /*
     * Add data rows
     */
    for (const row of rows) {
      worksheet.addRow({
        articleName: row.articleName,
        quantity: row.quantity,
        mrp: row.mrp,
        discount: row.discount / 100,
        date: row.date ? new Date(row.date) : null,
        party: row.party,
      });
    }

    /*
     * Number formats
     */
    worksheet.getColumn("quantity").numFmt = "0";
    worksheet.getColumn("mrp").numFmt = '₹#,##0.00';
    worksheet.getColumn("discount").numFmt = "0.00%";
    worksheet.getColumn("date").numFmt = "dd/mm/yyyy";

    /*
     * Borders and alignment
     */
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: {
            style: "thin",
            color: { argb: "FFD9E2F3" },
          },
          left: {
            style: "thin",
            color: { argb: "FFD9E2F3" },
          },
          bottom: {
            style: "thin",
            color: { argb: "FFD9E2F3" },
          },
          right: {
            style: "thin",
            color: { argb: "FFD9E2F3" },
          },
        };

        if (rowNumber > 1) {
          cell.alignment = {
            vertical: "middle",
          };
        }
      });
    });

    /*
     * Enable filters
     */
    worksheet.autoFilter = {
      from: "A1",
      to: "F1",
    };

    /*
     * Add totals at bottom
     */
    const totalRowNumber = worksheet.rowCount + 2;

    worksheet.getCell(`A${totalRowNumber}`).value = "Total Quantity";
    worksheet.getCell(`A${totalRowNumber}`).font = {
      bold: true,
    };

    worksheet.getCell(`B${totalRowNumber}`).value = {
      formula: `SUM(B2:B${worksheet.rowCount})`,
      result: rows.reduce(
        (sum, row) => sum + num(row.quantity),
        0
      ),
    };

    worksheet.getCell(`B${totalRowNumber}`).font = {
      bold: true,
    };

    const fileDate = new Date()
      .toISOString()
      .slice(0, 10);

    const filename =
      `EXT-DIS-Sales-${fileDate}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      return res.status(400).json({
        ok: false,
        message: "Failed to export EXT-DIS sales report",
        error: err.message,
      });
    }

    res.end();
  }
};