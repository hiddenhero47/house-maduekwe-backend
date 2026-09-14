const { shopifyAdminClient } = require("../../config/shopify");
const internalProvider = require("./internalProvider");

// ⚠️ IMPORTANT DESIGN NOTE — read before changing this file.
//
// Shopify's real-time rate-shopping APIs (Storefront/Cart) can only quote
// shipping for products that exist in THAT Shopify store's own catalog.
// House Maduekwe's catalog lives in MongoDB and is not synced to Shopify —
// syncing it would be a real project of its own and is out of scope here.
//
// So in this first pass, "shopify" as the active shipping provider means:
// the CUSTOMER-FACING quote still comes from the Internal/ExportFee rate
// table (identical numbers to what "internal" would charge), but once an
// order is PAID, the actual physical shipment — order creation, fulfillment,
// label/tracking — is created and tracked through Shopify's Admin API.
// That's the part Shopify is actually good at, and the part this adapter
// implements for real. See docs/shipping-provider-architecture-plan.md.
//
// This MUST be verified against a real Shopify development store (doc §16)
// before relying on it in production — whether label generation actually
// works for your fulfillment origin depends on your Shopify plan/region
// (doc §7), which cannot be confirmed from here.
const getQuote = async (data) => internalProvider.getQuote(data);

const buildLineItems = (items = []) =>
  items.map((item) => ({
    title: item.name,
    price: item.unitPrice,
    quantity: item.quantity,
    requires_shipping: true,
    // Shopify's custom-line-item weight field (grams) — used by whatever
    // shipping/label app the store has configured once fulfillment runs.
    grams: item.weightGrams || 0,
  }));

// Creates a real Order in Shopify (via custom line items — no product sync
// needed) and immediately requests a Fulfillment against it. This mirror
// order is NOT House Maduekwe's source of truth — it exists purely so
// Shopify can produce a label/tracking number and send us webhook events.
const createShipment = async ({ order, items, destination, manualDetails }) => {
  const orderPayload = {
    order: {
      line_items: buildLineItems(items),
      shipping_address: destination
        ? {
            address1: destination.fullAddress,
            city: destination.city,
            province: destination.state,
            country: destination.country,
            zip: destination.zipCode,
          }
        : undefined,
      financial_status: "paid", // House Maduekwe already collected payment
      note: `House Maduekwe order ${order._id}`,
      tags: "house-maduekwe",
      send_receipt: false,
      send_fulfillment_receipt: false,
    },
  };

  const { data: orderRes } = await shopifyAdminClient.post(
    "/orders.json",
    orderPayload,
  );

  const shopifyOrderId = orderRes.order.id;

  const fulfillmentPayload = {
    fulfillment: {
      notify_customer: false,
      tracking_info: manualDetails?.trackingNumber
        ? {
            number: manualDetails.trackingNumber,
            url: manualDetails.trackingUrl,
            company: manualDetails.carrier,
          }
        : undefined,
    },
  };

  const { data: fulfillmentRes } = await shopifyAdminClient.post(
    `/orders/${shopifyOrderId}/fulfillments.json`,
    fulfillmentPayload,
  );

  const fulfillment = fulfillmentRes.fulfillment;

  return {
    providerShipmentId: String(fulfillment.id),
    shopifyOrderId: String(shopifyOrderId), // needed later to poll/verify this fulfillment
    carrier: fulfillment.tracking_company || manualDetails?.carrier || null,
    trackingNumber:
      fulfillment.tracking_number || manualDetails?.trackingNumber || null,
    trackingUrl: fulfillment.tracking_url || manualDetails?.trackingUrl || null,
    status: mapShopifyFulfillmentStatus(
      fulfillment.shipment_status || fulfillment.status,
    ),
    shippingCost: null, // Shopify doesn't return carrier cost on fulfillment creation
    currency: null,
    raw: { order: orderRes.order, fulfillment },
  };
};

// Re-queries Shopify directly (never trusts a webhook payload alone) — same
// philosophy as paymentController.js's Stripe webhook handling.
const getShipment = async ({ providerShipmentId, shopifyOrderId }) => {
  if (!providerShipmentId || !shopifyOrderId) {
    throw new Error(
      "shopifyOrderId and providerShipmentId (fulfillment id) are required",
    );
  }

  const { data } = await shopifyAdminClient.get(
    `/orders/${shopifyOrderId}/fulfillments/${providerShipmentId}.json`,
  );

  const fulfillment = data.fulfillment;

  return {
    status: mapShopifyFulfillmentStatus(
      fulfillment.shipment_status || fulfillment.status,
    ),
    trackingNumber: fulfillment.tracking_number || null,
    trackingUrl: fulfillment.tracking_url || null,
    raw: fulfillment,
  };
};

// Translates Shopify's fulfillment/shipment_status values into House
// Maduekwe's own SHIPMENT_STATUS enum — provider event names never leak
// past this function (doc §12).
const mapShopifyFulfillmentStatus = (shopifyStatus) => {
  const map = {
    label_purchased: "label_created",
    label_printed: "label_created",
    picked_up: "picked_up",
    in_transit: "in_transit",
    out_for_delivery: "out_for_delivery",
    delivered: "delivered",
    failure: "failed",
    cancelled: "cancelled",
  };

  return map[shopifyStatus] || "pending";
};

module.exports = {
  name: "shopify",
  getQuote,
  createShipment,
  getShipment,
  mapShopifyFulfillmentStatus,
};
