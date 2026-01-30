const stripe = require("../config/stripe");

const verifyWebhook = async (req, res, next) => {
  const { provider } = req.params;

  try {
    if (provider === "stripe") {
      const signature = req.headers["stripe-signature"];

      if (!signature) {
        return res.status(400).json({ message: "Missing Stripe signature" });
      }

      const event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );

      req.webhook = {
        provider: "stripe",
        event,
      };

      return next();
    }

    // future providers
    return res.status(400).json({ message: "Unsupported webhook provider" });
  } catch (err) {
    console.error("Webhook verification failed:", err.message);
    return res.sendStatus(400);
  }
};

module.exports = verifyWebhook;
