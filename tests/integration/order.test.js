const request = require("supertest");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const {
  createUser,
  createAdmin,
  generateToken,
  createShopItem,
  createOrder,
} = require("../setup/fixtures");
const { Order } = require("../../server-src/models/orderModel");

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

describe("GET /api/orders/me", () => {
  it("only returns the caller's own orders", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const token = generateToken(user);
    const item = await createShopItem();

    await createOrder({ user, shopItem: item });
    await createOrder({ user: otherUser, shopItem: item });

    const res = await request(app)
      .get("/api/orders/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("filters by status", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const item = await createShopItem();

    await createOrder({ user, shopItem: item, status: "paid" });
    await createOrder({ user, shopItem: item, status: "pending" });

    const res = await request(app)
      .get("/api/orders/me?status=paid")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe("paid");
  });
});

describe("GET /api/orders (admin)", () => {
  it("lists all orders across users", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const user1 = await createUser();
    const user2 = await createUser();
    const item = await createShopItem();

    await createOrder({ user: user1, shopItem: item });
    await createOrder({ user: user2, shopItem: item });

    const res = await request(app)
      .get("/api/orders")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it("rejects a non-admin caller", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .get("/api/orders")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});

describe("GET /api/orders/:id", () => {
  it("lets the owner view their own order", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const item = await createShopItem();
    const order = await createOrder({ user, shopItem: item });

    const res = await request(app)
      .get(`/api/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.order._id).toBe(order._id.toString());
  });

  it("lets an admin view any order", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const user = await createUser();
    const item = await createShopItem();
    const order = await createOrder({ user, shopItem: item });

    const res = await request(app)
      .get(`/api/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("rejects a different non-admin user viewing someone else's order", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const token = generateToken(stranger);
    const item = await createShopItem();
    const order = await createOrder({ user: owner, shopItem: item });

    const res = await request(app)
      .get(`/api/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("includes the linked payment if one exists", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const item = await createShopItem();
    const order = await createOrder({ user, shopItem: item });

    const { Payment } = require("../../server-src/models/paymentModel");
    const payment = await Payment.create({
      orderId: order._id,
      user: user._id,
      userEmail: user.email,
      amountToPay: 100,
      currency: "USD",
    });
    order.paymentId = payment._id;
    await order.save();

    const res = await request(app)
      .get(`/api/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.payment._id).toBe(payment._id.toString());
  });
});

describe("GET /api/orders/:id/public", () => {
  it("is public for guest orders", async () => {
    const user = await createUser();
    const item = await createShopItem();
    const order = await createOrder({
      user,
      shopItem: item,
      checkoutType: "guest-checkout",
    });

    const res = await request(app).get(`/api/orders/${order._id}/public`);

    expect(res.status).toBe(200);
  });

  it("rejects a non-guest order", async () => {
    const user = await createUser();
    const item = await createShopItem();
    const order = await createOrder({ user, shopItem: item }); // user-checkout

    const res = await request(app).get(`/api/orders/${order._id}/public`);

    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/orders/:id/cancel", () => {
  it("cancels a pending order and restores stock", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const item = await createShopItem({ quantity: 10 });

    const order = await createOrder({
      user,
      shopItem: item,
      status: "pending",
      quantity: 2,
      rollbackInfo: [{ quantity: 2, shopItem: item._id, attributes: [] }],
    });

    // simulate the stock decrement checkout would have done
    const { ShopItem } = require("../../server-src/models/shopItemModel");
    await ShopItem.updateOne({ _id: item._id }, { $inc: { quantity: -2 } });

    const res = await request(app)
      .patch(`/api/orders/${order._id}/cancel`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);

    const updatedOrder = await Order.findById(order._id).lean();
    expect(updatedOrder.status).toBe("cancelled");

    const updatedItem = await ShopItem.findById(item._id).lean();
    expect(updatedItem.quantity).toBe(10); // restored
  });

  it("rejects cancelling an order that isn't pending", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const item = await createShopItem();
    const order = await createOrder({ user, shopItem: item, status: "paid" });

    const res = await request(app)
      .patch(`/api/orders/${order._id}/cancel`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it("rejects a stranger cancelling someone else's order", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const token = generateToken(stranger);
    const item = await createShopItem();
    const order = await createOrder({ user: owner, shopItem: item, status: "pending" });

    const res = await request(app)
      .patch(`/api/orders/${order._id}/cancel`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/orders/cancel-expired (admin)", () => {
  it("cancels only expired pending orders", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const user = await createUser();
    const item = await createShopItem();

    const expired = await createOrder({
      user,
      shopItem: item,
      status: "pending",
      expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago
    });
    const notExpired = await createOrder({
      user,
      shopItem: item,
      status: "pending",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h from now
    });

    const res = await request(app)
      .patch("/api/orders/cancel-expired")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.cancelledCount).toBe(1);

    expect((await Order.findById(expired._id)).status).toBe("cancelled");
    expect((await Order.findById(notExpired._id)).status).toBe("pending");
  });

  it("rejects a non-admin caller", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .patch("/api/orders/cancel-expired")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/orders/guest/cancel-expired", () => {
  it("is public and cancels pending guest orders for that email", async () => {
    const user = await createUser();
    const item = await createShopItem();

    const order = await createOrder({
      user,
      shopItem: item,
      status: "pending",
      checkoutType: "guest-checkout",
      userEmail: "guest@example.com",
    });

    const res = await request(app)
      .patch("/api/orders/guest/cancel-expired")
      .send({ email: "guest@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.cancelledCount).toBe(1);
    expect((await Order.findById(order._id)).status).toBe("cancelled");
  });

  it("requires an email", async () => {
    const res = await request(app).patch("/api/orders/guest/cancel-expired").send({});
    expect(res.status).toBe(400);
  });
});
