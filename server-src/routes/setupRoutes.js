const express = require("express");
const router = express.Router();
const { runSetupScripts, clearCart } = require("../controllers/setupController");
const { timeWindowGuard } = require("../middleware/timeMiddleware");

// Example: allow only on 2025-10-01 for 24 hours
router.post(
  "/get-started",
  timeWindowGuard("2026-04-05T00:00:00Z", 24),
  runSetupScripts,
);

router.post(
  "/clear-cart",
  timeWindowGuard("2026-05-08T00:00:00Z", 24),
  clearCart,
);

module.exports = router;
