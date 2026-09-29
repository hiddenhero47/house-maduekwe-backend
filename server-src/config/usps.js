const axios = require("axios");

// USPS's legacy XML Web Tools API was retired January 25, 2026 — this is
// the current OAuth2 "USPS APIs" platform (developers.usps.com). Defaults
// to the Test Environment (TEM) — set USPS_API_BASE_URL=https://apis.usps.com
// for production.
const USPS_API_BASE_URL =
  process.env.USPS_API_BASE_URL || "https://apis-tem.usps.com";
const USPS_CLIENT_ID = process.env.USPS_CLIENT_ID; // Consumer Key
const USPS_CLIENT_SECRET = process.env.USPS_CLIENT_SECRET; // Consumer Secret
// A USPS.com Business Customer Gateway CRID/Mailer ID — required for
// pricing/labels, same role UPS_ACCOUNT_NUMBER plays for UPS.
const USPS_CRID = process.env.USPS_CRID;
const USPS_MAILER_ID = process.env.USPS_MAILER_ID;

let cachedToken = null; // { accessToken, expiresAt }

// OAuth2 client-credentials — same shape as config/ups.js, short-lived
// token cached with a safety margin rather than read once at require-time.
const getUspsAccessToken = async () => {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const { data } = await axios.post(
    `${USPS_API_BASE_URL}/oauth2/v3/token`,
    {
      grant_type: "client_credentials",
      client_id: USPS_CLIENT_ID,
      client_secret: USPS_CLIENT_SECRET,
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    },
  );

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in) * 1000,
  };

  return cachedToken.accessToken;
};

// A fresh, pre-authenticated axios instance per call, same reasoning as
// config/ups.js's getUpsClient.
const getUspsClient = async () => {
  const token = await getUspsAccessToken();

  return axios.create({
    baseURL: USPS_API_BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    timeout: 20000,
  });
};

const _resetUspsTokenCache = () => {
  cachedToken = null;
};

module.exports = {
  getUspsAccessToken,
  getUspsClient,
  USPS_CRID,
  USPS_MAILER_ID,
  USPS_API_BASE_URL,
  _resetUspsTokenCache,
};
