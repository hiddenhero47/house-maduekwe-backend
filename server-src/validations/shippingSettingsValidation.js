const yup = require("yup");
const {
  ENABLED_SHIPPING_PROVIDERS,
} = require("../models/shippingSettingsModel");

const shippingSettingsValidationSchema = yup.object({
  activeProvider: yup
    .string()
    .oneOf(ENABLED_SHIPPING_PROVIDERS, "Invalid or disabled shipping provider")
    .optional(),

  enabled: yup.boolean().optional(),

  autoCreateShipment: yup.boolean().optional(),

  originAddress: yup
    .object({
      country: yup.string().trim().required("Origin country is required"),
      state: yup.string().trim().required("Origin state is required"),
      city: yup.string().trim().required("Origin city is required"),
      fullAddress: yup
        .string()
        .trim()
        .required("Origin full address is required"),
      zipCode: yup.string().trim().default(""),
    })
    .optional(),
});

module.exports = { shippingSettingsValidationSchema };
