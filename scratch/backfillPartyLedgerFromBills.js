require("dotenv").config();
const mongoose = require("mongoose");

const config = require("../config/config");

const Bill = require("../models/footwears/Bill");
const Party = require("../models/footwears/Party");
const PartyLedger = require("../models/footwears/PartyLedger");

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
  if (!MONGO_URI) {
    throw new Error("MongoDB URI missing. Check config.MONGODB_URI");
  }

  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  console.log("DB connected");
  console.log("Backfilling FINAL sale bills into PartyLedger...");

  const bills = await Bill.find({ status: "FINAL" })
    .sort({ billDate: 1, createdAt: 1 })
    .lean();

  let created = 0;
  let skipped = 0;
  let missingParty = 0;
  let invalidAmount = 0;

  for (const bill of bills) {
    const exists = await PartyLedger.findOne({
      "ref.billId": bill._id,
      txnType: "SALE_BILL",
    });

    if (exists) {
      skipped++;
      continue;
    }

    const party = await Party.findById(bill.partyId);

    if (!party) {
      missingParty++;
      console.log("Missing party for bill:", bill.billNo || bill._id);
      continue;
    }

    const billAmount = getBillAmount(bill);

    if (billAmount <= 0) {
      invalidAmount++;
      console.log("Invalid amount for bill:", bill.billNo || bill._id);
      continue;
    }

    const currentBalance = num(party.currentBalance);
    const signedBalance = currentBalance + billAmount;

    await PartyLedger.create({
      partyId: bill.partyId,
      storeId: bill.storeId,

      txnDate: bill.billDate || bill.createdAt || new Date(),
      txnType: "SALE_BILL",

      debit: billAmount,
      credit: 0,

      balanceAfter: Math.abs(signedBalance),
      balanceType: signedBalance >= 0 ? "DR" : "CR",

      ref: {
        billId: bill._id,
        documentNo: up(bill.billNo || bill._id),
        note: `Backfilled Sales Bill ${bill.billNo || bill._id}`,
      },
    });

    party.currentBalance = signedBalance;
    party.totalSalesAmount = num(party.totalSalesAmount) + billAmount;
    party.lastSaleDate = bill.billDate || bill.createdAt || party.lastSaleDate;

    await party.save();

    created++;

    console.log(
      `Created ledger: Bill ${bill.billNo || bill._id} | Party ${party.name} | Amount ₹${billAmount}`
    );
  }

  console.log("Backfill completed");
  console.log({
    totalBills: bills.length,
    created,
    skipped,
    missingParty,
    invalidAmount,
  });

  await mongoose.disconnect();
  console.log("DB disconnected");
}

run().catch(async (err) => {
  console.error("Backfill failed:", err.message);
  console.error(err);

  try {
    await mongoose.disconnect();
  } catch (e) {}

  process.exit(1);
});