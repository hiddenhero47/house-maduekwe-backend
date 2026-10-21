# Shipping Integration Plan — Internal + UPS + USPS

Status: **UPS and USPS both fully implemented, including USPS's Payments
API step, tested against mocked HTTP (287 backend tests passing). Neither
has live credentials yet — the only remaining work is registration (see
`docs/shipping-provider-credentials-checklist.md`) and confirming
best-effort field names against a real sandbox once that's done.**

The real shipping providers for this project are `internal` (ExportFee,
already built), `ups`, and `usps`.

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
  keyed on expiry (new pattern here — Stripe uses a static long-lived token,
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
  shape already used for Stripe, UPS's own header name.
- `shipmentController.js` gets a `processUpsShipmentEvent` webhook handler.
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
  header name: confirmed against the real "Subscriptions - Tracking 3.2"
  spec (`docs/subscriptions-tracking-v3r2_6.yaml`). It signs
  `timestamp + payload` together (UPS signs the raw body alone), digest in
  an `X-HMAC` header — there is no separate timestamp header; `timestamp`
  and `payload` are fields *inside* the delivered JSON envelope
  (`{ subscriptionId, subscriptionType, timestamp, payload }`), and
  `payload` is itself a JSON-formatted string requiring a second
  `JSON.parse` to reach the actual tracking fields.
  `registerUspsWebhook` (`setupController.js`) posts to
  `POST {USPS_API_BASE_URL}/subscriptions-tracking/v3r2/subscriptions`
  (not a `/subscriptions/v3/...` path — this was guessed wrong initially
  and confirmed 404 against live USPS before the spec was found), with a
  required `secret` (must be **exactly 32 characters** — USPS rejects any
  other length), a required `adminNotification` array of `{email}`, and
  `filterProperties: { MID, trackingEventTypes }` (filtering by MID, not
  `mailerId` as originally guessed).
- **A required `correlationId` that isn't in the spec at all, and isn't a
  code problem.** Live USPS rejected every subscription request with
  "Subscriptions must have a correlationId field" no matter where it was
  sent (body field, `X-Correlation-Id` header, query param — the query
  param was flatly rejected by their gateway's own OAS validation as
  unexpected, confirming it isn't a query param at all). The actual fix had
  nothing to do with the request shape: USPS's own Onboarding Guide
  (`onboarding-guide.pdf`, section 2.5 "Claims Process") calls out
  **Subscriptions API users** as needing to run a one-time "Refresh Claims"
  step in the Customer Onboarding Portal (`cop.usps.com` → My Apps →
  Developer Apps → Manage → Refresh Claims) to link the App to
  subscriptions — the same linking step Label/payment-account users do for
  CRIDs/MIDs/payment accounts, just not yet run for Subscriptions. Running
  it resolved the `correlationId` error completely.
- **USPS's Tracking API Access Controls (new policy, effective 4/1/2026) —
  RESOLVED.** After the Claims fix, subscription creation got a 403: "The
  requested MID is not authorized to access
  /subscriptions-tracking/v3r2/subscriptions... If you still require
  access submit an IP Agreement inquiry." This turned out to be account-side
  only, not a request-shape or code problem — USPS's own Business Portal
  text confirms the IP Agreement/"Request Tracking Access" flow is for
  businesses tracking *other companies'* packages, which never applied
  here (self-shipper, own MID). Took several rounds with USPS API Support
  (Service Request #92446487) over about three weeks, including one wrong
  answer ("register as a CEC Platform" — a heavier marketplace program that
  doesn't apply either) before it was cleared on their end. As of
  2026-10-21, `register-usps-webhook` succeeds for real:
  `status: "ENABLED"`, `accessControl: "FREE"`, with a real
  `subscriptionId` returned. **That `subscriptionId` isn't persisted
  anywhere in the codebase** — USPS's PUT/DELETE endpoints for managing the
  subscription later need it plus an ETag, so it should be saved
  (env var or DB) rather than left to only exist in that one API response.
- **No confirmed Label Recovery equivalent.** `uspsProvider` doesn't export
  `recoverLabel` at all — `shipmentController.getShipmentLabel`'s recovery
  fallback is now generic (`typeof provider.recoverLabel === "function"`)
  rather than hardcoded to `"ups"`, so USPS cleanly 404s instead of crashing
  when a stored label is ever missing.
- **Label purchase needs a payment step UPS doesn't require — now built.**
  USPS's Labels API expects an `X-Payment-Authorization-Token` header.
  `config/usps.js`'s `getPaymentAuthorizationToken()` gets a real one from
  USPS's Payments API (`POST /payments/v3/payment-authorization`, using the
  same OAuth bearer token), caches it for its documented 8-hour lifetime
  (same pattern as the OAuth token cache), and `createShipment` sends it on
  every label purchase. **Trust Account and ACH Debit are not different code
  paths** — both are represented identically as `accountType: "EPS"` +
  `USPS_EPS_ACCOUNT_NUMBER`; which funding method is actually used is a
  Business Customer Gateway setup choice, invisible to this API call. Also
  fixed along the way: `getQuote`'s pricing call had been sending `USPS_CRID`
  as its `accountNumber` — that field is the EPS account number, not the
  CRID; now uses `USPS_EPS_ACCOUNT_NUMBER` there too.

New env vars: `USPS_CLIENT_ID`, `USPS_CLIENT_SECRET`, `USPS_CRID`,
`USPS_MAILER_ID`, `USPS_MANIFEST_MID` (optional, falls back to
`USPS_MAILER_ID`), `USPS_EPS_ACCOUNT_NUMBER`, `USPS_API_BASE_URL`,
`USPS_WEBHOOK_SECRET`.

Frontend delta for USPS turned out to be one line —
`ENABLED_SHIPPING_PROVIDERS` in `app-const.js`. The Shipment Settings
fallback-provider toggles and the shipment modal's label view/download UI
were both already built generically off that array and the `files[]`
metadata, not hardcoded to `"ups"`, so USPS showed up in both automatically.

## What's still open

- Neither UPS nor USPS has live credentials for the shipping/label APIs —
  everything there is proven correct against mocked HTTP, not a real
  sandbox call. First real task once credentials exist for either: confirm
  the exact field names/request shapes noted as "best-effort" throughout
  both provider files (that includes the Payments API request/response
  shape). The Subscriptions-Tracking webhook scheme itself is no longer a
  guess — confirmed against the real spec, see above.
- Label format defaulted to PDF for both, per the earlier open question —
  never revisited since it turned out non-blocking.
- No automated retry for a failed `createShipment` (e.g. USPS declining for
  insufficient EPS funds) — discussed and deliberately not built. The
  failure is atomic and safe (no Shipment document gets created if the
  provider call fails, so the admin just retries the same "Create Shipment"
  action later), and the stats dashboard's unshipped-orders count already
  gives visibility into anything sitting unshipped — a cron job was
  considered and explicitly decided against for now.

## Resolved decisions, for the record

- **Storage**: label stored ourselves at creation time, provider-side recovery
  (where a provider supports it) as a best-effort fallback only.
- **Label format**: defaulted to PDF for both carriers — never came back up as
  blocking, since the per-shipment folder design makes it cheap to change or
  extend later.
- **USPS funding**: Trust Account, not ACH Debit — bounds a leaked credential's
  exposure to whatever's preloaded rather than a linked bank account. See
  `docs/shipping-provider-credentials-checklist.md`.
