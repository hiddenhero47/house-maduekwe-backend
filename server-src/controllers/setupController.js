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
const { Package } = require("../models/packageModel");
const { ShopItem } = require("../models/shopItemModel");
const { Address } = require("../models/addressModel");
const { ShippingSettings } = require("../models/shippingSettingsModel");
const { ExportFee } = require("../models/exportFeeModel");
const {
  getStatesOfCountry,
  isValidStateCode,
} = require("../helpers/countryReference");

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
      }).`,
    );
  }

  const client = await getUspsClient();
  const correlationId = crypto.randomUUID();

  const requestBody = {
    listenerURL,
    secret,
    correlationId,
    CorrelationId: correlationId,
    adminNotification: [{ email: "support.housemaduekwe@gmail.com" }],
    filterProperties: {
      MID: USPS_MAILER_ID,
      trackingEventTypes: ["ALL_UPDATES"],
    },
  };

  try {
    const { data } = await client.post(
      "/subscriptions-tracking/v3r2/subscriptions",
      requestBody,
      {
        headers: {
          correlationId,
          "X-Correlation-Id": correlationId,
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
    error.data = {
      uspsResponse: err.response?.data || err.message,
      whatWeSent: { correlationId, requestBody },
    };
    throw error;
  }
});

// @desc    Create a default Package and backfill it onto every existing
//          ShopItem that doesn't already have one — so the new package
//          field is non-null across the catalog without requiring admin
//          to manually re-save every product.
// @route   POST /api/setup/backfill-default-package
// @access  Private/Admin (time-window guarded, see setupRoutes)
const backfillDefaultPackage = asyncHandler(async (req, res) => {
  const DEFAULT_PACKAGE = {
    name: "Standard Box",
    length: 12,
    width: 9,
    height: 6,
    weight: { value: 0.3, unit: "kg" },
  };

  let defaultPackage = await Package.findOne({
    name: DEFAULT_PACKAGE.name,
    isDeleted: false,
  });

  if (!defaultPackage) {
    defaultPackage = await Package.create(DEFAULT_PACKAGE);
  }

  const { modifiedCount } = await ShopItem.updateMany(
    { package: { $exists: false } },
    { $set: { package: defaultPackage._id } },
  );

  res.json({
    success: true,
    package: defaultPackage,
    shopItemsBackfilled: modifiedCount,
  });
});

// Converts a stored state value to its ISO code for the given country —
// passes through unchanged if it's already a valid code, looks it up by
// full name (e.g. "Texas" -> "TX") otherwise. Returns matched:false rather
// than guessing when nothing lines up, so unmatched data is visible in the
// response instead of silently left wrong.
const normalizeStateValue = (country, state) => {
  if (!country || !state) return { value: state, matched: true };

  if (isValidStateCode(country, state)) {
    return { value: state.toUpperCase(), matched: true };
  }

  const match = getStatesOfCountry(country).find(
    (s) => s.name.toLowerCase() === String(state).trim().toLowerCase(),
  );

  return match
    ? { value: match.isoCode, matched: true }
    : { value: state, matched: false };
};

// @desc    Normalize existing Address/ShippingSettings/ExportFee documents
//          to the new address schema: rename fullAddress -> addressLine1,
//          convert state full-names to ISO codes. Operates on the raw
//          collections (not the Mongoose models) so it can both read a
//          field (fullAddress) that no longer exists in the current schema
//          and $unset it afterward — Model.updateMany() silently drops
//          $unset for fields outside the schema unless {strict:false},
//          the same gotcha migrateTaxAndVatFields hit before (see
//          tests/README.md); going through .collection sidesteps it
//          entirely.
// @route   POST /api/setup/normalize-address-schema
// @access  Private/Admin (time-window guarded, see setupRoutes)
const normalizeAddressSchema = asyncHandler(async (req, res) => {
  const logs = [];
  const unmatchedStates = [];

  // --- Address ---
  const addresses = await Address.collection.find({}).toArray();
  let addressesUpdated = 0;

  for (const doc of addresses) {
    const set = {};
    const unset = {};

    if (doc.fullAddress !== undefined && doc.addressLine1 === undefined) {
      set.addressLine1 = doc.fullAddress;
      unset.fullAddress = "";
    }

    if (doc.state) {
      const { value, matched } = normalizeStateValue(doc.country, doc.state);
      if (value !== doc.state) set.state = value;
      if (!matched) {
        unmatchedStates.push({
          collection: "Address",
          id: doc._id,
          country: doc.country,
          state: doc.state,
        });
      }
    }

    if (Object.keys(set).length || Object.keys(unset).length) {
      const update = {};
      if (Object.keys(set).length) update.$set = set;
      if (Object.keys(unset).length) update.$unset = unset;
      await Address.collection.updateOne({ _id: doc._id }, update);
      addressesUpdated += 1;
    }
  }

  logs.push({
    task: "Normalize Address documents",
    status: "success",
    message: `${addresses.length} checked, ${addressesUpdated} updated`,
  });

  // --- ShippingSettings.originAddress ---
  const settingsDocs = await ShippingSettings.collection.find({}).toArray();
  let settingsUpdated = 0;

  for (const doc of settingsDocs) {
    const origin = doc.originAddress;
    if (!origin) continue;

    const set = {};
    const unset = {};

    if (origin.fullAddress !== undefined && origin.addressLine1 === undefined) {
      set["originAddress.addressLine1"] = origin.fullAddress;
      unset["originAddress.fullAddress"] = "";
    }

    if (origin.state) {
      const { value, matched } = normalizeStateValue(origin.country, origin.state);
      if (value !== origin.state) set["originAddress.state"] = value;
      if (!matched) {
        unmatchedStates.push({
          collection: "ShippingSettings",
          id: doc._id,
          country: origin.country,
          state: origin.state,
        });
      }
    }

    if (Object.keys(set).length || Object.keys(unset).length) {
      const update = {};
      if (Object.keys(set).length) update.$set = set;
      if (Object.keys(unset).length) update.$unset = unset;
      await ShippingSettings.collection.updateOne({ _id: doc._id }, update);
      settingsUpdated += 1;
    }
  }

  logs.push({
    task: "Normalize ShippingSettings.originAddress",
    status: "success",
    message: `${settingsDocs.length} checked, ${settingsUpdated} updated`,
  });

  // --- ExportFee.states[].state ---
  const exportFees = await ExportFee.collection.find({}).toArray();
  let exportFeesUpdated = 0;

  for (const doc of exportFees) {
    if (!Array.isArray(doc.states) || doc.states.length === 0) continue;

    let changed = false;
    const newStates = doc.states.map((s) => {
      const { value, matched } = normalizeStateValue(doc.country, s.state);
      if (!matched) {
        unmatchedStates.push({
          collection: "ExportFee",
          id: doc._id,
          country: doc.country,
          state: s.state,
        });
      }
      if (value !== s.state) changed = true;
      return { ...s, state: value };
    });

    if (changed) {
      await ExportFee.collection.updateOne(
        { _id: doc._id },
        { $set: { states: newStates } },
      );
      exportFeesUpdated += 1;
    }
  }

  logs.push({
    task: "Normalize ExportFee.states",
    status: "success",
    message: `${exportFees.length} checked, ${exportFeesUpdated} updated`,
  });

  res.json({
    success: true,
    results: logs,
    // Anything here couldn't be matched to a real state code — worth a
    // manual look rather than guessing further.
    unmatchedStates,
  });
});

module.exports = {
  runSetupScripts,
  clearOrdersPaymentsAndShipments,
  registerUspsWebhook,
  backfillDefaultPackage,
  normalizeAddressSchema,
};
