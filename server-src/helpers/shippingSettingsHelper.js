const {
  ShippingSettings,
  SHIPPING_PROVIDERS,
} = require("../models/shippingSettingsModel");

// Settings is a singleton — this returns the one document, creating a safe
// default (Internal provider, enabled) if none exists yet. Mirrors the same
// get-or-create pattern already used for ExportFee/PaymentProvider in
// helpers/appSetup.js.
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
