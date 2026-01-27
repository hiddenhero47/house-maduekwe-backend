const express = require("express");
const {
  getMyPayments,
  getPayments,
} = require("../controllers/paymentController");
const { protect, secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");

const router = express.Router();

router.get("/me", protect, getMyPayments);
router.get("/", secureRole(ROLE.ADMIN, ROLE.SUPER_ADMIN), getPayments);

module.exports = router;
