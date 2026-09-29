const internalProvider = require("./internalProvider");
const upsProvider = require("./upsProvider");
const uspsProvider = require("./uspsProvider");
// Shopify has no external shipping-rate API and is not a shipper in this
// system — see docs/shopify-ups-integration-plan.md §0. Its sync system is a
// separate, deferred initiative (docs/shopify-sales-channel-plan.md), not a
// shippingProviders entry.
// const shopifyProvider = require("./shopifyProvider");

// Each provider implements getQuote/createShipment/getShipment. Callers
// should only ever go through this registry, never branch on provider name.
const providers = {
  [internalProvider.name]: internalProvider,
  [upsProvider.name]: upsProvider,
  [uspsProvider.name]: uspsProvider,
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
