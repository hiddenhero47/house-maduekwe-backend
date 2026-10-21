const express = require("express");
const router = express.Router();
const {
  runSetupScripts,
  clearOrdersPaymentsAndShipments,
  registerUspsWebhook,
} = require("../controllers/setupController");
const { timeWindowGuard } = require("../middleware/timeMiddleware");
const { protect, secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");

// Example: allow only on 2026-10-01 for 24 hours
router.post(
  "/get-started",
  timeWindowGuard("2026-04-05T00:00:00Z", 24),
  runSetupScripts,
);

router.delete(
  "/clear-orders-payments-shipments",
  timeWindowGuard("2026-10-15T00:00:00Z", 24),
  clearOrdersPaymentsAndShipments,
);

router.post(
  "/register-usps-webhook",
  timeWindowGuard("2026-10-21T00:00:00Z", 24),
  registerUspsWebhook,
);

module.exports = router;
