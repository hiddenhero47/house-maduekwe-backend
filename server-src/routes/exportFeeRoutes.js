const express = require("express");
const router = express.Router();

const {
  createExportFee,
  getExportFees,
  updateExportFee,
  disableExportFee,
  deleteExportFeePermanently,
} = require("../controllers/exportFeeController");

const { secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");
const verify2fa = require("../middleware/verify2faMiddleware");

router.use(secureRole(ROLE.SUPER_ADMIN));

router.post("/", createExportFee);
router.get("/", getExportFees);
router.put("/:id", updateExportFee);
router.patch("/:id/disable", disableExportFee);

// 🔐 2FA required here
router.delete(
  "/:id/permanent",
  verify2fa(true),
  deleteExportFeePermanently
);

module.exports = router;
