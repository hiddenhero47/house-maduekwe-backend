const { ensureAdminExists } = require("../helpers/ensureAdmin");
const {
  ensureStripePaymentProvider,
  ensureUSExportFee,
} = require("../helpers/appSetup");
const { User } = require("../models/userModel");


// @desc    Start up app
// @route   POST /api/setup/get-started
// @access  Private (protect this route!)
const runSetupScripts = async (req, res) => {
  const logs = [];

  // Add setup tasks here
  logs.push(await ensureAdminExists());
  logs.push(await ensureStripePaymentProvider());
  logs.push(await ensureUSExportFee());
  // later: logs.push(await anotherSetupTask());

  res.json({
    success: true,
    timestamp: new Date(),
    results: logs,
  });
};

// @desc    Backfill users with tokenCache & verified
// @route   POST /api/setup/backfill-users
// @access  Private (protect this route!)
const backfillUserFields = async (req, res) => {
  try {
    const [tokenCacheResult, verifiedResult] = await Promise.all([
      User.updateMany(
        { tokenCache: { $exists: false } },
        { $set: { tokenCache: {} } }
      ),
      User.updateMany(
        { verified: { $exists: false } },
        { $set: { verified: true } } // change to false if needed
      ),
    ]);

    res.status(200).json({
      success: true,
      message: "User fields backfilled successfully",
      results: {
        tokenCacheUpdated: tokenCacheResult.modifiedCount,
        verifiedUpdated: verifiedResult.modifiedCount,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Backfill error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to backfill user fields",
      error: error.message,
    });
  }
};

module.exports = { runSetupScripts, backfillUserFields };
