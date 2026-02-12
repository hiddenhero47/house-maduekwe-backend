const yup = require("yup");

const addressValidationSchema = yup.object({
  city: yup.string().required("City is required"),
  state: yup.string().required("State is required"),
  country: yup
    .string()
    .required("Country is required")
    .matches(
      /^[A-Z]{2}$/,
      "Country must be a valid 2-letter country code (e.g. NG, US)",
    ),
  description: yup.string().required("Description is required"),
  coordinates: yup.mixed().optional(),
  fullAddress: yup.string().required("Full address is required"),
  isDefault: yup.boolean().optional(),
});

module.exports = addressValidationSchema;
