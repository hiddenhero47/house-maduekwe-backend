# Shipping Provider Integration — Implementation Plan

Status: **draft for review — no code written yet**

This translates the ChatGPT architecture doc into concrete decisions against the
actual House Maduekwe backend as it exists today, including the `productTax` /
`weight` / `ExportFee.defaultVat` work that already shipped. Where the original
doc was conceptual, this version names real files, functions, and models.

---

## 0. What already exists that this plan builds on

| Piece | Where | Relevance |
|---|---|---|
| `ExportFee` model | `server-src/models/exportFeeModel.js` | Country + per-state `amount` (shipping) and `vat` (destination tax rate), plus `defaultAmount`/`defaultVat`. This **already is** the "Internal / House Maduekwe" provider's rate table from doc §4 — it doesn't need to become a new model, just get wrapped behind the new provider interface. |
| `ShopItem.weight` | `server-src/models/shopItemModel.js` | `{ value, unit }` already exists (added ahead of this work) — this is the "package information" doc §6 asks for. Not yet backfilled on existing products. |
| `resolveShippingFee({country, state})` | `checkoutController.js` | The **only** shipping-fee source today. This is the exact function the provider abstraction replaces. |
| Destination VAT resolution | `checkoutController.js` (`buildCheckoutSummary`/`buildGuestCheckoutSummary`) | Already computed from `ExportFee.defaultVat`/`states[].vat`, independent of shipping fee. **This does not change** — VAT stays a House Maduekwe/tax concern regardless of which carrier ships the package. |
| `jsonwebtoken` | already a dependency, used in `authMiddleware.js`/`userController.js` | Reusable, but I'm recommending a **separate** secret for checkout tokens (see open question 4) rather than reusing `JWT_SECRET` — a leaked checkout-token secret shouldn't be able to forge login sessions, or vice versa. |
| Webhook verification | `server-src/middleware/webhookMiddleware.js` (`verifyWebhook`) + raw-body scoping in `server.js` (`/api/payment/stripe/callback`) | Already provider-dispatched (`if (provider === "stripe") {...} // future providers`) and already does "verify signature → trust → update our own DB." This is exactly doc §11's pattern — we extend it, not invent a new one. |
| Payment-success hook point | `processStripeEvent` in `paymentController.js`, right after `Order.updateOne({status: ORDER_STATUS.PAID})` | This is precisely where a "payment succeeded" event fires from. Per doc §14 we do **not** auto-create shipments here in v1 — noted for Phase 5. |
| Nothing yet | — | No `Shipment` model, no provider abstraction, no admin settings model, no origin/warehouse address anywhere in the codebase. All net-new. |

---

## Phasing

```
Phase 1  Provider abstraction + Internal provider + Settings model   (no external calls, nothing customer-facing changes)
Phase 2  Checkout JWT + guest-confirm-checkout
Phase 3  Shipment model + first external provider + manual admin trigger
Phase 4  Webhooks + status translation
Phase 5  Automation toggle (deferred until 1–4 are proven manually)
```

Each phase is independently shippable and testable — Phase 1 alone is a safe refactor with zero behavior change if done right (Internal provider must produce identical output to today's `resolveShippingFee`).

---

## Phase 1 — Provider abstraction + Internal provider + Settings model

**New files:**
- `server-src/providers/shippingProviders/internalProvider.js` — wraps the exact logic currently in `resolveShippingFee`: `getQuote({ origin, destination, package }) → { shippingFee, currency, provider: "internal" }`.
- `server-src/providers/shippingProviders/index.js` — `getShippingProvider(name)` registry, throws on unknown provider. Mirrors the dispatch shape `webhookMiddleware.js` already uses.
- `server-src/models/shippingSettingsModel.js` — singleton document:
  ```js
  {
    activeProvider: { type: String, enum: ["internal", "shopify", "dhl", "fedex"], default: "internal" },
    enabled: { type: Boolean, default: true },
    autoCreateShipment: { type: Boolean, default: false },
    originAddress: {
      country: String, state: String, city: String,
      fullAddress: String, zipCode: String,
    },
  }
  ```
  This covers both doc §14 (admin provider config) and doc §6 (origin address) in one place.
- `server-src/controllers/shippingSettingsController.js` + route — admin get/update.

**Edits:**
- `checkoutController.js`: `buildCheckoutSummary`/`buildGuestCheckoutSummary` stop calling `resolveShippingFee` directly. Instead: read active provider from settings → `getShippingProvider(active).getQuote(...)`. VAT resolution is untouched — still a direct `ExportFee` lookup, called separately from the shipping quote.
- New helper: aggregate order package weight — sum `item.shopItem.weight.value × quantity` per item, normalized to a single unit (kg) before being handed to any provider, since products can individually be kg/g/lb/oz.

---

## Phase 2 — Checkout JWT + guest-confirm-checkout

- New `POST /api/orders/guest-confirm-checkout`, mirroring `confirmCheckout`, built on `buildGuestCheckoutSummary` (doc explicitly asks for this).
- `confirm-checkout` / `guest-confirm-checkout` sign a short-lived JWT containing:
  ```js
  { provider, shippingFee, currency, vatRate, checkoutHash, exp }
  ```
  `checkoutHash` = a hash of the normalized checkout inputs (item ids + quantities, address id/fields, provider) — this is how `checkout`/`guest-checkout` detects if anything changed between confirm and final submit, which the original doc gestures at ("an identifier/hash representing the checkout inputs") without pinning down.
- `checkout` / `guest-checkout` verify: signature valid, not expired, `checkoutHash` matches the current request. On any failure, the existing full recalculation path (already in `buildCheckoutSummary`) runs as the fallback — the JWT is an optimization/authorization signal, never the source of truth, per doc §2/§3.
- New env var: `CHECKOUT_JWT_SECRET`.

---

## Phase 3 — Shipment model + first external provider (manual creation)

- `server-src/models/shipmentModel.js`:
  ```js
  {
    order: { type: ObjectId, ref: "Order", required: true },
    provider: String,          // "shopify" | "dhl" | ...
    providerShipmentId: String,
    carrier: String,           // may differ from provider, doc §10
    trackingNumber: String,
    trackingUrl: String,
    status: { type: String, enum: [...translated statuses] },
    shippingCost: Number,      // what the provider actually charged US
    currency: String,
    shippedAt: Date,
    deliveredAt: Date,
  }
  ```
- New admin route `POST /api/orders/:id/create-shipment` — admin-triggered (doc §14: manual first), calls `shippingProvider.createShipment(...)`, stores the resulting `Shipment`, links `order.shipment` (or looked up by `order` ref).
- First external provider implemented behind the same interface as `internalProvider.js`: `getQuote`, `createShipment`, `getShipment`. Which provider is chosen is **open question 1** below — this phase is blocked on that answer plus doc §7's caveat (verify the provider actually supports your fulfillment origin before building against it).

---

## Phase 4 — Webhooks + status translation

- Extend `webhookMiddleware.js` (or a sibling `shipmentWebhookMiddleware.js`) + raw-body route scoping in `server.js`, mirroring the exact Stripe pattern.
- New route `POST /api/shipments/:provider/webhook`.
- Explicit status translation table (provider event → `Shipment.status` → `Order.status`) — filled in once the provider is chosen; doc §12 is right that we should not let provider event names leak into the app's domain model.

---

## Phase 5 — deferred

- `autoCreateShipment` toggle actually wired to fire shipment creation from the `processStripeEvent` hook point identified above. Deliberately **not** built until Phases 1–4 have been used manually for a while — matches doc §14's own recommendation to start manual.

---

## Explicit non-goals (for this round)

- Multiple warehouses / multiple origin addresses — single origin only.
- Real-time customer-facing carrier choice — one active provider, globally configured by admin.
- Customs/international paperwork generation.

---

## Doc section → plan cross-reference

| Doc § | Topic | Addressed in |
|---|---|---|
| 1 | Current checkout flows | §0 above (confirmed against actual code) |
| 2, 3 | Checkout JWT | Phase 2 |
| 4 | ExportFee = Internal provider | Phase 1 (`internalProvider.js`) |
| 5 | Generic `getShippingFee` | Phase 1 (`shippingProviders/index.js`) |
| 6 | Data needed for quotes | Phase 1 (weight aggregation) + `ShippingSettings.originAddress` |
| 7 | Shopify caveat | Open question 1 — must be resolved before Phase 3 |
| 8 | Payment → Shipment | Phase 3 (manual) / Phase 5 (automatic) |
| 9, 10 | ID/provider/carrier distinctions | `shipmentModel.js` fields |
| 11, 12 | Webhooks, status translation | Phase 4 |
| 13 | Overall diagram | This whole plan |
| 14 | Admin config | Phase 1 (`shippingSettingsModel.js`) |
| 15 | Physical workflow | No code — operational, admin does this by hand |
| 16 | Shopify dev store testing | Applies once provider = Shopify |
| 17 | No provider conditionals in checkout | Enforced by the `getShippingProvider(name)` interface |
| 18 | Final business logic ownership | Unchanged — matches current `buildCheckoutSummary` shape |
| 19 | Order of work | This phasing |

---

## Open questions

1. **Which provider ships first** — Shopify, DHL, FedEx, or a multi-carrier aggregator (e.g. Shippo/EasyPost, not in the original doc but worth naming since it natively abstracts multiple carriers behind one API, which may satisfy the "don't get locked into one carrier" goal more directly than integrating Shopify specifically)? Have you already confirmed Shopify's shipping-label support for your actual fulfillment origin (doc §7)?
2. Is **Phase 1 alone** (abstraction + Internal provider only, zero external calls, zero customer-facing change) an acceptable first deliverable to review, or do you want Phase 1+2 built together before the next check-in?
3. **Origin address** — single warehouse address for now, correct? I'm proposing it live on the new `ShippingSettings` model (admin-editable) rather than an env var — agree?
4. **Checkout JWT** — is a ~10-minute expiry reasonable? Should `checkout`/`guest-checkout` hard-fail if the token is missing/expired/mismatched, or silently fall back to a fresh recalculation (my recommendation — friendlier if a customer sits on the confirm screen a while)?
5. **Product weight gaps** — most existing products have no `weight` set yet (never backfilled). Once an external provider is active, should checkout **block** orders containing a product with no weight (since real carriers need it), or fall back to an estimated default weight?
6. **Who can access `ShippingSettings`** — ADMIN or SUPER_ADMIN only? (existing convention: order status changes are ADMIN+SUPER_ADMIN; admin *creation* is SUPER_ADMIN only)
7. Phase 3 assumes **one Shipment per Order** — no partial/split shipments for now. Correct?
8. Should a `Shipment.status` change via webhook **automatically** flip `Order.status`, or require an admin confirmation click first (slower, but an extra safety gate before customer-facing status changes)?
