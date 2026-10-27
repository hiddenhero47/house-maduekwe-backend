const yup = require("yup");
const { countryCodeValidation, stateCodeValidation } = require("./addressFields");

const addressValidationSchema = yup.object({
  city: yup.string().required("City is required"),
  state: stateCodeValidation("State is required"),
  country: countryCodeValidation("Country is required"),
  description: yup.string().optional(),
  zipCode: yup.string().optional(),
  addressLine2: yup.string().optional(),
  coordinates: yup.mixed().optional(),
  addressLine1: yup.string().required("Address line 1 is required"),
  isDefault: yup.boolean().optional(),
});

module.exports = addressValidationSchema;
