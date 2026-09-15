const request = require("supertest");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { createAdmin, createUser, generateToken, createShopItem, createOrder } = require("../setup/fixtures");

const app = createApp();

beforeAll(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

// Regression guard: updateOrderStatus / PATCH /api/orders/:id/status was
// intentionally commented out (both route and controller) — status changes
// now go entirely through the Shipment flow. This just pins down that the
// route really is gone, so nobody re-adds it by accident without noticing.
describe("PATCH /api/orders/:id/status (disabled)", () => {
  it("no longer exists as a route", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const buyer = await createUser();
    const shopItem = await createShopItem();
    const order = await createOrder({ user: buyer, shopItem });

    const res = await request(app)
      .patch(`/api/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "shipped" });

    expect(res.status).toBe(404);
  });
});
