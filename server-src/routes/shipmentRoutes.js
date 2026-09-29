const express = require("express");
const {
  createShipmentForOrder,
  updateShipmentStatus,
  getShipmentForOrder,
  getAllShipments,
  getShipmentLabel,
  processShopifyShipmentEvent,
  processUpsShipmentEvent,
  processUspsShipmentEvent,
} = require("../controllers/shipmentController");
const verifyShipmentWebhook = require("../middleware/shipmentWebhookMiddleware");
const { secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");

const router = express.Router();

const adminOnly = secureRole([ROLE.ADMIN, ROLE.SUPER_ADMIN]);

router.get("/", adminOnly, getAllShipments);
router.post("/orders/:id", adminOnly, createShipmentForOrder);
router.get("/orders/:id", adminOnly, getShipmentForOrder);
router.get("/orders/:id/label", adminOnly, getShipmentLabel);
router.patch("/orders/:id/status", adminOnly, updateShipmentStatus);

// Raw-body parsing for these exact paths is registered in app.js, same
// pattern as /api/payment/stripe/callback.
//
// :provider is required, not cosmetic — verifyShipmentWebhook reads
// req.params.provider to know which signature scheme to verify. Two static
// routes here would leave that always undefined (this was in fact the case
// before — the shopify/webhook route always 400'd, just never caught since
// nothing exercised it).
const webhookHandlers = {
  shopify: processShopifyShipmentEvent,
  ups: processUpsShipmentEvent,
  usps: processUspsShipmentEvent,
};

router.post("/:provider/webhook", verifyShipmentWebhook, (req, res) => {
  const handler = webhookHandlers[req.params.provider];

  if (!handler) {
    return res.status(400).json({ message: "Unsupported webhook provider" });
  }

  return handler(req, res);
});

module.exports = router;
