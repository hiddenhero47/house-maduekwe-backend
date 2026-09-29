# Shipping Provider Credentials & Setup Checklist

This is the "what do we actually need to go get" doc — separate from
`docs/shopify-ups-integration-plan.md` (the technical design). Use this to
know exactly what accounts/keys to request before either provider can be
tested against a real sandbox, let alone production.

Every account-creation step below is real-world (a business account,
paperwork, sometimes an invoice) — none of it can be done from the
codebase. The env vars are just where the resulting values land once you
have them.

---

## UPS

### Account prerequisites (before any API key exists)

- A **UPS.com business/shipper account** with an assigned **Account
  Number** — this is what `UPS_ACCOUNT_NUMBER` holds, used for both rating
  and billing.
- **Production API access specifically for Shipping + Rating requires proof
  of shipping history** — UPS asks for a copy of one of your three most
  recent invoices. In practice: the account needs to have actually shipped
  something and been billed (even manually via ups.com) before UPS will
  grant production API access. **Test/sandbox (CIE) access is available
  immediately, without this** — so development/testing against the sandbox
  can start before production approval comes through.

### Developer Portal steps

1. Create/sign in at [developer.ups.com](https://developer.ups.com/).
2. Register an "app" — generates an OAuth **Client ID** + **Client Secret**.
3. Request production access for: **Rating API**, **Shipping API**,
   **Tracking API** — submit the invoice proof above when asked.

### Env vars this fills in (`server-src/config/ups.js`)

| Env var | Where it comes from |
|---|---|
| `UPS_CLIENT_ID` | Developer Portal app registration |
| `UPS_CLIENT_SECRET` | Developer Portal app registration |
| `UPS_ACCOUNT_NUMBER` | UPS.com business/shipper account |
| `UPS_API_BASE_URL` | Already defaults to sandbox (`wwwcie.ups.com`) — switch to `onlinetools.ups.com` once production is approved |

### Webhook

| Env var | Where it comes from |
|---|---|
| `UPS_WEBHOOK_SECRET` | **You generate this yourself** (any strong random string) — enter it when registering the tracking-alert/webhook subscription in UPS's portal so both sides sign with the same value. |

---

## USPS

More steps than UPS — postage is prepaid, so there's a funding-account
enrollment layered on top of the developer-credential step.

### Account prerequisites (before any API key exists)

1. **Enroll in the USPS Business Customer Gateway**
   ([gateway.usps.com](https://gateway.usps.com/)) — this issues:
   - a **USPS User ID**
   - a **CRID** (Customer Registration ID) — identifies the business to USPS
   - a **MID** (Mailer ID) — identifies you as a mailer, required on every label
   - an **EPA** (Enterprise Payment Account), via enrolling in "USPS Ship"
2. **Enroll in EPS** (Electronic Postage System) or another approved
   payment method — this is what actually funds postage. Without it,
   label purchase fails even with otherwise-valid API credentials.
   **This is the exact piece our security conversation was about** —
   whether to hold this funding credential in the backend at all, or
   redirect admins to usps.com to complete label purchase there instead.
   See "If USPS becomes redirect-only" below for what changes if that's
   the call from the meeting.

### Developer Portal steps

3. Separately, sign in to the **USPS APIs Developer Portal**
   ([developers.usps.com](https://developers.usps.com/)) using the *same*
   Business Customer Gateway login from step 1.
4. Create an API "app" — generates a **Consumer Key** + **Consumer Secret**.

### Env vars this fills in (`server-src/config/usps.js` + `uspsProvider.js`)

| Env var | Where it comes from |
|---|---|
| `USPS_CLIENT_ID` | USPS APIs Developer Portal app registration (Consumer Key) |
| `USPS_CLIENT_SECRET` | USPS APIs Developer Portal app registration (Consumer Secret) |
| `USPS_CRID` | Business Customer Gateway enrollment |
| `USPS_MAILER_ID` | Business Customer Gateway enrollment |
| `USPS_API_BASE_URL` | Already defaults to the test environment (`apis-tem.usps.com`) — switch to `apis.usps.com` for production |
| `USPS_PAYMENT_AUTH_TOKEN` | **Placeholder only right now** — sourced from a separate USPS Payments API call tied to the EPS account, not implemented yet. This is the line item the redirect-vs-integrate decision is really about. |

### Webhook

| Env var | Where it comes from |
|---|---|
| `USPS_WEBHOOK_SECRET` | **You generate this yourself**, same as UPS — enter it when creating the Subscriptions-Tracking webhook subscription in USPS's portal. |

### If USPS becomes redirect-only (admin finishes label purchase on usps.com)

If that's the direction from the meeting, here's exactly what changes:

- **No `USPS_PAYMENT_AUTH_TOKEN`, no EPS enrollment needed on our side at
  all.** The funding credential never touches the backend — it stays in
  the admin's own USPS login session in their browser.
- `uspsProvider.createShipment` would stop calling the Labels API. Instead
  it'd work the same way `internalProvider.createShipment` already does
  today — the admin completes the purchase on usps.com, then types the
  resulting carrier + tracking number into the existing shipment modal by
  hand. Concretely: `uspsProvider.supportsAutoTracking` flips from `true`
  to `false`, and auto-create-shipment-on-payment simply skips USPS the
  same way it already skips `internal` and `shopify`.
- **`getQuote` (Rating API) and `getShipment` (Tracking API) are
  unaffected** — neither needs a spending credential, so pricing at
  checkout and tracking-status polling/webhooks keep working exactly as
  built, regardless of which way this goes.
- This is a smaller change than it sounds — mostly deleting the Labels API
  call and reusing the manual-entry pattern that already exists for
  `internalProvider`, not a redesign.

---

## Not covered here

Shopify is excluded from the shipping-provider chain entirely — see
`docs/shopify-ups-integration-plan.md` §0 for why. Nothing to request for
it in this checklist.
