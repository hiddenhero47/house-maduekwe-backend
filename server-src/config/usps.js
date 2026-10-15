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
// The MID used on the actual label/manifest — distinct from USPS_MAILER_ID
// (the organization-level MID) only for accounts with sub-MIDs. Falls back
// to USPS_MAILER_ID, which is correct for a single-MID setup.
const USPS_MANIFEST_MID = process.env.USPS_MANIFEST_MID || USPS_MAILER_ID;
// The 10-digit Enterprise Payment Account (EPA) number from Business
// Customer Gateway — separate from CRID/MID. Same value regardless of
// whether the EPS account is funded via Trust Account or ACH Debit; which
// funding method is used is decided in Business Customer Gateway, not here.
const USPS_EPS_ACCOUNT_NUMBER = process.env.USPS_EPS_ACCOUNT_NUMBER;

let cachedToken = null; // { accessToken, expiresAt }
let cachedPaymentToken = null; // { token, expiresAt }

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

// Exchanges CRID/MID/EPS account info for the X-Payment-Authorization-Token
// the Labels API requires — valid for 8 hours, so cached the same way as
// the OAuth token rather than fetched on every label purchase. This is the
// one piece that was a placeholder before; it's what actually lets a label
// purchase draw against the EPS account (Trust Account or ACH Debit — the
// request shape is identical either way, see USPS_EPS_ACCOUNT_NUMBER above).
const getPaymentAuthorizationToken = async () => {
  if (
    cachedPaymentToken &&
    cachedPaymentToken.expiresAt > Date.now() + 5 * 60_000
  ) {
    return cachedPaymentToken.token;
  }

  const client = await getUspsClient();

  const { data } = await client.post("/payments/v3/payment-authorization", {
    roles: [
      {
        roleName: "PAYER",
        CRID: USPS_CRID,
        MID: USPS_MAILER_ID,
        manifestMID: USPS_MANIFEST_MID,
        accountType: "EPS",
        accountNumber: USPS_EPS_ACCOUNT_NUMBER,
      },
    ],
  });

  if (!data?.paymentAuthorizationToken) {
    throw new Error("USPS did not return a payment authorization token");
  }

  cachedPaymentToken = {
    token: data.paymentAuthorizationToken,
    // USPS documents an 8-hour lifetime; no expires_in on this response to
    // read, so it's hardcoded with a safety margin rather than assumed exact.
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
  };

  return cachedPaymentToken.token;
};

const _resetUspsTokenCache = () => {
  cachedToken = null;
  cachedPaymentToken = null;
};

module.exports = {
  getUspsAccessToken,
  getUspsClient,
  getPaymentAuthorizationToken,
  USPS_CRID,
  USPS_MAILER_ID,
  USPS_MANIFEST_MID,
  USPS_EPS_ACCOUNT_NUMBER,
  USPS_API_BASE_URL,
  _resetUspsTokenCache,
};
