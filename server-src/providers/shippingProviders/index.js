const internalProvider = require("./internalProvider");
// 🛑 Shopify disabled for now — focus is on getting the Internal provider
// solid first. shopifyProvider.js is untouched and ready to be re-registered
// below when we pick this back up.
// const shopifyProvider = require("./shopifyProvider");

// Every provider module must implement:
//   getQuote({ items, destination, origin, currency })
//     -> { shippingFee, currency, raw }
//   createShipment({ order, items, destination, origin, manualDetails })
//     -> { providerShipmentId, carrier, trackingNumber, trackingUrl, status, shippingCost, currency, raw }
//   getShipment({ providerShipmentId, ...providerSpecificRefs })
//     -> { status, trackingNumber, trackingUrl, raw }
//
// Callers (checkoutController, shipmentController) only ever talk to this
// registry — no provider name should ever be branched on outside of here
// (doc §17).
const providers = {
  [internalProvider.name]: internalProvider,
  // [shopifyProvider.name]: shopifyProvider,
};

const getShippingProvider = (name) => {
  const provider = providers[name];

  if (!provider) {
    throw new Error(`Unknown shipping provider: "${name}"`);
  }

  return provider;
};

module.exports = { getShippingProvider };
