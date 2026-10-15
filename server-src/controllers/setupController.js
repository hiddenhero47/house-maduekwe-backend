const { ensureAdminExists } = require("../helpers/ensureAdmin");
const {
  ensureStripePaymentProvider,
  ensureUSExportFee,
  ensureShippingSettings,
} = require("../helpers/appSetup");
const asyncHandler = require("express-async-handler");
const { User } = require("../models/userModel");
const crypto = require("crypto");
const { Payment, PAYMENT_STATUS } = require("../models/paymentModel");
const { Order, ORDER_STATUS } = require("../models/orderModel");
const { Shipment } = require("../models/shipmentModel");
const { deleteShipmentFiles } = require("../helpers/privateFileManager");
const { getUspsClient, USPS_MAILER_ID } = require("../config/usps");

// @desc    Start up app
// @route   POST /api/setup/get-started
// @access  Private (protect this route!)
const runSetupScripts = async (req, res) => {
  const logs = [];

  // Add setup tasks here
  logs.push(await ensureAdminExists());
  logs.push(await ensureStripePaymentProvider());
  logs.push(await ensureUSExportFee());
  logs.push(await ensureShippingSettings());
  // later: logs.push(await anotherSetupTask());

  res.json({
    success: true,
    timestamp: new Date(),
    results: logs,
  });
};

// @desc    Clear orders, payments, and shipments — also removes the private
//          label files on disk for any shipment that has one, so nothing
//          orphaned is left under server-src/private/
// @route   DELETE /api/setup/clear-orders-payments-shipments
// @access  Private/Admin (time-window guarded, see setupRoutes)
const clearOrdersPaymentsAndShipments = asyncHandler(async (req, res) => {
  const { orderIds, paymentIds, shipmentIds } = req.body;

  const hasSelection =
    (Array.isArray(orderIds) && orderIds.length > 0) ||
    (Array.isArray(paymentIds) && paymentIds.length > 0) ||
    (Array.isArray(shipmentIds) && shipmentIds.length > 0);

  if (hasSelection) {
    if (Array.isArray(shipmentIds) && shipmentIds.length > 0) {
      const shipments = await Shipment.find(
        { _id: { $in: shipmentIds } },
        "_id files",
      ).lean();

      shipments
        .filter((s) => s.files?.length)
        .forEach((s) => deleteShipmentFiles(s._id));

      await Shipment.deleteMany({ _id: { $in: shipmentIds } });
    }

    if (Array.isArray(orderIds) && orderIds.length > 0) {
      await Order.deleteMany({ _id: { $in: orderIds } });
    }

    if (Array.isArray(paymentIds) && paymentIds.length > 0) {
      await Payment.deleteMany({ _id: { $in: paymentIds } });
    }

    return res.json({
      message: "Selected orders, payments, and/or shipments cleared",
    });
  }

  // No ids passed -> clear everything
  const allShipments = await Shipment.find({}, "_id files").lean();
  const shipmentsWithFiles = allShipments.filter((s) => s.files?.length);

  shipmentsWithFiles.forEach((s) => deleteShipmentFiles(s._id));

  await Promise.all([
    Order.deleteMany({}),
    Payment.deleteMany({}),
    Shipment.deleteMany({}),
  ]);

  res.json({
    message: "All orders, payments, and shipments cleared",
    labelFilesRemovedFor: shipmentsWithFiles.length,
  });
});

// @desc    Register (or re-register) House Maduekwe's USPS tracking webhook
//          subscription — once accepted, USPS pushes package status
//          updates to processUspsShipmentEvent instead of us polling.
// @route   POST /api/setup/register-usps-webhook
// @access  Private/Admin (time-window guarded, see setupRoutes)
//
// Matches USPS's "Subscriptions - Tracking 3.2" spec
// (docs/subscriptions-tracking-v3r2_6.yaml): POST {base}/subscriptions-
// tracking/v3r2/subscriptions, with `secret` required to be exactly 32
// characters and `adminNotification` a required array of {email}.
const registerUspsWebhook = asyncHandler(async (req, res) => {
  const { listenerURL } = req.body;

  if (!listenerURL || !listenerURL.startsWith("https://")) {
    res.status(400);
    throw new Error("A valid https:// listenerURL is required");
  }

  const secret = process.env.USPS_WEBHOOK_SECRET;
  if (!secret || secret.length !== 32) {
    res.status(400);
    throw new Error(
      `USPS_WEBHOOK_SECRET must be exactly 32 characters (currently ${
        secret ? secret.length : 0
      }) — USPS rejects any other length.`,
    );
  }

  const client = await getUspsClient();

  try {
    const { data } = await client.post(
      "/subscriptions-tracking/v3r2/subscriptions",
      {
        listenerURL,
        secret,
        // Not in the downloaded OpenAPI spec at all, but USPS's live
        // validator rejects a request without it ("Subscriptions must have
        // a correlationId field") — a unique id per subscription request.
        correlationId: crypto.randomUUID(),
        adminNotification: [
          {
            email: "support.housemaduekwe@gmail.com",
          },
        ],
        filterProperties: {
          MID: USPS_MAILER_ID,
          trackingEventTypes: ["ALL_UPDATES"],
        },
      },
    );

    res.json({
      success: true,
      message: "USPS accepted the subscription",
      result: data,
    });
  } catch (err) {
    const error = new Error(
      "USPS rejected the subscription request — see data for the raw response.",
    );
    error.statusCode = err.response?.status || 502;
    error.data = err.response?.data || err.message;
    throw error;
  }
});

module.exports = {
  runSetupScripts,
  clearOrdersPaymentsAndShipments,
  registerUspsWebhook,
};
