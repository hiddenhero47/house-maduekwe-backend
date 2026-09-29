# Shipping Integration Plan — Internal + UPS + USPS (Shopify demoted, see below)

Status: **UPS and USPS both implemented, tested against mocked HTTP (286
backend tests passing). Neither has live credentials yet — see "What's
still open" at the bottom.**

Scope note: this started as "Shopify + UPS." After checking what Shopify's API surface
actually allows (Section 0), Shopify came out of the shipping-provider chain entirely —
it can't quote a price or self-serve fulfillment here, full stop. Its sync system got
repurposed into a separate, **deliberately deferred** plan for Shopify as a sales
channel: `docs/shopify-sales-channel-plan.md`. This doc is now just the real shipping
work: **internal** (existing) + **UPS** (new), plus the shipping-label storage design you
asked about.

---

## 0. Why Shopify dropped out — recap with the new evidence

Two things confirm this, not just the original "no generic rate API" finding:

1. **The exact package/method you found (`shopify-api-node`'s `checkout.shippingRates`)
   is already dead.** It wraps the REST Admin API's `checkouts.json` resource — Shopify
   shut down the entire Checkout API (REST Admin *and* Storefront) on **April 1, 2025**,
   over a year before today. That specific call can no longer be made — not "we chose
   not to," it's gone.
   [Checkout APIs shut down April 1, 2025](https://shopify.dev/changelog/checkout-apis-will-be-shut-down-april-1-2025)
2. **Even before that shutdown, the answer would've been "maybe, and gated."** Real-time
   carrier rates through Shopify ("carrier-calculated shipping") require a qualifying
   plan (Advanced/Plus included; Grow needs an add-on fee; Basic doesn't have it) and,
   more fundamentally, run through the **CarrierService API** — which is *Shopify's own
   checkout* calling *our* server for a rate, not us calling Shopify. There's no
   direction in which an external system asks Shopify for a price and gets a real
   carrier answer back.
   [Third-party carrier-calculated shipping](https://help.shopify.com/en/manual/fulfillment/setup/shipping-rates/third-party-carrier-calculated-shipping)

**Decision:** Shopify is out of `providers/shippingProviders/` entirely — no `getQuote`,
no `createShipment` pretending it's a shipper. The real shipping providers for this
project are `internal` (ExportFee, already built) and `ups` (this doc). Sync + Shopify
order-mirroring becomes its own initiative, parked per your note that you need to talk
to your client about why he still wants Shopify given it can't solve the shipping
problem — see the deferred doc.

---

## 1. Fallback chain

`ShippingSettingsModel` gets a new field: `fallbackProviders: [String]` (ordered),
defaulting to `["ups"]` per your original message ("one more shipper thats not internal
maybe ups"). Validated against `ENABLED_SHIPPING_PROVIDERS` the same way `activeProvider`
already is.

Provider contract (formalizing what `internalProvider` already does, just not written
down): `getQuote` returns `null` for "can't serve this destination," never throws for
that case — only for real faults (auth/network), which the fallback loop below
catches-and-continues on rather than failing checkout outright.

`resolveShippingQuote` tries `activeProvider`, then each `fallbackProviders` entry in
order, stopping at the first non-null quote; only after exhausting the whole list does
checkout surface "we don't ship to your location." `Order.shippedBy` is set to whichever
provider actually answered, same as today.

**Frontend follow-up this creates:** the admin Shipment Settings panel
(`pages-dashboard/settings/elements/shipment-settings/`) needs a new field to edit
`fallbackProviders` — building it alongside UPS itself, not as an afterthought.

---

## 2. UPS provider

- `server-src/config/ups.js` — OAuth2 client-credentials token fetch, in-memory cache
  keyed on expiry (new pattern here — Stripe/Shopify both use static long-lived tokens,
  UPS's are short-lived and need refresh).
- `server-src/providers/shippingProviders/upsProvider.js`:
  - `getQuote` — Rating API. A genuine destination-aware quote, the real second opinion
    in the fallback chain.
  - `createShipment` — Shipping API. Buys the label, returns a real tracking number —
    no manual carrier/tracking entry needed, so `upsProvider.supportsAutoTracking = true`
    (see Phase 3's auto-create-shipment design from the earlier round — unchanged by
    this rescoping, still applies to UPS specifically).
  - `getShipment` — Tracking API poll, re-queries UPS directly rather than trusting a
    webhook payload alone, same rule as everywhere else.
- `shipmentWebhookMiddleware.js` gets a `ups` branch — same HMAC-SHA256-over-raw-body
  shape already used for Stripe/Shopify, UPS's own header name.
- `shipmentController.js` gets a `processUpsShipmentEvent` twin to the Shopify handler.
- Route: `POST /api/shipments/ups/webhook`.
- No product sync for UPS — confirmed unnecessary, it only ever needs package
  weight/dimensions + destination, both already on the Order.
- Env vars: `UPS_CLIENT_ID`, `UPS_CLIENT_SECRET`, `UPS_ACCOUNT_NUMBER`,
  `UPS_API_BASE_URL` (sandbox vs. production), `UPS_WEBHOOK_SECRET`. Per your earlier
  answer, you don't have credentials yet — building against UPS's documented API shape
  with HTTP-mocked tests regardless (same approach already used for Stripe), so the code
  is proven correct before real credentials exist; live end-to-end testing waits on you
  getting an account.

---

## 3. Shipping labels — cost, recovery, storage, and access

### Does the label cost anything extra?

No. Generating a label is part of the Shipping API call itself, at no separate charge —
what you're billed for is the underlying transportation charge (the same rate the Rating
API already quoted), invoiced to your UPS account on its normal cycle. **Don't confuse
this with UPS's published "$1.25–$2.25 label fee"** — that fee is specifically for
*return* labels (`Returns: Print and Mail`), a different, optional service, not standard
outbound shipping. So the shipping fee we already charge the customer covers this — no
hidden second charge to plan for.

### Do we need to store it, or can we always re-fetch it?

UPS has a **Label Recovery** endpoint (`POST /labels/{version}/recovery`) that re-fetches
a previously generated label using its tracking/shipment ID. I could not find an
authoritative, UPS-published retention window for how long recovery stays available —
every third-party integration guide I checked stopped short of stating a confirmed
number. Given that uncertainty, I don't want to design something that depends on
recovery still working days or weeks later, when a customer might reasonably want their
package's label reprintable any time before delivery.

**Recommendation: store the label ourselves at creation time** (it's tiny — a one-page
PDF/GIF, tens of KB), and treat UPS's Label Recovery endpoint only as a **best-effort
fallback** for the rare case our stored copy is somehow missing — never the primary path.
This is the safer read of your two options ("can we not save it, but if not we save it
privately") given the retention window is an unknown.

### Storage design — a private sibling to the public folder, per-shipment subfolders

Revised per your steer: not a Buffer on the Mongo document — a filesystem layout that
mirrors how `fileManager.js` already handles public uploads, but private, and structured
so a shipment can hold more than one file (not just one label — this also gives us
somewhere to put a customs/commercial-invoice PDF later for international UPS shipments,
without redesigning anything).

```
server-src/private/                  ← new, sibling to server-src/public/, NEVER mounted
  shipments/
    <shipmentId>/
      label.pdf                      (or .gif / .zpl — whatever format we requested)
      commercial-invoice.pdf         (future — not built now, just noted as why this shape)
```

`server-src/private/` is never passed to `express.static` anywhere — the only way to
read a file under it is through the authenticated controller below. Add
`server-src/private/shipments/` to `.gitignore`, same treatment as the existing
`server-src/public/pictures` / `server-src/public/videos` entries.

**New helper** `server-src/helpers/privateFileManager.js` — `PRIVATE_DIR`,
`saveShipmentFile({ shipmentId, buffer, filename, contentType })` (writes under
`shipments/<shipmentId>/<filename>`, `mkdirSync(..., { recursive: true })` same as
`fileManager.js` already does for its own folders), `deleteShipmentFiles(shipmentId)`
(removes the whole `shipments/<shipmentId>/` folder in one shot).

**`shipmentModel.js` addition** — metadata only, not the bytes (the bytes live on disk):

```js
files: [{
  kind: String,          // "label" for now; room for "commercial_invoice" etc. later
  format: String,        // "PDF" | "GIF" | "ZPL"
  filename: String,      // e.g. "label.pdf"
  path: String,          // relative path under PRIVATE_DIR, e.g. "shipments/<id>/label.pdf"
  contentType: String,
  storedAt: Date,
}],
```

### Controller — admin-only, reads straight from the private folder

`GET /api/shipments/orders/:id/label` — same `secureRole([ADMIN, SUPER_ADMIN])`
convention as the rest of `shipmentRoutes.js`. Looks up the `"label"` entry in
`shipment.files`, reads that path under `PRIVATE_DIR`, streams it with the stored
`Content-Type`. A `?download=true` query flag flips `Content-Disposition` from `inline`
(view/print in-browser) to `attachment` (force download) — one route, two behaviors. If
no `"label"` entry exists, falls back to UPS's Label Recovery endpoint using
`shipment.trackingNumber`, saves the result via `saveShipmentFile` and appends it to
`files` if that succeeds, and only 404s if recovery also fails.

### Cleanup — delete after delivered

Wired into `applyShipmentStatusToOrder` (the shared helper the manual admin status-update
route already runs through, and the future auto-create/auto-update paths will too): when
a shipment's status transitions to `DELIVERED`, call `deleteShipmentFiles(shipment._id)`
and clear `shipment.files` as a side effect before saving. Matches your "we can still
delete it afterwards when shipment is delivered" exactly — and because it deletes the
whole per-shipment folder, not just the label, any future file kind gets cleaned up the
same way for free.

### Frontend

- `ShipmentServices.getLabel(orderId, { download })` — new hook in
  `custom-hooks/shipments.js`. Can't go through the existing `axiosCall` helper
  unmodified (it always parses JSON) — needs `responseType: 'blob'`, so this one calls
  the underlying axios instance directly.
- `GET /api/shipments/orders/:id` (already returns the shipment) gains a cheap
  `hasLabel: boolean` field (not the binary itself) so `shipment-modal.jsx` can decide
  whether to show a label action without fetching potentially-large binary data just to
  check.
- In `shipment-modal.jsx`: once a shipment exists with `hasLabel: true`, add "View /
  Print Label" (opens the blob in a new tab via `URL.createObjectURL` — the browser's
  native PDF/image viewer handles printing) and "Download" (the `?download=true` variant
  behind a real `<a download>` link).

---

## USPS — added after UPS, same shape

Built by mirroring the UPS implementation file-for-file:
`config/usps.js` (OAuth2 client-credentials, same caching pattern),
`providers/shippingProviders/uspsProvider.js` (getQuote/createShipment/
getShipment, `supportsAutoTracking: true`), a `usps` branch in
`shipmentWebhookMiddleware.js`, `processUspsShipmentEvent` in
`shipmentController.js`. The webhook route consolidation from the UPS round
(`/:provider/webhook` + a handler map) paid off here — adding USPS's webhook
route was a one-line addition instead of a new route declaration.

Real differences from UPS, not just copy-paste:

- **USPS is domestic-only.** `getQuote` returns `null` (not an error) for
  any non-US origin or destination — a genuine "can't serve" case for the
  fallback chain, not a formality like it mostly is for `internalProvider`.
- **USPS's webhook signature scheme is different in shape**, not just
  header name: it signs `timestamp + payload` together (UPS/Shopify sign
  the raw body alone), digest in an `X-HMAC` header alongside an `X-Timestamp`
  header. Both header names are best-effort — USPS's Subscriptions-Tracking
  docs describe the scheme but I don't have a live payload to confirm exact
  header casing/names against.
- **No confirmed Label Recovery equivalent.** `uspsProvider` doesn't export
  `recoverLabel` at all — `shipmentController.getShipmentLabel`'s recovery
  fallback is now generic (`typeof provider.recoverLabel === "function"`)
  rather than hardcoded to `"ups"`, so USPS cleanly 404s instead of crashing
  when a stored label is ever missing.
- **Label purchase needs a payment step UPS doesn't require.** USPS's Labels
  API expects an `X-Payment-Authorization-Token` header, sourced from a
  separate Payments API call tied to an EPS/permit account — not
  implemented (no live account to build it against). `createShipment`
  currently sends `process.env.USPS_PAYMENT_AUTH_TOKEN` as a placeholder;
  label purchase will 4xx against a real USPS account until that Payments
  API flow is built. Flagging this now so it isn't a surprise later — it's
  the one piece of USPS that's more than "swap the field names."

New env vars: `USPS_CLIENT_ID`, `USPS_CLIENT_SECRET`, `USPS_CRID`,
`USPS_MAILER_ID`, `USPS_API_BASE_URL`, `USPS_WEBHOOK_SECRET`,
`USPS_PAYMENT_AUTH_TOKEN` (placeholder, see above).

Frontend delta for USPS turned out to be one line —
`ENABLED_SHIPPING_PROVIDERS` in `app-const.js`. The Shipment Settings
fallback-provider toggles and the shipment modal's label view/download UI
were both already built generically off that array and the `files[]`
metadata, not hardcoded to `"ups"`, so USPS showed up in both automatically.

## What's still open

- Neither UPS nor USPS has live credentials — everything is proven correct
  against mocked HTTP, not a real sandbox call. First real task once
  credentials exist for either: confirm the exact field names/webhook
  header names noted as "best-effort" throughout both provider files.
- USPS's Payments API step (above) has no implementation at all yet, only
  a placeholder env var.
- Label format defaulted to PDF for both, per the earlier open question —
  never revisited since it turned out non-blocking.

## Open questions

1. ~~Confirm store-it-ourselves-with-UPS-as-fallback~~ → **confirmed**, storage design
   above reflects it.
2. **Label format** — still open. UPS supports GIF (smallest, what thermal label
   printers expect), PDF (nicer for a standard office printer), or ZPL (raw
   thermal-printer language). Do you already have (or plan to get) a thermal label
   printer, or is this printing on a normal office printer? That decides the default —
   I'd lean PDF unless you're getting a label printer. Not fully blocking though: the
   per-shipment folder design means this is a cheap default to change later, or even to
   request multiple formats per shipment up front — doesn't need to be settled before
   Phase 1 starts.

Given question 2 no longer blocks anything, Phase 1 for this doc is ready to start: the
whole UPS piece together — provider (quote/ship/track/webhook) + label storage/
controller/frontend — since they're one cohesive unit now that Shopify is out of the
shipping chain. Defaulting to PDF unless you say otherwise before I get to that part.
