// Only getMyPayments/getPayments — createStripeIntent and the Stripe
// webhook (processStripeEvent) are intentionally not tested here, see
// tests/README.md.

const request = require("supertest");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { createUser, createAdmin, generateToken } = require("../setup/fixtures");
const { Payment } = require("../../server-src/models/paymentModel");

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

describe("GET /api/payment/me", () => {
  it("only returns the caller's own payments", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const token = generateToken(user);

    await Payment.create({
      orderId: "64b1f3f3f3f3f3f3f3f3f3f3",
      user: user._id,
      userEmail: user.email,
      amountToPay: 50,
      currency: "USD",
    });
    await Payment.create({
      orderId: "64b1f3f3f3f3f3f3f3f3f3f4",
      user: otherUser._id,
      userEmail: otherUser.email,
      amountToPay: 30,
      currency: "USD",
    });

    const res = await request(app)
      .get("/api/payment/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("filters by status", async () => {
    const user = await createUser();
    const token = generateToken(user);

    await Payment.create({
      orderId: "64b1f3f3f3f3f3f3f3f3f3f3",
      user: user._id,
      userEmail: user.email,
      amountToPay: 50,
      currency: "USD",
      status: "success",
    });
    await Payment.create({
      orderId: "64b1f3f3f3f3f3f3f3f3f3f4",
      user: user._id,
      userEmail: user.email,
      amountToPay: 30,
      currency: "USD",
      status: "pending",
    });

    const res = await request(app)
      .get("/api/payment/me?status=success")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe("success");
  });
});

describe("GET /api/payment (admin)", () => {
  it("lists all payments across users", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const user = await createUser();

    await Payment.create({
      orderId: "64b1f3f3f3f3f3f3f3f3f3f3",
      user: user._id,
      userEmail: user.email,
      amountToPay: 50,
      currency: "USD",
    });

    const res = await request(app)
      .get("/api/payment")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("filters by provider", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const user = await createUser();

    await Payment.create({
      orderId: "64b1f3f3f3f3f3f3f3f3f3f3",
      user: user._id,
      userEmail: user.email,
      amountToPay: 50,
      currency: "USD",
      provider: "stripe",
    });
    await Payment.create({
      orderId: "64b1f3f3f3f3f3f3f3f3f3f4",
      user: user._id,
      userEmail: user.email,
      amountToPay: 30,
      currency: "USD",
      provider: "paypal",
    });

    const res = await request(app)
      .get("/api/payment?provider=stripe")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.data).toHaveLength(1);
  });

  it("rejects a non-admin caller", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .get("/api/payment")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});
