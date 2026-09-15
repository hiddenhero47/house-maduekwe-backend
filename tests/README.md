# Tests

Jest + Supertest. Covers essentially the whole API surface — every
controller except the Stripe- and OAuth-touching endpoints, which talk to
real third parties (see "What's deliberately NOT covered" below).

## Running

```
npm test                 # everything
npm run test:unit        # pure logic, no DB, fast
npm run test:integration # real HTTP requests against a real MongoDB
```

These all run Jest with Node's `--experimental-vm-modules` flag (baked into
the scripts) — required because `file-type` (used for real magic-byte file
validation on uploads) is ESM-only, and Jest's default CJS environment can't
do a dynamic `import()` of it without that flag. If you ever run `npx jest`
directly instead of `npm test`, add the flag yourself or upload-related
tests will fail with "A dynamic import callback was invoked without
--experimental-vm-modules".

No setup required to just run `npm test` — if `TEST_MONGO_URI` isn't set,
the integration tests automatically spin up a disposable in-memory replica
set (`mongodb-memory-server`) and tear it down afterwards. First run
downloads a MongoDB binary (cached after that), so it's slower once.

To point at your own test database instead (recommended for CI, or to match
your real cluster's version/config exactly):

1. `cp .env.test.example .env.test`
2. Fill in `TEST_MONGO_URI` — **must be a replica set**, not a standalone
   `mongod`. Checkout/order/shipment code runs multi-document transactions
   (`mongoose.startSession()`), which only work on a replica set. A free
   Atlas cluster works fine. Use a dedicated database — integration tests
   wipe every collection between tests.
3. `npm test`

`.env.test` is gitignored.

## Layout

```
tests/
  setup/
    env.js       loads .env.test (falls back to .env)
    db.js        connect/disconnect/clear the test DB
    fixtures.js  factories: users, admins, shop items, attributes,
                 export fees, addresses, carts, orders + JWT token
                 generation + a real tiny PNG (base64 + Buffer) for
                 upload tests
  unit/          pure functions, no DB, mocked where a module needs one
  integration/   real HTTP requests via supertest against server-src/app.js
```

`server-src/app.js` is the Express app builder, split out of `server.js` so
tests can get an app instance without connecting to the real DB, loading
email templates, starting cron jobs, or calling `.listen()`.

## What's covered

- **Unit**: `packageWeightHelper` (unit conversion/aggregation),
  `checkoutJwtHelper` (hash determinism, sign/verify/expiry),
  `statsHelper` (date bucket math, date-range filter),
  `shipmentHelper.applyShipmentStatusToOrder` (shipped/delivered
  transitions, mocked order/email), `internalProvider` (mocked `ExportFee`
  model), `checkoutItemsTotals` (productTax/attribute-price arithmetic).
- **Integration** — one file per resource, roughly:
  - `checkout` / `guestCheckout` — full money math (productTax, destination
    VAT with state overrides, shipping fee), the checkout-JWT
    quote-reuse-at-confirm / always-fresh-at-checkout behavior (verified
    with a real `jest.spyOn` on the provider), stock decrement, pending-order
    guard.
  - `shipment` / `shippingSettings` — create → order SHIPPED, status update
    → order DELIVERED, the `shippedBy` provider-resolution fix,
    one-shipment-per-order, provider-enum enforcement.
  - `order` / `payment` — everything except checkout itself and Stripe:
    listing, ownership checks, cancellation + stock restore, expired-order
    cleanup (admin and guest), a regression guard that
    `PATCH /api/orders/:id/status` really is gone.
  - `user` — register/login, 2FA setup+enforcement (real TOTP via `otplib`,
    no network), profile updates + session invalidation, admin user
    management, the full password-reset round trip (email mocked, real JWT).
  - `shopItem` / `media` — real file uploads exercised end-to-end (see the
    file-type/ESM note above), with every created file tracked and deleted
    afterward so tests don't leave images on disk.
  - `category` / `attribute` / `address` / `cart` / `itemGroup` / `review` /
    `exportFee` / `paymentProvider` — standard CRUD + auth/ownership rules
    per resource, including the 2FA-gated permanent-delete routes (real TOTP
    tokens).
  - `stats` / `setupMigrations` — stats sanity checks (exercises the
    `$ifNull` fix on `revenueExpr`); setup/migration controller functions
    called directly (not via HTTP — their routes are time-window-guarded,
    see routes/setupRoutes.js), including simulating pre-migration data via
    raw `collection.insertOne`/`updateOne` to actually exercise the backfill
    logic.

## Bugs found and fixed while writing these tests

Not hypothetical — each of these was caught by a test failing against real
app code, not a test-writing mistake:

- `shippingSettingsValidation.js` — a Yup gotcha where a nested object
  schema with any `.default()` inside it synthesizes a non-undefined object
  even when the parent key was never sent, so a plain
  `PUT { activeProvider: "internal" }` failed `originAddress`'s nested
  `required()` checks. Fixed with `.default(undefined)`.
- `itemGroupController.js` / `reviewController.js` — both missing a
  `mongoose`/`{ ShopItem }` import respectively; the affected code paths
  would throw a `ReferenceError`/`TypeError` the moment they ran.
- `itemGroupRoutes.js` — `secureRole(ROLE.SUPER_ADMIN, ROLE.ADMIN)` (missing
  array brackets) silently dropped the second role, so ADMIN could never
  use those routes despite that clearly being the intent everywhere else.
- `itemGroupController.js`'s `updateItemGroup` — `[...group.shopItems,
  shopItems]` pushed the whole incoming array as one nested element instead
  of spreading it.
- `mediaController.js`'s `deleteMedia` — referenced `PICTURES_DIR`/
  `VIDEOS_DIR`, which were never imported and aren't even exported from
  `fileManager.js`; "delete one media file" has always thrown in
  production. Fixed by exporting `MEDIA_MAP` from `fileManager.js`.
- `setupController.js`'s `migrateTaxAndVatFields` — the `$unset` cleanup of
  the orphaned `vat` field silently did nothing: Mongoose's `Model.
  updateMany()` drops `$unset`/`$set` on fields no longer in the schema
  unless you pass `{ strict: false }`. It reported `modifiedCount > 0`
  (timestamps still touched the doc) while `vat` itself never actually got
  removed.
- `createShopItem`/`updateShopItem` — the "is an image present" gate check
  read `base64`/`url` from the parsed `data` JSON field, while the actual
  upload call read `req.body.base64`/`url` directly — two different places,
  so sending a base64 image never actually worked. The real admin frontend
  uses actual multipart file uploads, which is why this was never caught.
  Fixed by syncing `req.body.base64`/`url` from the parsed values before
  calling `uploadHandler`; both upload paths are now tested.
- `errorMiddleware.js` only ever read `err.statusCode`, but `userModel.js`'s
  pre-save hook (duplicate Super Admin, blocked admin creation) and
  `addressModel.js`'s (max-5-addresses) both set `err.status` instead — so
  those errors surfaced as a generic 500 rather than the intended
  403/400. Concretely reachable via `changeUserRole`: it only sets the
  `_adminCreation` bypass flag for `role === "admin"`, never for
  `"superAdmin"`, so promoting anyone to Super Admin while one already
  exists always hit this. Fixed both the two call sites (now use
  `.statusCode`, matching the convention used everywhere else) and hardened
  `errorMiddleware.js` to fall back to `.status` too, so this bug class
  can't quietly reappear if someone reaches for `.status` again.

## What's deliberately NOT covered

**Stripe** (`createStripeIntent`, `processStripeEvent` webhook) and
**Google/Apple OAuth login** (`googleLogin`, `appleLogin`) — these make real
calls to third-party services. Mocking their SDKs deeply would give low
confidence it matches real behavior; standing up real webhook/OAuth
infrastructure isn't "simple to run". Stripe has already been verified
manually against real Stripe.

## Adding more tests

Use `tests/setup/fixtures.js` for common setup instead of building documents
by hand — add a new factory there if something's missing. Integration tests
should `beforeAll(connectTestDB)`, `afterEach(clearTestDB)`,
`afterAll(disconnectTestDB)` — copy the top of any existing
`tests/integration/*.test.js` file.
