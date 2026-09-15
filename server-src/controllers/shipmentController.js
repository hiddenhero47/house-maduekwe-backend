const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const { Order, ORDER_STATUS } = require("../models/orderModel");
const { Shipment, SHIPMENT_STATUS } = require("../models/shipmentModel");
const { getShippingSettings } = require("../helpers/shippingSettingsHelper");
const { getShippingProvider } = require("../providers/shippingProviders");
const { toKg, kgToGrams } = require("../helpers/packageWeightHelper");
const { applyShipmentStatusToOrder } = require("../helpers/shipmentHelper");

const SHIPPABLE_ORDER_STATUSES = [ORDER_STATUS.PAID, ORDER_STATUS.PROCESSING];

const buildProviderItems = (items = []) =>
  items.map((item) => ({
    name: item.shopItem?.name,
    unitPrice: item.shopItem?.price,
    quantity: item.quantity,
    weightGrams: kgToGrams(
      toKg(item.shopItem?.weight?.value, item.shopItem?.weight?.unit),
    ),
  }));

// @desc Create a shipment for a paid order (manual, admin-triggered)
// @route POST /api/shipments/orders/:id
// @access Private (Admin)
const createShipmentForOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error("Invalid order id");
  }

  const order = await Order.findById(id);

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (!SHIPPABLE_ORDER_STATUSES.includes(order.status)) {
    res.status(400);
    throw new Error(
      `Cannot create a shipment for an order with status "${order.status}"`,
    );
  }

  const existingShipment = await Shipment.findOne({ order: order._id });

  if (existingShipment) {
    res.status(400);
    throw new Error("A shipment already exists for this order");
  }

  const settings = await getShippingSettings();

  // Use the provider actually quoted at checkout, not whatever's active now.
  const activeProvider = order.shippedBy?.toLowerCase();
  const provider = getShippingProvider(activeProvider);

  const result = await provider.createShipment({
    order,
    items: buildProviderItems(order.items),
    destination: order.address,
    origin: settings.originAddress,
    manualDetails: req.body, // optional { carrier, trackingNumber, trackingUrl }
  });

  const shipment = await Shipment.create({
    order: order._id,
    provider: activeProvider,
    providerShipmentId: result.providerShipmentId,
    carrier: result.carrier,
    trackingNumber: result.trackingNumber,
    trackingUrl: result.trackingUrl,
    status: result.status || SHIPMENT_STATUS.LABEL_CREATED,
    shippingCost: result.shippingCost,
    currency: result.currency,
    shippedAt: result.trackingNumber ? new Date() : undefined,
    raw: result.raw,
    createdBy: {
      id: req.user._id,
      email: req.user.email,
    },
  });

  // Keep Shopify's order id around for later getShipment polling.
  if (result.shopifyOrderId) {
    order.extraInfo = {
      ...(order.extraInfo || {}),
      shopifyOrderId: result.shopifyOrderId,
    };
    await order.save();
  }

  await applyShipmentStatusToOrder({ order, shipment });

  res.status(201).json({ shipment, order });
});

// @desc Manually update a shipment's status; "delivered" also flips the order
// @route PATCH /api/shipments/orders/:id/status
// @access Private (Admin)
const updateShipmentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error("Invalid order id");
  }

  if (!Object.values(SHIPMENT_STATUS).includes(status)) {
    res.status(400);
    throw new Error("Invalid shipment status");
  }

  const shipment = await Shipment.findOne({ order: id });

  if (!shipment) {
    res.status(404);
    throw new Error("No shipment found for this order");
  }

  shipment.status = status;

  if (status === SHIPMENT_STATUS.DELIVERED) {
    shipment.deliveredAt = new Date();
  }

  await shipment.save();

  const order = await Order.findById(id);

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  await applyShipmentStatusToOrder({ order, shipment });

  res.status(200).json({ shipment, order });
});

// @desc Get the shipment for an order
// @route GET /api/shipments/orders/:id
// @access Private (Admin)
const getShipmentForOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error("Invalid order id");
  }

  const shipment = await Shipment.findOne({ order: id }).lean();

  if (!shipment) {
    res.status(404);
    throw new Error("No shipment found for this order");
  }

  res.status(200).json(shipment);
});

// @desc Shopify fulfillment webhook — signature already verified upstream
// by middleware/shipmentWebhookMiddleware.js
// @route POST /api/shipments/shopify/webhook
// @access Public (signature-verified)
const processShopifyShipmentEvent = async (req, res) => {
  // ✅ Acknowledge immediately — same philosophy as the Stripe webhook in
  // paymentController.js. Shopify will retry on non-2xx / timeout.
  res.sendStatus(200);

  try {
    const { event, topic } = req.webhook;

    if (!topic || !topic.startsWith("fulfillments/")) return;

    const fulfillmentId = String(event.id);
    const shopifyOrderId = String(event.order_id);

    const shipment = await Shipment.findOne({
      provider: "shopify",
      providerShipmentId: fulfillmentId,
    });

    if (!shipment) return; // not one of ours (or not created via this flow)

    // 🔁 ALWAYS re-query Shopify directly — never trust the webhook payload
    // alone, same rule as the Stripe webhook.
    const provider = getShippingProvider("shopify");

    const fresh = await provider.getShipment({
      providerShipmentId: fulfillmentId,
      shopifyOrderId,
    });

    shipment.status = fresh.status;
    shipment.trackingNumber = fresh.trackingNumber || shipment.trackingNumber;
    shipment.trackingUrl = fresh.trackingUrl || shipment.trackingUrl;
    shipment.raw = fresh.raw;

    if (fresh.status === SHIPMENT_STATUS.DELIVERED) {
      shipment.deliveredAt = new Date();
    }

    await shipment.save();

    const order = await Order.findById(shipment.order);
    if (!order) return;

    await applyShipmentStatusToOrder({ order, shipment });
  } catch (err) {
    // Already acknowledged the webhook — just log, don't let Shopify retry
    // forever on an error that re-querying won't fix.
    console.error("[SHOPIFY_SHIPMENT_WEBHOOK] Failed to process:", err);
  }
};

module.exports = {
  createShipmentForOrder,
  updateShipmentStatus,
  getShipmentForOrder,
  processShopifyShipmentEvent,
};
