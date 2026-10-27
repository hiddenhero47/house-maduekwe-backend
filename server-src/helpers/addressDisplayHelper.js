const { getCountry } = require("./countryReference");

// The one legitimate place to combine address fields into a single
// human-readable string — for showing a person "here's the full address"
// (e.g. an email, an admin view). Never used for carrier API calls, which
// always want the structured fields (addressLine1, city, state, zipCode,
// country) sent separately — combining them is exactly what broke USPS
// address validation before this helper existed.
const formatFullAddress = ({
  addressLine1,
  addressLine2,
  city,
  state,
  country,
  zipCode,
} = {}) => {
  const countryName = getCountry(country)?.name || country;

  const lines = [addressLine1, addressLine2].filter(Boolean);
  const cityStateZip = [city, state].filter(Boolean).join(", ");
  const last = [cityStateZip, zipCode].filter(Boolean).join(" ");

  return [...lines, last, countryName].filter(Boolean).join(", ");
};

module.exports = { formatFullAddress };
