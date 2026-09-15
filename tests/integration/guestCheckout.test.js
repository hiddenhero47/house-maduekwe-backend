const request = require("supertest");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { createShopItem, createExportFee } = require("../setup/fixtures");
const { ShopItem } = require("../../server-src/models/shopItemModel");

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

// price 40 × qty 3 = 120 totalAmount, productTax 5% = 6
// destination = NG/Lagos, no state override -> defaultAmount 20, defaultVat 7.5% of 120 = 9
const setupGuestFixtures = async () => {
  const shopItem = await createShopItem({
    price: 40,
    productTax: 5,
    weight: { value: 0.2, unit: "kg" },
  });

  await createExportFee({ country: "NG", defaultAmount: 20, defaultVat: 7.5, states: [] });

  return { shopItem };
};

const guestBody = (shopItem, overrides = {}) => ({
  itemList: [{ shopItem: shopItem._id.toString(), quantity: 3, selectedAttributes: [] }],
  consigneesName: "Guest Buyer",
  email: "guest@example.com",
  address: {
    country: "NG",
    state: "Lagos",
    city: "Ikeja",
    fullAddress: "10 Guest Ave",
  },
  ...overrides,
});

describe("POST /api/orders/guest-confirm-checkout", () => {
  it("returns a checkoutToken and the correct totals", async () => {
    const { shopItem } = await setupGuestFixtures();

    const res = await request(app)
      .post("/api/orders/guest-confirm-checkout")
      .send(guestBody(shopItem));

    expect(res.status).toBe(200);
    expect(res.body.checkoutToken).toEqual(expect.any(String));
    expect(res.body.order.totalAmount).toBe(120);
    expect(res.body.order.totalProductTax).toBe(6);
    expect(res.body.order.shippingFee).toBe(20);
    expect(res.body.order.totalVat).toBe(9);
  });

  it("reports an existing pending guest order without blocking (preview only)", async () => {
    const { shopItem } = await setupGuestFixtures();

    await request(app).post("/api/orders/guest-checkout").send(guestBody(shopItem));

    const res = await request(app)
      .post("/api/orders/guest-confirm-checkout")
      .send(guestBody(shopItem));

    expect(res.status).toBe(200);
    expect(res.body.isPendingOrder).toBe(true);
  });
});

describe("POST /api/orders/guest-checkout", () => {
  it("creates a guest Order and decrements stock", async () => {
    const { shopItem } = await setupGuestFixtures();

    const res = await request(app)
      .post("/api/orders/guest-checkout")
      .send(guestBody(shopItem));

    expect(res.status).toBe(201);
    expect(res.body.order.checkoutType).toBe("guest-checkout");
    expect(res.body.order.totalAmount).toBe(120);
    expect(res.body.order.totalVat).toBe(9);
    expect(res.body.order.userEmail).toBe("guest@example.com");
    expect(res.body.order.extraInfo.checkoutTrusted).toBe(false);

    const updatedItem = await ShopItem.findById(shopItem._id).lean();
    expect(updatedItem.quantity).toBe(97); // 100 - 3
  });

  it("rejects a second guest checkout while a pending order exists for that email", async () => {
    const { shopItem } = await setupGuestFixtures();

    const first = await request(app)
      .post("/api/orders/guest-checkout")
      .send(guestBody(shopItem));
    expect(first.status).toBe(201);

    const shopItem2 = await createShopItem({ price: 5 });

    const second = await request(app)
      .post("/api/orders/guest-checkout")
      .send(guestBody(shopItem2));

    expect(second.status).toBe(400);
    expect(second.body.code).toBe("GUEST_PENDING_ORDER");
  });
});
