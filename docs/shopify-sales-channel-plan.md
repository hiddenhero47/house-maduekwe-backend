# Shopify Sales Channel — Checkout Redirect

Status: **deferred — do not implement without an explicit go-ahead.** Written now, while
the research is fresh, so the shape isn't lost — not a queued task. You said you need to
talk to your client first about why he still wants Shopify in the picture, since it can't
solve the shipping problem it was originally proposed for (see
`docs/shopify-ups-integration-plan.md` Section 0). Revisit after that conversation.

---

## This is a different integration than the original ask, not a continuation of it

The original ask treated Shopify as a *shipping provider inside our own checkout* —
confirmed impossible: no external rate-quote API exists, and the specific Checkout API
that could've offered one was shut down April 1, 2025. **This is something else
entirely: Shopify as a second, independent sales channel.** The customer leaves our
checkout and finishes payment on Shopify's own hosted checkout page instead. That's a
materially different risk shape — a second external system now holds money and order
state for those specific sales, and we're reconciling after the fact via webhook rather
than controlling the transaction ourselves. Worth being clear-eyed about that before
picking it back up.

---

## Shape of it, for when you're ready

1. **Product sync** — reuses the exact sync system originally scoped for the shipping
   work: embedded `shopify.*` fields on `ShopItem` (`productId`, `contentHash`,
   `syncedAt`, per-variant ids), the `productSet` GraphQL mutation for idempotent
   create-or-update, and sync/remove/get/compare endpoints. None of that changes with
   the new direction — Shopify needs real products to sell against either way.

2. **A second checkout entry point** — alongside the existing "Checkout" button, a
   "Checkout with Shopify" button that, instead of calling our own
   `checkout`/`guest-checkout`:
   - Ensures every cart item is synced first (same freshness-check helper from the
     shipping plan).
   - Creates a Shopify **cart** via the **Storefront Cart API** — not the dead Checkout
     API — using `cartCreate` with the synced variant IDs + quantities. The Storefront
     API is the current, supported way to get a working `checkoutUrl` from outside
     Shopify's own frontend.
   - Redirects the browser to that `checkoutUrl`. The customer finishes payment,
     shipping selection, and tax calculation entirely inside Shopify's own checkout —
     which, worth noting, is the one context where Shopify actually *can* compute real
     shipping rates (Section 0's constraint was specifically about *external* callers;
     Shopify's own checkout has never had a problem quoting for itself).

3. **Reconciliation via webhook, not a live response** — a Shopify webhook on
   `ORDERS_PAID` (and likely `ORDERS_CREATE`) calls `POST /api/shopify/webhook`, verified
   with the same HMAC pattern already built for the shipment webhooks. On receipt: **re-
   query the order from Shopify directly** (never trust the webhook payload alone — same
   rule as every other webhook in this codebase), decrement `ShopItem.quantity` for the
   purchased items (the actual "update inventory" you asked for), and create a House
   Maduekwe `Order` record for it too, so it shows up in the same admin Orders page as
   every other sale. `CHECKOUT_TYPES` would likely need a third value —
   `shopify-checkout` — alongside the existing `user-checkout`/`guest-checkout`.

## Open questions for whenever this gets picked back up

- Does House Maduekwe still track payment for these orders in our own `Payment` model
  (mirrored from Shopify's transaction data), or is Shopify the sole source of truth for
  money on these specific sales?
- Refunds/cancellations initiated on Shopify's side — do they need to flow back and
  update our `Order.status` too? That's another webhook topic
  (`ORDERS_CANCELLED`/`REFUNDS_CREATE`), more surface area.
- This path bypasses our own `ExportFee` tax/shipping logic entirely — Shopify computes
  its own for its own checkout. Is it acceptable that a Shopify-checkout order could show
  different tax/shipping numbers than an identical cart checked out normally on our site?
- Currency — does the Shopify store's currency match `DEFAULT_CURRENCY`/per-product
  currency, or does this need conversion handling?
- Inventory race conditions — if the same product is low-stock and gets bought nearly
  simultaneously on our site and via Shopify, whose stock check wins? (Our checkout
  already does atomic `updateOne` stock decrements inside a transaction — the Shopify
  webhook path would need the same discipline, not a naive re-implementation.)

Nothing here gets built until you say go.
