const yup = require("yup");

const paymentProviderValidationSchema = yup.object({
  provider: yup
    .string()
    .required("Provider name is required")
    .trim()
    .lowercase(),

  percentageFee: yup
    .number()
    .min(0, "Percentage fee cannot be negative")
    .max(100, "Percentage fee cannot exceed 100")
    .default(0),

  flatFee: yup
    .number()
    .min(0, "Flat fee cannot be negative")
    .default(0),

  isActive: yup.boolean().optional(),
});

module.exports = {
  paymentProviderValidationSchema,
};
