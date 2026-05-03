const express = require("express");
const router = express.Router();
const { runSetupScripts, backfillUserFields } = require("../controllers/setupController");
const { timeWindowGuard } = require("../middleware/timeMiddleware");

// Example: allow only on 2025-10-01 for 24 hours
router.post(
  "/get-started",
  timeWindowGuard("2026-04-05T00:00:00Z", 24),
  runSetupScripts
);

router.post(
  "/backfill-users",
  timeWindowGuard("2026-04-05T00:00:00Z", 24),
  backfillUserFields
);

module.exports = router;
