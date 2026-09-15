const internalProvider = require("./internalProvider");
// Shopify disabled for now — see docs/shipping-provider-architecture-plan.md
// const shopifyProvider = require("./shopifyProvider");

// Each provider implements getQuote/createShipment/getShipment. Callers
// should only ever go through this registry, never branch on provider name.
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
