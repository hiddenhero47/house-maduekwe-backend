const mongoose = require("mongoose");

// Full roster this architecture is designed for — not all registered yet.
const SHIPPING_PROVIDERS = {
  INTERNAL: "internal",
  SHOPIFY: "shopify",
  DHL: "dhl",
  FEDEX: "fedex",
};

// Only providers actually registered in providers/shippingProviders/index.js.
const ENABLED_SHIPPING_PROVIDERS = [SHIPPING_PROVIDERS.INTERNAL];

// Singleton — one settings row for the whole app.
const shippingSettingsSchema = new mongoose.Schema(
  {
    activeProvider: {
      type: String,
      enum: ENABLED_SHIPPING_PROVIDERS,
      default: SHIPPING_PROVIDERS.INTERNAL,
    },

    enabled: {
      type: Boolean,
      default: true,
    },

    autoCreateShipment: {
      type: Boolean,
      default: false,
    },

    originAddress: {
      country: { type: String, trim: true },
      state: { type: String, trim: true },
      city: { type: String, trim: true },
      fullAddress: { type: String, trim: true },
      zipCode: { type: String, trim: true, default: "" },
    },

    updatedBy: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      email: {
        type: String,
      },
    },
  },
  {
    timestamps: true,
  },
);

const ShippingSettings = mongoose.model(
  "ShippingSettings",
  shippingSettingsSchema,
);

module.exports = {
  ShippingSettings,
  SHIPPING_PROVIDERS,
  ENABLED_SHIPPING_PROVIDERS,
};
