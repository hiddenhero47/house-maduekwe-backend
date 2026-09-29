const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const { Order, ORDER_STATUS } = require("../models/orderModel");
const { Shipment, SHIPMENT_STATUS } = require("../models/shipmentModel");
const { getShippingSettings } = require("../helpers/shippingSettingsHelper");
const { getShippingProvider } = require("../providers/shippingProviders");
const { toKg, kgToGrams } = require("../helpers/packageWeightHelper");
const { applyShipmentStatusToOrder } = require("../helpers/shipmentHelper");
const {
  saveShipmentFile,
  readPrivateFile,
} = require("../helpers/privateFileManager");

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

// Shared by the manual admin route below and the auto-create-on-payment path
// in paymentController.js — one implementation, not two copies that drift.
// `actor` is { id, email } for an admin-triggered call, or null for an
// automatic one (no req.user to attribute it to).
const createShipmentForOrderCore = async ({ order, manualDetails, actor }) => {
  if (!SHIPPABLE_ORDER_STATUSES.includes(order.status)) {
    const error = new Error(
      `Cannot create a shipment for an order with status "${order.status}"`,
    );
    error.statusCode = 400;
    throw error;
  }

  const existingShipment = await Shipment.findOne({ order: order._id });

  if (existingShipment) {
    const error = new Error("A shipment already exists for this order");
    error.statusCode = 400;
    throw error;
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
    manualDetails, // optional { carrier, trackingNumber, trackingUrl }
  });

  // Pre-generated so the label file's folder name matches the Shipment
  // document's real _id, without a chicken-and-egg ordering problem.
  const shipmentId = new mongoose.Types.ObjectId();

  const files = [];

  if (result.label?.data) {
    const filename = `label.${result.label.format.toLowerCase()}`;

    const relativePath = saveShipmentFile({
      shipmentId,
      buffer: result.label.data,
      filename,
    });

    files.push({
      kind: "label",
      format: result.label.format,
      filename,
      path: relativePath,
      contentType: result.label.contentType,
      storedAt: new Date(),
    });
  }

  const shipment = await Shipment.create({
    _id: shipmentId,
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
    files,
    ...(actor ? { createdBy: actor } : {}),
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

  return { shipment, order };
};

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

  const { shipment } = await createShipmentForOrderCore({
    order,
    manualDetails: req.body,
    actor: { id: req.user._id, email: req.user.email },
  });

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

// @desc Get all shipments, filterable by status/date range
// @route GET /api/shipments
// @access Private (Admin)
const getAllShipments = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const { status, from, to } = req.query;

  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (from || to) {
    filter.createdAt = {};

    if (from) {
      const start = new Date(from);
      if (!isNaN(start)) {
        filter.createdAt.$gte = start;
      }
    }

    if (to) {
      const end = new Date(to);
      if (!isNaN(end)) {
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (Object.keys(filter.createdAt).length === 0) {
      delete filter.createdAt;
    }
  }

  const [shipments, total] = await Promise.all([
    Shipment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("order", "consigneesName status totalAmount currency")
      .lean(),

    Shipment.countDocuments(filter),
  ]);

  res.status(200).json({
    data: shipments,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
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

// @desc Stream a shipment's label file (view inline, or ?download=true)
// @route GET /api/shipments/orders/:id/label
// @access Private (Admin)
const getShipmentLabel = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error("Invalid order id");
  }

  const shipment = await Shipment.findOne({ order: id });

  if (!shipment) {
    res.status(404);
    throw new Error("No shipment found for this order");
  }

  let labelFile = shipment.files.find((f) => f.kind === "label");

  // Best-effort fallback only — we store the label ourselves at creation
  // time, this is just for the rare case that copy is missing. See
  // docs/shopify-ups-integration-plan.md ("Recovery vs. storage"). Only
  // attempted for providers that actually export recoverLabel — USPS
  // doesn't have a confirmed equivalent to UPS's Label Recovery endpoint.
  const recoveryProvider =
    !labelFile && shipment.trackingNumber
      ? getShippingProvider(shipment.provider)
      : null;

  if (recoveryProvider && typeof recoveryProvider.recoverLabel === "function") {
    const provider = recoveryProvider;
    const recovered = await provider.recoverLabel({
      trackingNumber: shipment.trackingNumber,
    });

    const filename = `label.${recovered.format.toLowerCase()}`;

    const relativePath = saveShipmentFile({
      shipmentId: shipment._id,
      buffer: recovered.data,
      filename,
    });

    labelFile = {
      kind: "label",
      format: recovered.format,
      filename,
      path: relativePath,
      contentType: recovered.contentType,
      storedAt: new Date(),
    };

    shipment.files.push(labelFile);
    await shipment.save();
  }

  if (!labelFile) {
    res.status(404);
    throw new Error("No label available for this shipment");
  }

  const buffer = readPrivateFile(labelFile.path);
  const disposition = req.query.download === "true" ? "attachment" : "inline";

  res.set("Content-Type", labelFile.contentType);
  res.set(
    "Content-Disposition",
    `${disposition}; filename="${labelFile.filename}"`,
  );
  res.send(buffer);
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

// @desc UPS tracking webhook — signature already verified upstream by
// middleware/shipmentWebhookMiddleware.js
// @route POST /api/shipments/ups/webhook
// @access Public (signature-verified)
const processUpsShipmentEvent = async (req, res) => {
  // ✅ Acknowledge immediately — same philosophy as the Stripe/Shopify
  // webhooks. UPS will retry on non-2xx / timeout.
  res.sendStatus(200);

  try {
    const { event } = req.webhook;

    // UPS's tracking webhook envelope shape is unconfirmed against live
    // traffic (no credentials yet — see docs/shopify-ups-integration-plan.md).
    // Best-effort extraction; adjust once a real payload is seen.
    const trackingNumber = event?.trackingNumber || event?.TrackingNumber;

    if (!trackingNumber) return;

    const shipment = await Shipment.findOne({
      provider: "ups",
      trackingNumber,
    });

    if (!shipment) return; // not one of ours

    // 🔁 ALWAYS re-query UPS directly — never trust the webhook payload
    // alone, same rule as the Stripe/Shopify webhooks.
    const provider = getShippingProvider("ups");

    const fresh = await provider.getShipment({
      providerShipmentId: trackingNumber,
    });

    shipment.status = fresh.status;
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
    // Already acknowledged the webhook — just log, don't let UPS retry
    // forever on an error that re-querying won't fix.
    console.error("[UPS_SHIPMENT_WEBHOOK] Failed to process:", err);
  }
};

// @desc USPS tracking webhook — signature already verified upstream by
// middleware/shipmentWebhookMiddleware.js
// @route POST /api/shipments/usps/webhook
// @access Public (signature-verified)
const processUspsShipmentEvent = async (req, res) => {
  // ✅ Acknowledge immediately — same philosophy as the other webhooks.
  res.sendStatus(200);

  try {
    const { event } = req.webhook;

    // USPS's Subscriptions-Tracking webhook envelope shape is unconfirmed
    // against live traffic (no credentials yet — see
    // docs/shopify-ups-integration-plan.md). Best-effort extraction; adjust
    // once a real payload is seen.
    const trackingNumber = event?.trackingNumber || event?.TrackingNumber;

    if (!trackingNumber) return;

    const shipment = await Shipment.findOne({
      provider: "usps",
      trackingNumber,
    });

    if (!shipment) return; // not one of ours

    // 🔁 ALWAYS re-query USPS directly — never trust the webhook payload
    // alone, same rule as every other webhook.
    const provider = getShippingProvider("usps");

    const fresh = await provider.getShipment({
      providerShipmentId: trackingNumber,
    });

    shipment.status = fresh.status;
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
    // Already acknowledged the webhook — just log, don't let USPS retry
    // forever on an error that re-querying won't fix.
    console.error("[USPS_SHIPMENT_WEBHOOK] Failed to process:", err);
  }
};

module.exports = {
  createShipmentForOrderCore,
  createShipmentForOrder,
  updateShipmentStatus,
  getShipmentForOrder,
  getAllShipments,
  getShipmentLabel,
  processShopifyShipmentEvent,
  processUpsShipmentEvent,
  processUspsShipmentEvent,
};
