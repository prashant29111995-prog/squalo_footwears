require("dotenv").config();
const mongoose = require("mongoose");

const config = require("../config/config");

const Bill = require("../models/footwears/Bill");
const Party = require("../models/footwears/Party");
const PartyPayment = require("../models/footwears/PartyPayment");
const PartyLedger = require("../models/footwears/PartyLedger");

const PARTY_ID = "69706ce9eb1f9b4c94d10f59";

const MONGO_URI =
  config.MONGODB_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGO_URI;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function up(v) {
  return String(v || "").trim().toUpperCase();
}

function getBillAmount(bill) {
  return num(
    bill?.totals?.netTotal ||
      bill?.totals?.subTotal ||
      bill?.netTotal ||
      bill?.amount ||
      0
  );
}

async function run() {
  if (!mongoose.Types.ObjectId.isValid(PARTY_ID)) {
    throw new Error("Invalid PARTY_ID");
  }

  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const party = await Party.findById(PARTY_ID);
  if (!party) throw new Error("Party not found");

  console.log("Rebuilding ledger for:", party.name);

  await PartyLedger.deleteMany({ partyId: PARTY_ID });

  const bills = await Bill.find({
    partyId: PARTY_ID,
    status: "FINAL",
  }).lean();

  const payments = await PartyPayment.find({
    partyId: PARTY_ID,
    status: "ACTIVE",
  }).lean();

  const txns = [];

  bills.forEach((b) => {
    const amount = getBillAmount(b);
    if (amount <= 0) return;

    txns.push({
      txnDate: b.billDate || b.createdAt || new Date(),
      createdAt: b.createdAt || b.billDate || new Date(),
      txnType: "SALE_BILL",
      debit: amount,
      credit: 0,
      storeId: b.storeId,
      ref: {
        billId: b._id,
        documentNo: up(b.billNo || b._id),
        note: `Sales Bill ${b.billNo || b._id}`,
      },
    });
  });

  payments.forEach((p) => {
    const amount = num(p.amount);
    if (amount <= 0) return;

    txns.push({
      txnDate: p.paymentDate || p.createdAt || new Date(),
      createdAt: p.createdAt || p.paymentDate || new Date(),
      txnType: "PAYMENT_RECEIVED",
      debit: 0,
      credit: amount,
      storeId: p.storeId,
      ref: {
        paymentId: p._id,
        documentNo: up(p.referenceNo || p._id),
        paymentMode: up(p.paymentMode || "CASH"),
        note: p.note || "Payment received",
      },
    });
  });

  txns.sort((a, b) => {
    const d1 = new Date(a.txnDate).getTime();
    const d2 = new Date(b.txnDate).getTime();

    if (d1 !== d2) return d1 - d2;

    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  let runningBalance = 0;
  const ledgerRows = [];

  txns.forEach((t) => {
    runningBalance += num(t.debit);
    runningBalance -= num(t.credit);

    ledgerRows.push({
      partyId: PARTY_ID,
      storeId: t.storeId,

      txnDate: t.txnDate,
      txnType: t.txnType,

      debit: t.debit,
      credit: t.credit,

      balanceAfter: Math.abs(runningBalance),
      balanceType: runningBalance >= 0 ? "DR" : "CR",

      ref: t.ref,
    });
  });

  if (ledgerRows.length) {
    await PartyLedger.insertMany(ledgerRows);
  }

  party.currentBalance = runningBalance;
  party.totalSalesAmount = bills.reduce((s, b) => s + getBillAmount(b), 0);
  party.totalReceivedAmount = payments.reduce((s, p) => s + num(p.amount), 0);

  const lastBill = bills
    .sort((a, b) => new Date(b.billDate) - new Date(a.billDate))[0];

  const lastPayment = payments
    .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))[0];

  party.lastSaleDate = lastBill?.billDate || party.lastSaleDate;
  party.lastPaymentDate = lastPayment?.paymentDate || party.lastPaymentDate;

  await party.save();

  console.log("Ledger rebuilt successfully");
  console.log({
    party: party.name,
    bills: bills.length,
    payments: payments.length,
    ledgerRows: ledgerRows.length,
    finalBalance: runningBalance,
    balanceType: runningBalance >= 0 ? "DR" : "CR",
  });

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (e) {}
  process.exit(1);
});