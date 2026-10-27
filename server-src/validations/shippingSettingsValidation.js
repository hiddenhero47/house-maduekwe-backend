const yup = require("yup");
const {
  ENABLED_SHIPPING_PROVIDERS,
} = require("../models/shippingSettingsModel");
const { countryCodeValidation, stateCodeValidation } = require("./addressFields");

const shippingSettingsValidationSchema = yup.object({
  activeProvider: yup
    .string()
    .oneOf(ENABLED_SHIPPING_PROVIDERS, "Invalid or disabled shipping provider")
    .optional(),

  enabled: yup.boolean().optional(),

  autoCreateShipment: yup.boolean().optional(),

  fallbackProviders: yup
    .array()
    .of(
      yup
        .string()
        .oneOf(ENABLED_SHIPPING_PROVIDERS, "Invalid or disabled shipping provider"),
    )
    .optional(),

  // .default(undefined) is required — otherwise a nested .default() (zipCode
  // below) makes Yup synthesize this object even when unset, failing its
  // required() fields on requests that don't touch originAddress at all.
  originAddress: yup
    .object({
      country: countryCodeValidation("Origin country is required"),
      state: stateCodeValidation("Origin state is required"),
      city: yup.string().trim().required("Origin city is required"),
      addressLine1: yup
        .string()
        .trim()
        .required("Origin address line 1 is required"),
      zipCode: yup.string().trim().default(""),
    })
    .default(undefined)
    .optional(),
});

module.exports = { shippingSettingsValidationSchema };
