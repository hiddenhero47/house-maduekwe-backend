const { ExportFee } = require("../../models/exportFeeModel");
const { DEFAULT_CURRENCY } = require("../../utilities/appConst");

// Wraps the exact shipping-fee lookup that used to live directly in
// checkoutController.js's resolveShippingFee(). Destination VAT is
// deliberately NOT resolved here — VAT is a House Maduekwe/tax concern,
// sourced from the same ExportFee document but independent of which
// shipping provider is active (see checkoutController's resolveDestinationVat).
const getQuote = async ({ destination, currency }) => {
  const { country, state } = destination || {};

  if (!country) {
    throw new Error("Shipping country is required");
  }

  // ExportFee.country is stored uppercase (schema enforces /^[A-Z]{2}$/).
  const exportFee = await ExportFee.findOne({
    country: country.toUpperCase(),
    isActive: true,
  }).lean();

  if (!exportFee) {
    throw new Error("Shipping is not available for this country");
  }

  let shippingFee = exportFee.defaultAmount;

  if (state && Array.isArray(exportFee.states)) {
    const matchedState = exportFee.states.find(
      (s) => s.state.toLowerCase().trim() === state.toLowerCase().trim(),
    );

    if (matchedState) {
      shippingFee = matchedState.amount;
    }
  }

  return {
    shippingFee,
    currency: currency || DEFAULT_CURRENCY,
    shippingCountry: exportFee.country,
    shippingState: state || null,
    raw: exportFee,
  };
};

// House Maduekwe ships this itself — there is no external label API to call.
// "Creating a shipment" just means an admin has physically dropped the
// package off and is recording the carrier + tracking number by hand.
const createShipment = async ({ manualDetails }) => {
  const { carrier, trackingNumber, trackingUrl } = manualDetails || {};

  if (!carrier || !trackingNumber) {
    throw new Error(
      "carrier and trackingNumber are required to record an internal shipment",
    );
  }

  return {
    providerShipmentId: null,
    carrier,
    trackingNumber,
    trackingUrl: trackingUrl || null,
    status: "label_created",
    shippingCost: null,
    currency: null,
    raw: null,
  };
};

const getShipment = async () => {
  throw new Error(
    "Internal shipments have no external provider to poll — update status manually",
  );
};

module.exports = {
  name: "internal",
  getQuote,
  createShipment,
  getShipment,
};
