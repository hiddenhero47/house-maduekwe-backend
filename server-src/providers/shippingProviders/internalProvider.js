const { ExportFee } = require("../../models/exportFeeModel");
const { DEFAULT_CURRENCY } = require("../../utilities/appConst");

// VAT is resolved separately (checkoutController's resolveDestinationVat) —
// it's tax, not a shipping-provider concern, even though it reads the same
// ExportFee document.
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

  // No ExportFee row means "we don't operate in this country at all" — that's
  // already a hard stop upstream in resolveDestinationVat (checkoutController.js),
  // which always runs before this. Returning null here (not throwing) just
  // keeps this provider consistent with the "null = can't serve" contract the
  // fallback loop in resolveShippingQuote relies on.
  if (!exportFee) {
    return null;
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
  // Requires a human to type carrier/tracking in by hand — can't self-serve,
  // so auto-create-shipment-on-payment never fires for this provider.
  supportsAutoTracking: false,
  getQuote,
  createShipment,
  getShipment,
};
