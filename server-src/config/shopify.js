const axios = require("axios");

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";
const SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN; // e.g. your-store.myshopify.com
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

// Admin REST API client — used for order/fulfillment creation and lookups.
const shopifyAdminClient = axios.create({
  baseURL: SHOP_DOMAIN
    ? `https://${SHOP_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`
    : undefined,
  headers: {
    "X-Shopify-Access-Token": ADMIN_TOKEN,
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

module.exports = { shopifyAdminClient, SHOPIFY_API_VERSION, SHOP_DOMAIN };
