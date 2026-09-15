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

describe("GET /api/stats/overview", () => {
  it("rejects non-admin callers", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .get("/api/stats/overview")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it("returns zeros when there are no orders", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const res = await request(app)
      .get("/api/stats/overview")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.allTime.revenue).toBe(0);
    expect(res.body.allTime.orders).toBe(0);
    expect(res.body.awaitingShipment).toBe(0);
  });

  it("sums totalAmount + totalVat + totalProductTax + shippingFee for paid orders", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const buyer = await createUser();
    const shopItem = await createShopItem({ price: 100 });

    await createOrder({
      user: buyer,
      shopItem,
      status: "paid",
      totalAmount: 100,
      totalVat: 10,
      totalProductTax: 5,
      shippingFee: 15,
    });

    const res = await request(app)
      .get("/api/stats/overview")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.allTime.revenue).toBe(130); // 100 + 10 + 5 + 15
    expect(res.body.allTime.orders).toBe(1);
    expect(res.body.awaitingShipment).toBe(1); // paid, not yet shipped
  });

  it("does not count pending or cancelled orders as revenue", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const buyer = await createUser();
    const shopItem = await createShopItem({ price: 100 });

    await createOrder({ user: buyer, shopItem, status: "pending", totalAmount: 100 });
    await createOrder({ user: buyer, shopItem, status: "cancelled", totalAmount: 100 });

    const res = await request(app)
      .get("/api/stats/overview")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.allTime.revenue).toBe(0);
    expect(res.body.allTime.orders).toBe(0);
  });
});

describe("GET /api/stats/order-status-breakdown", () => {
  it("returns a count for every status, including zero counts", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const res = await request(app)
      .get("/api/stats/order-status-breakdown")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const statuses = res.body.data.map((d) => d.status);
    expect(statuses).toEqual(
      expect.arrayContaining(["pending", "paid", "shipped", "delivered", "cancelled"]),
    );
  });
});
