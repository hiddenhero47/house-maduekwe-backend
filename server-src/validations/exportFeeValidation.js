const yup = require("yup");
const { isValidStateCode } = require("../helpers/countryReference");

const stateFeeSchema = yup.object({
  // Format only here — Yup's `this.parent` inside a nested array item is
  // the state object itself (siblings: amount, vat), not the grandparent
  // ExportFee's `country`, so the real cross-field check against country
  // lives on the `states` array field below instead.
  state: yup.string().required("State is required").trim().uppercase(),

  amount: yup
    .number()
    .required("State amount is required")
    .min(0, "State amount cannot be negative"),

  vat: yup.number().min(0, "State vat cannot be negative").optional(),
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

  defaultVat: yup
    .number()
    .required("Default vat is required")
    .min(0, "Default vat cannot be negative"),

  states: yup
    .array()
    .of(stateFeeSchema)
    .test("unique-state", "Duplicate states are not allowed", (states = []) => {
      const names = states.map((s) => s.state);
      return new Set(names).size === names.length;
    })
    .test(
      "state-valid-for-country",
      "One or more states are not recognized for this country",
      function (states = []) {
        const { country } = this.parent;
        return states.every((s) => isValidStateCode(country, s.state));
      },
    ),

  isActive: yup.boolean(),
});

module.exports = {
  exportFeeValidationSchema,
};
