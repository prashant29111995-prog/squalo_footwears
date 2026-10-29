const express = require("express");

const storeRoutes = require("./store.routes");
const articleRoutes = require("./article.routes");
const skuRoutes = require("./sku.routes");
const auditRoutes = require("./audit.routes");
const ledgerRoutes = require("./stockLedger.routes");
const reportRoutes = require("./report.routes");
const partyRoutes = require("./party.routes");
const billRoutes = require("./bill.routes");
const assemblyRoutes = require("./storeLocation.routes");
const stockinRoutes = require("./stockIn.routes");
const partyLedgerRoutes = require("./partyLedger.routes");
const partyPaymentRoutes = require("./partyPayment.routes");
const articleMediaRoutes = require("./articleMedia.routes");

const router = express.Router();

// Versioned API root
router.use("/stores", storeRoutes);
router.use("/articles", articleRoutes);
router.use("/skus", skuRoutes);
router.use("/audits", auditRoutes);
router.use("/stock-ledger", ledgerRoutes);
router.use("/reports", reportRoutes);
router.use("/parties", partyRoutes);
router.use("/party-ledger", partyLedgerRoutes);
router.use("/party-payments", partyPaymentRoutes);
router.use("/bills", billRoutes);
router.use("/assembly", assemblyRoutes);
router.use("/stockin", stockinRoutes);
router.use("/article-media", articleMediaRoutes);

module.exports = router;