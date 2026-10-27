const asyncHandler = require("express-async-handler");
const {
  getAllCountries,
  getCountry,
  getStatesOfCountry,
  getCitiesOfCountry,
  getCitiesOfState,
} = require("../helpers/countryReference");

// @desc    Get all countries
// @route   GET /api/reference/countries
// @access  Public (lookup data only)
const getCountries = asyncHandler(async (req, res) => {
  const countries = getAllCountries().map((c) => ({
    isoCode: c.isoCode,
    name: c.name,
    currency: c.currency,
    phonecode: c.phonecode,
    flag: c.flag,
  }));

  res.json({ data: countries });
});

// @desc    Get states/provinces of a country
// @route   GET /api/reference/countries/:countryCode/states
// @access  Public
const getStates = asyncHandler(async (req, res) => {
  const { countryCode } = req.params;

  if (!getCountry(countryCode)) {
    res.status(404);
    throw new Error(`Unknown country code "${countryCode}"`);
  }

  const states = getStatesOfCountry(countryCode).map((s) => ({
    isoCode: s.isoCode,
    name: s.name,
  }));

  res.json({ data: states });
});

// @desc    Get cities of a country, optionally narrowed by state
// @route   GET /api/reference/countries/:countryCode/cities
// @access  Public
const getCities = asyncHandler(async (req, res) => {
  const { countryCode } = req.params;
  const { state } = req.query;

  if (!getCountry(countryCode)) {
    res.status(404);
    throw new Error(`Unknown country code "${countryCode}"`);
  }

  const cities = state
    ? getCitiesOfState(countryCode, state)
    : getCitiesOfCountry(countryCode);

  res.json({ data: cities.map((c) => ({ name: c.name, stateCode: c.stateCode })) });
});

module.exports = { getCountries, getStates, getCities };
