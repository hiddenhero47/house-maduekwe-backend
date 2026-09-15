const {
  ShippingSettings,
  SHIPPING_PROVIDERS,
} = require("../models/shippingSettingsModel");

// Settings is a singleton — returns the one document, creating a default if
// none exists yet.
const getShippingSettings = async () => {
  let settings = await ShippingSettings.findOne();

  if (!settings) {
    settings = await ShippingSettings.create({
      activeProvider: SHIPPING_PROVIDERS.INTERNAL,
      enabled: true,
      autoCreateShipment: false,
    });
  }

  return settings;
};

module.exports = { getShippingSettings };
