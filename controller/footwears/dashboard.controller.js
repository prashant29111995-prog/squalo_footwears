const mongoose = require("mongoose");

const Store = require("../../models/footwears/Store");
const Bill = require("../../models/footwears/Bill");
const StockLedger = require("../../models/footwears/StockLedger");

const {
  posStoreFilter,
} = require("../../middleware/footwear-access");

const validId = (value) =>
  typeof value === "string" &&
  /^[a-f\d]{24}$/i.test(value);

// Reporting day: Asia/Kolkata.
function indiaDayRange(now = new Date()) {
  const offset = 330 * 60 * 1000;

  const indiaDate = new Date(now.getTime() + offset);

  const start = new Date(
    Date.UTC(
      indiaDate.getUTCFullYear(),
      indiaDate.getUTCMonth(),
      indiaDate.getUTCDate()
    ) - offset
  );

  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
  };
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

exports.getDashboard = async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");

    // This filter comes from the authenticated membership.
    const stores = await Store.find(posStoreFilter(req))
      .select("_id code name type")
      .sort({ name: 1, _id: 1 })
      .lean();

    let selectedStore = null;

    if (req.query.storeId !== undefined) {
      if (!validId(req.query.storeId)) {
        return res.status(400).send("Invalid store selection");
      }

      selectedStore = stores.find(
        (store) =>
          String(store._id) === req.query.storeId.toLowerCase()
      );

      if (!selectedStore) {
        return res.status(403).send(
          "You do not have access to this store"
        );
      }
    } else {
      const defaultStoreId =
        req.pos.membership.defaultStoreId &&
        String(req.pos.membership.defaultStoreId);

      selectedStore =
        stores.find(
          (store) => String(store._id) === defaultStoreId
        ) ||
        stores[0] ||
        null;
    }

    const canViewSales = ["OWNER", "MANAGER"].includes(
      req.pos.membership.role
    );

    const stock = {
      pairs: 0,
      batchCount: 0,
      negativeBatches: 0,
    };

    let sales = null;
    let recentBills = [];

    if (selectedStore) {
      const storeId = new mongoose.Types.ObjectId(
        String(selectedStore._id)
      );

      const stockQuery = StockLedger.aggregate([
        {
          $match: { storeId },
        },
        {
          $group: {
            _id: {
              articleId: "$articleId",
              color: "$color",
              mrp: "$mrp",
              cost: "$cost",
            },
            balance: { $sum: "$qtyDelta" },
          },
        },
        {
          $group: {
            _id: null,
            pairs: { $sum: "$balance" },
            batchCount: {
              $sum: {
                $cond: [{ $gt: ["$balance", 0] }, 1, 0],
              },
            },
            negativeBatches: {
              $sum: {
                $cond: [{ $lt: ["$balance", 0] }, 1, 0],
              },
            },
          },
        },
      ]);

      const { start, end } = indiaDayRange();

      // Do not query sales information for unauthorised roles.
      const salesQuery = canViewSales
        ? Bill.aggregate([
            {
              $match: {
                storeId,
                status: "FINAL",
                billDate: {
                  $gte: start,
                  $lt: end,
                },
              },
            },
            {
              $group: {
                _id: null,
                amount: { $sum: "$totals.netTotal" },
                pairs: { $sum: "$totals.qtyTotal" },
                billCount: { $sum: 1 },
              },
            },
          ])
        : Promise.resolve([]);

      const billsQuery = canViewSales
        ? Bill.find({
            storeId,
            status: "FINAL",
          })
            .select(
              "_id billNo billDate totals.netTotal totals.qtyTotal"
            )
            .sort({ billDate: -1, _id: -1 })
            .limit(8)
            .lean()
        : Promise.resolve([]);

      const [stockRows, salesRows, bills] = await Promise.all([
        stockQuery,
        salesQuery,
        billsQuery,
      ]);

      const stockResult = stockRows[0] || {};

      stock.pairs = number(stockResult.pairs);
      stock.batchCount = number(stockResult.batchCount);
      stock.negativeBatches = number(
        stockResult.negativeBatches
      );

      if (canViewSales) {
        const salesResult = salesRows[0] || {};

        sales = {
          amount: number(salesResult.amount),
          pairs: number(salesResult.pairs),
          billCount: number(salesResult.billCount),
        };

        recentBills = bills;
      }
    }

    return res.render("pos/dashboard", {
      pageTitle: "Squalo POS | Dashboard",
      businessName: req.pos.business.name,
      staffName: req.pos.user.name,
      role: req.pos.membership.role,
      stores,
      selectedStore,
      stock,
      sales,
      recentBills,
      canViewSales,

      money: (value) =>
        new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
        }).format(number(value)),

      dateLabel: (value) => {
        const date = new Date(value);

        return Number.isNaN(date.getTime())
          ? "—"
          : date.toLocaleDateString("en-IN", {
              timeZone: "Asia/Kolkata",
              day: "2-digit",
              month: "short",
              year: "numeric",
            });
      },
    });
  } catch (error) {
    return next(error);
  }
};