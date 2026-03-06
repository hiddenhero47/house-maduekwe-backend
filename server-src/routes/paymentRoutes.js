const express = require("express");
const {
  getMyPayments,
  getPayments,
  processStripeEvent,
  createStripeIntent,
} = require("../controllers/paymentController");
const { protect, secureRole } = require("../middleware/authMiddleware");
const verifyWebhook = require("../middleware/webhookMiddleware");
const { ROLE } = require("../models/userModel");

const router = express.Router();

router.get("/me", protect, getMyPayments);
router.get("/", secureRole(ROLE.ADMIN, ROLE.SUPER_ADMIN), getPayments);
router.post("/stripe-intent", protect, createStripeIntent);
router.post("/:provider/callback", verifyWebhook, processStripeEvent);

module.exports = router;
