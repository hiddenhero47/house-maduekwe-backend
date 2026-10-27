const { Country, State, City } = require("country-state-city");

// Single source of truth for country/state/city reference data — wraps the
// `country-state-city` package (same one PolyGrid uses) so every schema
// validator and the /api/reference endpoints go through one place.
const getAllCountries = () => Country.getAllCountries();

const getCountry = (isoCode) =>
  isoCode ? Country.getCountryByCode(isoCode.toUpperCase()) : undefined;

const isValidCountryCode = (isoCode) => !!getCountry(isoCode);

const getStatesOfCountry = (countryCode) =>
  countryCode ? State.getStatesOfCountry(countryCode.toUpperCase()) : [];

// Countries with no subdivisions in the dataset accept any/no state —
// same rule PolyGrid uses, since otherwise every country without states
// listed would reject a state value it can never satisfy.
const isValidStateCode = (countryCode, stateCode) => {
  if (!stateCode) return false;
  const states = getStatesOfCountry(countryCode);
  if (states.length === 0) return true;
  return states.some((s) => s.isoCode === stateCode.toUpperCase());
};

const getCitiesOfCountry = (countryCode) =>
  countryCode ? City.getCitiesOfCountry(countryCode.toUpperCase()) ?? [] : [];

const getCitiesOfState = (countryCode, stateCode) =>
  countryCode && stateCode
    ? City.getCitiesOfState(countryCode.toUpperCase(), stateCode.toUpperCase()) ?? []
    : [];

module.exports = {
  getAllCountries,
  getCountry,
  isValidCountryCode,
  getStatesOfCountry,
  isValidStateCode,
  getCitiesOfCountry,
  getCitiesOfState,
};
