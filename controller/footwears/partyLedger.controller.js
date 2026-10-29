const mongoose = require("mongoose");

const PartyLedger = require("../../models/footwears/PartyLedger");
const Party = require("../../models/footwears/Party");

function isValidObjectId(v) {
  return mongoose.Types.ObjectId.isValid(v);
}

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function up(v) {
  return String(v || "").trim().toUpperCase();
}

/**
 * LIST LEDGER
 * GET /apis/footwears/party-ledger
 */
exports.list = async (req, res) => {
  try {
    const {
      partyId,
      storeId,
      txnType,
      from,
      to,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};

    if (partyId) {
      if (!isValidObjectId(partyId)) {
        return res.status(400).json({
          ok: false,
          message: "Invalid partyId",
        });
      }

      filter.partyId = partyId;
    }

    if (storeId) {
      if (!isValidObjectId(storeId)) {
        return res.status(400).json({
          ok: false,
          message: "Invalid storeId",
        });
      }

      filter.storeId = storeId;
    }

    if (txnType) {
      filter.txnType = up(txnType);
    }

    if (from || to) {
      filter.txnDate = {};

      if (from) {
        filter.txnDate.$gte = new Date(from);
      }

      if (to) {
        filter.txnDate.$lte = new Date(to);
      }
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(
      Math.max(parseInt(limit, 10) || 50, 1),
      500
    );

    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      PartyLedger.find(filter)
        .sort({ txnDate: 1, createdAt: 1 })
        .skip(skip)
        .limit(limitNum)
        .populate("partyId", "name phone")
        .populate("storeId", "name code")
        .lean(),

      PartyLedger.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      data: items,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch ledger",
      error: err.message,
    });
  }
};

/**
 * GET SINGLE ENTRY
 * GET /apis/footwears/party-ledger/:id
 */
exports.getById = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid ledger id",
      });
    }

    const item = await PartyLedger.findById(id)
      .populate("partyId", "name phone")
      .populate("storeId", "name code")
      .lean();

    if (!item) {
      return res.status(404).json({
        ok: false,
        message: "Ledger entry not found",
      });
    }

    return res.json({
      ok: true,
      data: item,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch ledger entry",
      error: err.message,
    });
  }
};

/**
 * CREATE MANUAL ADJUSTMENT
 * POST /apis/footwears/party-ledger/adjustment
 */
exports.createAdjustment = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    let responsePayload = null;

    await session.withTransaction(async () => {
      const body = req.body || {};

      const partyId = String(body.partyId || "").trim();
      const storeId = String(body.storeId || "").trim();

      if (!isValidObjectId(partyId)) {
        throw new Error("Valid partyId required");
      }

      const party = await Party.findById(partyId).session(session);

      if (!party) {
        throw new Error("Party not found");
      }

      const adjustmentType = up(body.adjustmentType || "");

      if (!["DEBIT", "CREDIT"].includes(adjustmentType)) {
        throw new Error("Valid adjustmentType required: DEBIT or CREDIT");
      }

      const amount = num(body.amount, 0);

      if (amount <= 0) {
        throw new Error("Valid adjustment amount required");
      }

      const debit = adjustmentType === "DEBIT" ? amount : 0;
      const credit = adjustmentType === "CREDIT" ? amount : 0;

      const txnDate = body.entryDate
        ? new Date(body.entryDate)
        : body.txnDate
        ? new Date(body.txnDate)
        : new Date();

      if (Number.isNaN(txnDate.getTime())) {
        throw new Error("Invalid adjustment date");
      }

      const currentBalance = num(party.currentBalance, 0);

      const signedBalance = currentBalance + debit - credit;
      const balanceType = signedBalance >= 0 ? "DR" : "CR";
      const balanceAfter = Math.abs(signedBalance);

      const note = String(body.notes || body.note || "").trim();

      if (!note) {
        throw new Error("Adjustment note/reason required");
      }

      const ledgerDocs = await PartyLedger.create(
        [
          {
            partyId,
            storeId: isValidObjectId(storeId)
              ? new mongoose.Types.ObjectId(storeId)
              : undefined,

            txnDate,

            txnType: "ADJUSTMENT",

            debit,
            credit,

            balanceAfter,
            balanceType,

            ref: {
              documentNo:
                String(body.documentNo || "").trim() ||
                `ADJ-${Date.now()}`,
              note,
              adjustmentType,
            },

            createdBy: req.user?._id || undefined,
          },
        ],
        { session }
      );

      party.currentBalance = signedBalance;

      await party.save({ session });

      responsePayload = {
        ok: true,
        message: "Adjustment entry created",
        data: {
          ledger: ledgerDocs[0],
          partyBalance: party.currentBalance,
        },
      };
    });

    return res.json(responsePayload);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: err.message || "Failed to create adjustment",
      error: err.message,
    });
  } finally {
    session.endSession();
  }
};

/**
 * REVERSE ADJUSTMENT
 * POST /apis/footwears/party-ledger/:id/reverse
 */
exports.reverseAdjustment = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    let responsePayload = null;

    await session.withTransaction(async () => {
      const id = String(req.params.id || "").trim();

      if (!isValidObjectId(id)) {
        throw new Error("Invalid ledger id");
      }

      const item = await PartyLedger.findById(id).session(session);

      if (!item) {
        throw new Error("Ledger entry not found");
      }

      if (up(item.txnType) !== "ADJUSTMENT") {
        throw new Error("Only adjustment entries can be reversed");
      }

      const party = await Party.findById(item.partyId).session(session);

      if (!party) {
        throw new Error("Party not found");
      }

      const reverseDebit = num(item.credit, 0);
      const reverseCredit = num(item.debit, 0);

      const currentBalance = num(party.currentBalance, 0);

      let nextBalance =
        currentBalance + reverseDebit - reverseCredit;

      const balanceType = nextBalance >= 0 ? "DR" : "CR";

      nextBalance = Math.abs(nextBalance);

      const reversal = await PartyLedger.create(
        [
          {
            partyId: item.partyId,
            storeId: item.storeId,

            txnDate: new Date(),

            txnType: "ADJUSTMENT",

            debit: reverseDebit,
            credit: reverseCredit,

            balanceAfter: nextBalance,
            balanceType,

            ref: {
              note: `REVERSAL of adjustment ${item._id}`,
            },

            createdBy: req.user?._id || undefined,
          },
        ],
        { session }
      );

      party.currentBalance =
        balanceType === "DR"
          ? nextBalance
          : -nextBalance;

      await party.save({ session });

      responsePayload = {
        ok: true,
        message: "Adjustment reversed",
        data: reversal[0],
      };
    });

    return res.json(responsePayload);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to reverse adjustment",
      error: err.message,
    });
  } finally {
    session.endSession();
  }
};