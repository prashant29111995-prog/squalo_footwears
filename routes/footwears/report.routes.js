const express = require("express");
const router = express.Router();

const reportController = require("../../controller/footwears/report.controller");

//
// OLD REPORTS
//

router.get("/consumption", reportController.consumption);

router.get("/fast-movers", reportController.fastMovers);

router.get("/shrinkage", reportController.shrinkage);

//
// NEW DASHBOARD REPORTS
//

// top dashboard summary cards
router.get(
  "/dashboard-summary",
  reportController.dashboardSummary
);

// top selling articles
router.get(
  "/top-products",
  reportController.topProducts
);

// slow moving / dead stock
router.get(
  "/dead-stock",
  reportController.deadStock
);

// brand wise analytics
router.get(
  "/brand-analysis",
  reportController.brandAnalysis
);

// party outstanding / risk
router.get(
  "/party-risk",
  reportController.partyRisk
);

// collections / payment followup
router.get(
  "/collections",
  reportController.collections
);

// article profitability
router.get(
  "/profit-analysis",
  reportController.profitAnalysis
);

// media / catalogue readiness
router.get(
  "/catalogue",
  reportController.catalogue
);

router.get(
  "/ext-dis-sales/export",
  reportController.exportExtDiscountSales
);

router.get(
  "/ext-dis-sales",
  reportController.extDiscountSales
);

module.exports = router;