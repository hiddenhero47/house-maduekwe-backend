const internalProvider = require("./internalProvider");
const upsProvider = require("./upsProvider");
const uspsProvider = require("./uspsProvider");

// Each provider implements getQuote/createShipment/getShipment. Callers
// should only ever go through this registry, never branch on provider name.
const providers = {
  [internalProvider.name]: internalProvider,
  [upsProvider.name]: upsProvider,
  [uspsProvider.name]: uspsProvider,
};

const getShippingProvider = (name) => {
  const provider = providers[name];

  if (!provider) {
    throw new Error(`Unknown shipping provider: "${name}"`);
  }

  return provider;
};

module.exports = { getShippingProvider };
