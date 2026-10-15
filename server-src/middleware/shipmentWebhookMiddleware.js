const crypto = require("crypto");

// Same verify-then-trust philosophy as middleware/webhookMiddleware.js
// (Stripe) — kept separate since this is a different domain (shipments).
const verifyShipmentWebhook = (req, res, next) => {
  const { provider } = req.params;

  try {
    if (provider === "ups") {
      // Same HMAC-SHA256-over-raw-body shape as Stripe's webhook — UPS's
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
      // Per docs/subscriptions-tracking-v3r2_6.yaml (the real "Subscriptions
      // - Tracking 3.2" spec): the digest is in the X-HMAC header (the only
      // signature header USPS sends — `hmac-header` is a deprecated alias,
      // there is no separate timestamp header). It's computed over
      // `timestamp + payload`, where both are fields INSIDE the JSON body
      // envelope ({ subscriptionId, subscriptionType, timestamp, payload }),
      // not HTTP headers — `payload` itself is a JSON-formatted string that
      // needs a second JSON.parse to reach the actual tracking fields.
      const hmacHeader = req.headers["x-hmac"];

      if (!hmacHeader || !Buffer.isBuffer(req.body)) {
        return res.status(400).json({ message: "Missing USPS signature header" });
      }

      const envelope = JSON.parse(req.body.toString("utf8"));
      const { timestamp, payload } = envelope;

      const digest = crypto
        .createHmac("sha256", process.env.USPS_WEBHOOK_SECRET)
        .update(`${timestamp}${payload}`)
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
        event: JSON.parse(payload),
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
