const axios = require("axios");

// Defaults to UPS's Customer Integration Environment (sandbox) — set
// UPS_API_BASE_URL=https://onlinetools.ups.com for production.
const UPS_API_BASE_URL = process.env.UPS_API_BASE_URL || "https://wwwcie.ups.com";
const UPS_CLIENT_ID = process.env.UPS_CLIENT_ID;
const UPS_CLIENT_SECRET = process.env.UPS_CLIENT_SECRET;
const UPS_ACCOUNT_NUMBER = process.env.UPS_ACCOUNT_NUMBER;

let cachedToken = null; // { accessToken, expiresAt }

// OAuth2 client-credentials — the token is short-lived (UPS: ~1hr), unlike
// Stripe/Shopify's static tokens, so this is fetched lazily and cached with
// a safety margin rather than read once at require-time.
const getUpsAccessToken = async () => {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const credentials = Buffer.from(
    `${UPS_CLIENT_ID}:${UPS_CLIENT_SECRET}`,
  ).toString("base64");

  const { data } = await axios.post(
    `${UPS_API_BASE_URL}/security/v1/oauth/token`,
    "grant_type=client_credentials",
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      timeout: 15000,
    },
  );

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in) * 1000,
  };

  return cachedToken.accessToken;
};

// A fresh, pre-authenticated axios instance per call — the token can rotate
// between calls, so this isn't built once at module load. Callers add their
// own transId (must be unique per request) and transactionSrc headers.
const getUpsClient = async () => {
  const token = await getUpsAccessToken();

  return axios.create({
    baseURL: UPS_API_BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    timeout: 20000,
  });
};

// Exposed for tests — lets a test clear the cache between cases without
// reaching into module internals.
const _resetUpsTokenCache = () => {
  cachedToken = null;
};

module.exports = {
  getUpsAccessToken,
  getUpsClient,
  UPS_ACCOUNT_NUMBER,
  UPS_API_BASE_URL,
  _resetUpsTokenCache,
};
