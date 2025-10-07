const express = require("express");
const router = express.Router();
const { runSetupScripts } = require("../controllers/setupController");
const { timeWindowGuard } = require("../middleware/timeMiddleware");

// Example: allow only on 2025-10-01 for 24 hours
router.post(
  "/get-started",
  timeWindowGuard("2025-10-07T00:00:00Z", 24),
  runSetupScripts
);

module.exports = router;
