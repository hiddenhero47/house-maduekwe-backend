const yup = require("yup");

const stateFeeSchema = yup.object({
  state: yup.string().required("State is required").trim().lowercase(),

  amount: yup
    .number()
    .required("State amount is required")
    .min(0, "State amount cannot be negative"),
});

const exportFeeValidationSchema = yup.object({
  country: yup
    .string()
    .required("Country is required")
    .matches(
      /^[A-Z]{2}$/,
      "Country must be a valid 2-letter country code (e.g. NG, US)",
    ),

  defaultAmount: yup
    .number()
    .required("Default amount is required")
    .min(0, "Default amount cannot be negative"),

  states: yup
    .array()
    .of(stateFeeSchema)
    .test("unique-state", "Duplicate states are not allowed", (states = []) => {
      const names = states.map((s) => s.state);
      return new Set(names).size === names.length;
    }),

  isActive: yup.boolean(),
});

module.exports = {
  exportFeeValidationSchema,
};
