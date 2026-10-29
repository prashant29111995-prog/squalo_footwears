const mongoose = require("mongoose");

const Party = require("../../models/footwears/Party");
const PartyLedger = require("../../models/footwears/PartyLedger");
const PartyPayment = require("../../models/footwears/PartyPayment");

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

function calcNextBalance(currentBalance, debit, credit) {
  const next = num(currentBalance, 0) + num(debit, 0) - num(credit, 0);

  return {
    signedBalance: next,
    balanceAfter: Math.abs(next),
    balanceType: next >= 0 ? "DR" : "CR",
  };
}

/**
 * GET /apis/footwears/party-payments
 */
exports.list = async (req, res) => {
  try {
    const {
      partyId,
      storeId,
      status,
      paymentMode,
      from,
      to,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};

    if (partyId) {
      if (!isValidObjectId(partyId)) {
        return res.status(400).json({ ok: false, message: "Invalid partyId" });
      }
      filter.partyId = partyId;
    }

    if (storeId) {
      if (!isValidObjectId(storeId)) {
        return res.status(400).json({ ok: false, message: "Invalid storeId" });
      }
      filter.storeId = storeId;
    }

    if (status) filter.status = up(status);
    if (paymentMode) filter.paymentMode = up(paymentMode);

    if (from || to) {
      filter.paymentDate = {};
      if (from) filter.paymentDate.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.paymentDate.$lte = toDate;
      }
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      PartyPayment.find(filter)
        .sort({ paymentDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("partyId", "name phone partyType")
        .populate("storeId", "code name storeName")
        .lean(),
      PartyPayment.countDocuments(filter),
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
      message: "Failed to list payments",
      error: err.message,
    });
  }
};

/**
 * GET /apis/footwears/party-payments/:id
 */
exports.getById = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid payment id" });
    }

    const payment = await PartyPayment.findById(id)
      .populate("partyId", "name phone partyType")
      .populate("storeId", "code name storeName")
      .lean();

    if (!payment) {
      return res.status(404).json({ ok: false, message: "Payment not found" });
    }

    return res.json({ ok: true, data: payment });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to get payment",
      error: err.message,
    });
  }
};

/**
 * POST /apis/footwears/party-payments
 */
exports.create = async (req, res) => {
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

      const amount = num(body.amount, 0);

      if (amount <= 0) {
        throw new Error("Valid payment amount required");
      }

      const paymentMode = up(body.paymentMode || "CASH");

      if (!["CASH", "UPI", "BANK", "CHEQUE", "CARD", "OTHER"].includes(paymentMode)) {
        throw new Error("Invalid payment mode");
      }

      const paymentDate = body.paymentDate ? new Date(body.paymentDate) : new Date();

      if (Number.isNaN(paymentDate.getTime())) {
        throw new Error("Invalid payment date");
      }

      const paymentDocs = await PartyPayment.create(
        [
          {
            partyId,
            storeId: isValidObjectId(storeId)
              ? new mongoose.Types.ObjectId(storeId)
              : undefined,

            paymentDate,
            amount,
            paymentMode,

            referenceNo: up(body.referenceNo),
            note: String(body.note || "").trim(),

            status: "ACTIVE",
            createdBy: req.user?._id || undefined,
          },
        ],
        { session }
      );

      const payment = paymentDocs[0];

      // Payment received = CREDIT in customer ledger
      const balance = calcNextBalance(party.currentBalance, 0, amount);

      const ledgerDocs = await PartyLedger.create(
        [
          {
            partyId,
            storeId: isValidObjectId(storeId)
              ? new mongoose.Types.ObjectId(storeId)
              : undefined,

            txnDate: paymentDate,
            txnType: "PAYMENT_RECEIVED",

            debit: 0,
            credit: amount,

            balanceAfter: balance.balanceAfter,
            balanceType: balance.balanceType,

            ref: {
              paymentId: payment._id,
              documentNo: payment.referenceNo || String(payment._id),
              paymentMode,
              note: payment.note || "Payment received",
            },

            createdBy: req.user?._id || undefined,
          },
        ],
        { session }
      );

      party.currentBalance = balance.signedBalance;
      party.totalReceivedAmount = num(party.totalReceivedAmount, 0) + amount;
      party.lastPaymentDate = paymentDate;

      await party.save({ session });

      responsePayload = {
        ok: true,
        message: "Payment received and ledger updated",
        data: {
          payment,
          ledger: ledgerDocs[0],
          partyBalance: party.currentBalance,
        },
      };
    });

    return res.status(201).json(responsePayload);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: err.message || "Failed to create payment",
      error: err.message,
    });
  } finally {
    session.endSession();
  }
};

/**
 * PUT /apis/footwears/party-payments/:id
 * Only basic note/reference update allowed for ACTIVE payment.
 * Amount/date/mode should be changed by reverse + new payment.
 */
exports.update = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid payment id" });
    }

    const payment = await PartyPayment.findById(id);

    if (!payment) {
      return res.status(404).json({ ok: false, message: "Payment not found" });
    }

    if (up(payment.status) !== "ACTIVE") {
      return res.status(400).json({
        ok: false,
        message: "Only ACTIVE payment can be updated",
      });
    }

    if (req.body.referenceNo !== undefined) {
      payment.referenceNo = up(req.body.referenceNo);
    }

    if (req.body.note !== undefined) {
      payment.note = String(req.body.note || "").trim();
    }

    await payment.save();

    await PartyLedger.updateOne(
      {
        "ref.paymentId": payment._id,
        txnType: "PAYMENT_RECEIVED",
      },
      {
        $set: {
          "ref.documentNo": payment.referenceNo || String(payment._id),
          "ref.note": payment.note || "Payment received",
        },
      }
    );

    return res.json({
      ok: true,
      message: "Payment updated",
      data: payment,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to update payment",
      error: err.message,
    });
  }
};

/**
 * POST /apis/footwears/party-payments/:id/reverse
 */
exports.reverse = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    let responsePayload = null;

    await session.withTransaction(async () => {
      const id = String(req.params.id || "").trim();

      if (!isValidObjectId(id)) {
        throw new Error("Invalid payment id");
      }

      const payment = await PartyPayment.findById(id).session(session);

      if (!payment) {
        throw new Error("Payment not found");
      }

      if (up(payment.status) !== "ACTIVE") {
        throw new Error("Payment already reversed");
      }

      const party = await Party.findById(payment.partyId).session(session);

      if (!party) {
        throw new Error("Party not found");
      }

      const amount = num(payment.amount, 0);

      if (amount <= 0) {
        throw new Error("Invalid payment amount");
      }

      // Reversal of payment = DEBIT
      const balance = calcNextBalance(party.currentBalance, amount, 0);

      const ledgerDocs = await PartyLedger.create(
        [
          {
            partyId: payment.partyId,
            storeId: payment.storeId,

            txnDate: new Date(),
            txnType: "PAYMENT_REVERSED",

            debit: amount,
            credit: 0,

            balanceAfter: balance.balanceAfter,
            balanceType: balance.balanceType,

            ref: {
              paymentId: payment._id,
              documentNo: payment.referenceNo || String(payment._id),
              paymentMode: payment.paymentMode,
              note:
                String(req.body.reason || "").trim() ||
                `Reversal of payment ${payment.referenceNo || payment._id}`,
            },

            createdBy: req.user?._id || undefined,
          },
        ],
        { session }
      );

      payment.status = "REVERSED";
      payment.reversedAt = new Date();
      payment.reversedBy = req.user?._id || undefined;
      payment.reverseReason = String(req.body.reason || "").trim();

      await payment.save({ session });

      party.currentBalance = balance.signedBalance;
      party.totalReceivedAmount = Math.max(
        num(party.totalReceivedAmount, 0) - amount,
        0
      );

      await party.save({ session });

      responsePayload = {
        ok: true,
        message: "Payment reversed and ledger updated",
        data: {
          paymentId: payment._id,
          ledger: ledgerDocs[0],
          partyBalance: party.currentBalance,
        },
      };
    });

    return res.json(responsePayload);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: err.message || "Failed to reverse payment",
      error: err.message,
    });
  } finally {
    session.endSession();
  }
};

/**
 * DELETE /apis/footwears/party-payments/:id
 * Soft safety: only delete if payment has not posted ledger.
 */
exports.remove = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();

    if (!isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid payment id" });
    }

    const ledgerExists = await PartyLedger.exists({
      "ref.paymentId": id,
    });

    if (ledgerExists) {
      return res.status(400).json({
        ok: false,
        message: "Payment already posted to ledger. Reverse it instead.",
      });
    }

    const deleted = await PartyPayment.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ ok: false, message: "Payment not found" });
    }

    return res.json({
      ok: true,
      message: "Payment deleted",
      data: deleted,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to delete payment",
      error: err.message,
    });
  }
};