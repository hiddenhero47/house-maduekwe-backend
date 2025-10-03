const express = require("express");
const router = express.Router();
const { runSetupScripts } = require("../controllers/setupController");
const { timeWindowGuard } = require("../middleware/timeMiddleware");

// Example: allow only on 2025-10-01 for 4 hours
router.post(
  "/setup",
  timeWindowGuard("2025-10-01T00:00:00Z", 4),
  runSetupScripts
);

module.exports = router;
