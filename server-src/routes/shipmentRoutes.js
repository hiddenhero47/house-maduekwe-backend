const express = require("express");
const {
  createShipmentForOrder,
  updateShipmentStatus,
  getShipmentForOrder,
  processShopifyShipmentEvent,
} = require("../controllers/shipmentController");
const verifyShipmentWebhook = require("../middleware/shipmentWebhookMiddleware");
const { secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");

const router = express.Router();

const adminOnly = secureRole([ROLE.ADMIN, ROLE.SUPER_ADMIN]);

router.post("/orders/:id", adminOnly, createShipmentForOrder);
router.get("/orders/:id", adminOnly, getShipmentForOrder);
router.patch("/orders/:id/status", adminOnly, updateShipmentStatus);

// Raw-body parsing for this exact path is registered in server.js, same
// pattern as /api/payment/stripe/callback.
router.post(
  "/shopify/webhook",
  verifyShipmentWebhook,
  processShopifyShipmentEvent,
);

module.exports = router;
