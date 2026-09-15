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

    // future providers (dhl, fedex, ...)
    return res.status(400).json({ message: "Unsupported webhook provider" });
  } catch (err) {
    console.error("Shipment webhook verification failed:", err.message);
    return res.sendStatus(400);
  }
};

module.exports = verifyShipmentWebhook;
