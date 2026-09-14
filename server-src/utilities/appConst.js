// App-wide default currency. Individual products still carry their own
// currency (ShopItem.currency, required), but anything that doesn't have an
// explicit currency of its own — e.g. the Internal shipping provider's
// quote, which currently just rides on whatever currency the order is
// already in — falls back to this.
const DEFAULT_CURRENCY = "USD";

module.exports = { DEFAULT_CURRENCY };
