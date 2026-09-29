const crypto = require("crypto");

// Same verify-then-trust philosophy as middleware/webhookMiddleware.js
// (Stripe) — kept separate since this is a different domain (shipments).
const verifyShipmentWebhook = (req, res, next) => {
  const { provider } = req.params;

  try {
    if (provider === "shopify") {
      const hmacHeader = req.headers["x-shopify-hmac-sha256"];

      if (!hmacHeader || !Buffer.isBuffer(req.body)) {
        return res.status(400).json({ message: "Missing Shopify HMAC header" });
      }

      const digest = crypto
        .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
        .update(req.body)
        .digest("base64");

      const digestBuffer = Buffer.from(digest);
      const headerBuffer = Buffer.from(hmacHeader);

      const isValid =
        digestBuffer.length === headerBuffer.length &&
        crypto.timingSafeEqual(digestBuffer, headerBuffer);

      if (!isValid) {
        return res
          .status(401)
          .json({ message: "Invalid Shopify webhook signature" });
      }

      req.webhook = {
        provider: "shopify",
        topic: req.headers["x-shopify-topic"],
        event: JSON.parse(req.body.toString("utf8")),
      };

      return next();
    }

    if (provider === "ups") {
      // Same HMAC-SHA256-over-raw-body shape as Stripe/Shopify above — UPS's
      // own header name for the digest.
      const signatureHeader = req.headers["x-ups-signature"];

      if (!signatureHeader || !Buffer.isBuffer(req.body)) {
        return res.status(400).json({ message: "Missing UPS signature header" });
      }

      const digest = crypto
        .createHmac("sha256", process.env.UPS_WEBHOOK_SECRET)
        .update(req.body)
        .digest("base64");

      const digestBuffer = Buffer.from(digest);
      const headerBuffer = Buffer.from(signatureHeader);

      const isValid =
        digestBuffer.length === headerBuffer.length &&
        crypto.timingSafeEqual(digestBuffer, headerBuffer);

      if (!isValid) {
        return res.status(401).json({ message: "Invalid UPS webhook signature" });
      }

      req.webhook = {
        provider: "ups",
        event: JSON.parse(req.body.toString("utf8")),
      };

      return next();
    }

    if (provider === "usps") {
      // Different scheme from the others: USPS signs `${timestamp}${payload}`
      // (not the raw body alone) with the subscription secret, digest in
      // X-HMAC. Timestamp header name is best-effort — verify once a real
      // USPS subscription payload is seen (see docs/shopify-ups-integration-plan.md).
      const hmacHeader = req.headers["x-hmac"];
      const timestamp = req.headers["x-timestamp"];

      if (!hmacHeader || !timestamp || !Buffer.isBuffer(req.body)) {
        return res.status(400).json({ message: "Missing USPS signature header" });
      }

      const digest = crypto
        .createHmac("sha256", process.env.USPS_WEBHOOK_SECRET)
        .update(timestamp + req.body.toString("utf8"))
        .digest("base64");

      const digestBuffer = Buffer.from(digest);
      const headerBuffer = Buffer.from(hmacHeader);

      const isValid =
        digestBuffer.length === headerBuffer.length &&
        crypto.timingSafeEqual(digestBuffer, headerBuffer);

      if (!isValid) {
        return res.status(401).json({ message: "Invalid USPS webhook signature" });
      }

      req.webhook = {
        provider: "usps",
        event: JSON.parse(req.body.toString("utf8")),
      };

      return next();
    }

    // future providers (dhl, fedex, ...)
    return res.status(400).json({ message: "Unsupported webhook provider" });
  } catch (err) {
    console.error("Shipment webhook verification failed:", err.message);
    return res.sendStatus(400);
  }
};

module.exports = verifyShipmentWebhook;
