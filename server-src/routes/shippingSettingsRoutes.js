const express = require("express");
const {
  getSettings,
  updateSettings,
} = require("../controllers/shippingSettingsController");
const { secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");

const router = express.Router();

const adminOnly = secureRole([ROLE.ADMIN, ROLE.SUPER_ADMIN]);

router.get("/", adminOnly, getSettings);
router.put("/", adminOnly, updateSettings);

module.exports = router;
