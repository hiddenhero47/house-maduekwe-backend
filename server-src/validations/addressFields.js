const yup = require("yup");
const { ExportFee } = require("../models/exportFeeModel");
const {
  isValidCountryCode,
  isValidStateCode,
} = require("../helpers/countryReference");

// Shared by every address-shaped schema (Address, ShippingSettings.
// originAddress, guest checkout) so country/state validation strictness is
// the same everywhere — before this helper existed there were three
// different levels across those three schemas, with two having no format
// check on country/state at all.

// Real ISO-2 code, AND restricted to countries we actually have an ExportFee
// entry for (ExportFee covers shipping and tax — no entry means we can't
// quote either, so the address shouldn't be creatable in the first place).
const countryCodeValidation = (requiredMessage) =>
  yup
    .string()
    .trim()
    .uppercase()
    .matches(
      /^[A-Z]{2}$/,
      "Country must be a valid 2-letter country code (e.g. NG, US)",
    )
    .test(
      "country-exists",
      "Unrecognized country code",
      (value) => !value || isValidCountryCode(value),
    )
    .test(
      "country-has-export-fee",
      "We don't currently support this country",
      async (value) => {
        if (!value) return true; // let required() handle emptiness
        return !!(await ExportFee.exists({ country: value, isActive: true }));
      },
    )
    .required(requiredMessage || "Country is required");

// Sibling-aware — reads the already-validated `country` on the same object
// to confirm `state` is a real subdivision of that specific country.
const stateCodeValidation = (requiredMessage) =>
  yup
    .string()
    .trim()
    .uppercase()
    .test(
      "state-valid-for-country",
      "Not a recognized state/province for this country",
      function (value) {
        if (!value) return true; // let required() handle emptiness
        const { country } = this.parent;
        return isValidStateCode(country, value);
      },
    )
    .required(requiredMessage || "State is required");

module.exports = { countryCodeValidation, stateCodeValidation };
