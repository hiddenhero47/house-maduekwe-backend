const { ORDER_STATUS, CHECKOUT_TYPES } = require("../models/orderModel");
const { SHIPMENT_STATUS } = require("../models/shipmentModel");
const { sendTemplatedEmail } = require("./emailSender");

// Shipment statuses at which the customer-facing Order should flip to
// SHIPPED (as soon as we actually have a carrier + tracking number).
const SHIPPED_TRIGGER_STATUSES = [
  SHIPMENT_STATUS.LABEL_CREATED,
  SHIPMENT_STATUS.PICKED_UP,
  SHIPMENT_STATUS.IN_TRANSIT,
  SHIPMENT_STATUS.OUT_FOR_DELIVERY,
  SHIPMENT_STATUS.DELIVERED,
];

const sendOrderShippedEmail = async (order) => {
  if (!order.userEmail || !order.shippingDetails) return;

  const refURL =
    order.checkoutType === CHECKOUT_TYPES.GUEST
      ? `/guest-order?email=${encodeURIComponent(order.userEmail)}&orderId=${order._id}`
      : `/settings?currentSettings=orders&orderId=${order._id}`;

  await sendTemplatedEmail({
    to: order.userEmail,
    subject: "Your Order Has Been Shipped 📦",
    template: "orderShipped",
    variables: {
      name: order.userEmail,
      orderId: order._id,
      company: order.shippingDetails.company,
      trackingNumber: order.shippingDetails.trackingNumber,
      year: new Date().getFullYear(),
      orderUrl: `${process.env.FRONTEND_URL}${refURL}`,
    },
  });
};

// Applies a Shipment's current state onto its Order — flips Order.status to
// SHIPPED once a carrier + tracking number actually exist, and to DELIVERED
// once the shipment is delivered. Used by both the manual admin
// "create shipment" action and the provider webhook handler, so status
// progression behaves identically regardless of which one drove it.
//
// Order.shippingDetails requires both company and trackingNumber (see
// orderModel.js validator) — a shipment created without a tracking number
// yet (e.g. label pending) intentionally does NOT flip the order yet.
const applyShipmentStatusToOrder = async ({ order, shipment, sendEmail = true }) => {
  const alreadyShippedOrFurther =
    order.status === ORDER_STATUS.SHIPPED ||
    order.status === ORDER_STATUS.DELIVERED;

  if (
    !alreadyShippedOrFurther &&
    shipment.trackingNumber &&
    shipment.carrier &&
    SHIPPED_TRIGGER_STATUSES.includes(shipment.status)
  ) {
    order.status = ORDER_STATUS.SHIPPED;
    order.shippingDetails = {
      company: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
      shippedAt: shipment.shippedAt || new Date(),
    };

    await order.save();

    if (sendEmail) {
      await sendOrderShippedEmail(order);
    }

    return true;
  }

  if (
    shipment.status === SHIPMENT_STATUS.DELIVERED &&
    order.status !== ORDER_STATUS.DELIVERED
  ) {
    order.status = ORDER_STATUS.DELIVERED;
    await order.save();
    return true;
  }

  return false;
};

module.exports = { applyShipmentStatusToOrder, sendOrderShippedEmail };
