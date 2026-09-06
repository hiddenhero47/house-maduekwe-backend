const express = require("express");
const {
  getSalesTimeseries,
  getOrderStatusBreakdown,
  getCheckoutTypeBreakdown,
  getTopSellingItems,
  getPaymentSummary,
  getOverview,
} = require("../controllers/statsController");
const { secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");

const router = express.Router();

const adminOnly = secureRole([ROLE.ADMIN, ROLE.SUPER_ADMIN]);

router.get("/overview", adminOnly, getOverview);
router.get("/sales-timeseries", adminOnly, getSalesTimeseries);
router.get("/order-status-breakdown", adminOnly, getOrderStatusBreakdown);
router.get("/checkout-type-breakdown", adminOnly, getCheckoutTypeBreakdown);
router.get("/top-selling-items", adminOnly, getTopSellingItems);
router.get("/payment-summary", adminOnly, getPaymentSummary);

module.exports = router;
