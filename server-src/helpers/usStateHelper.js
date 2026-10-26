// Carriers (USPS, UPS) require the 2-letter USPS state/territory code, but
// addresses in this system — both admin-configured origin addresses and
// customer-entered shipping addresses — are stored as full state names
// (e.g. "Texas"). This converts at the carrier-request boundary rather than
// changing how addresses are stored everywhere.
const STATE_NAME_TO_CODE = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  // Territories / freely associated states, also part of USPS's valid set.
  "american samoa": "AS",
  "federated states of micronesia": "FM",
  guam: "GU",
  "marshall islands": "MH",
  "northern mariana islands": "MP",
  palau: "PW",
  "puerto rico": "PR",
  "virgin islands": "VI",
};

// Returns the 2-letter code unchanged if already one; looks up a full name
// otherwise. Falls back to the original value (uppercased) if unrecognized
// — lets the carrier's own validation surface an unknown state clearly
// rather than this silently swallowing a real data problem.
const toStateCode = (state) => {
  if (!state) return state;

  const trimmed = String(state).trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();

  const code = STATE_NAME_TO_CODE[trimmed.toLowerCase()];
  return code || trimmed.toUpperCase();
};

module.exports = { toStateCode };
