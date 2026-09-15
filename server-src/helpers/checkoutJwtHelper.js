const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const CHECKOUT_JWT_EXPIRY = "10m";

const attributeId = (a) => {
  if (!a) return null;
  if (typeof a === "object") {
    return a?.Attribute?._id?.toString() || a?.Attribute?.toString() || null;
  }
  return a.toString();
};

// Hashes the checkout inputs so a later request can detect if anything
// changed since the quote was signed.
const buildCheckoutHash = ({ items, address, provider }) => {
  const normalized = {
    items: (items || [])
      .map((item) => ({
        shopItem:
          item.shopItem?._id?.toString() || item.shopItem?.toString() || null,
        quantity: item.quantity,
        selectedAttributes: (item.selectedAttributes || [])
          .map(attributeId)
          .filter(Boolean)
          .sort(),
      }))
      .sort((a, b) => (a.shopItem > b.shopItem ? 1 : a.shopItem < b.shopItem ? -1 : 0)),
    address: {
      country: address?.country || null,
      state: address?.state || null,
      city: address?.city || null,
      zipCode: address?.zipCode || null,
      fullAddress: address?.fullAddress || null,
    },
    provider,
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
};

const signCheckoutToken = (payload) => {
  return jwt.sign(payload, process.env.CHECKOUT_JWT_SECRET, {
    expiresIn: CHECKOUT_JWT_EXPIRY,
  });
};

// Returns the decoded payload, or null if missing/invalid/expired — never
// throws, so callers just fall back to a fresh calculation.
const verifyCheckoutToken = (token) => {
  if (!token) return null;

  try {
    return jwt.verify(token, process.env.CHECKOUT_JWT_SECRET);
  } catch {
    return null;
  }
};

module.exports = {
  CHECKOUT_JWT_EXPIRY,
  buildCheckoutHash,
  signCheckoutToken,
  verifyCheckoutToken,
};
