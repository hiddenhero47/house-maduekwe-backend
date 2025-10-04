const yup = require("yup");

const addressValidationSchema = yup.object({
  city: yup.string().required("City is required"),
  state: yup.string().required("State is required"),
  country: yup.string().required("Country is required"),
  description: yup.string().required("Description is required"),
  coordinates: yup.any().optional(),
  fullAddress: yup.string().required("Full address is required"),
});

module.exports = addressValidationSchema;
