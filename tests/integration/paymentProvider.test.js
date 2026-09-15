const request = require("supertest");
const { authenticator } = require("otplib");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { createUser, generateToken } = require("../setup/fixtures");
const { ROLE } = require("../../server-src/models/userModel");

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

const createSuperAdminWith2FA = async () => {
  const secret = authenticator.generateSecret();
  const user = await createUser({
    role: ROLE.SUPER_ADMIN,
    user2fa: { enable: true, secret },
  });
  return { user, secret, token: generateToken(user) };
};

describe("POST /api/payment-providers", () => {
  it("creates a payment provider (SUPER_ADMIN)", async () => {
    const { token } = await createSuperAdminWith2FA();

    const res = await request(app)
      .post("/api/payment-providers")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "Stripe", percentageFee: 2.9, flatFee: 0.3 });

    expect(res.status).toBe(201);
    expect(res.body.provider).toBe("stripe"); // yup .lowercase()
  });

  it("rejects a duplicate provider", async () => {
    const { token } = await createSuperAdminWith2FA();

    await request(app)
      .post("/api/payment-providers")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "stripe" });

    const res = await request(app)
      .post("/api/payment-providers")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "stripe" });

    expect(res.status).toBe(400);
  });

  it("rejects an ADMIN (not SUPER_ADMIN)", async () => {
    const admin = await createUser({ role: ROLE.ADMIN });
    const token = generateToken(admin);

    const res = await request(app)
      .post("/api/payment-providers")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "stripe" });

    expect(res.status).toBe(401);
  });
});

describe("GET /api/payment-providers/client", () => {
  it("is public and only returns active providers, minimal fields", async () => {
    const { token } = await createSuperAdminWith2FA();

    await request(app)
      .post("/api/payment-providers")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "stripe", isActive: true });

    await request(app)
      .post("/api/payment-providers")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "paypal", isActive: false });

    const res = await request(app).get("/api/payment-providers/client");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].provider).toBe("stripe");
    expect(res.body[0].percentageFee).toBeUndefined(); // projected out
  });
});

describe("PUT/DELETE /api/payment-providers/:id", () => {
  it("updates a provider's fees", async () => {
    const { token } = await createSuperAdminWith2FA();

    const created = await request(app)
      .post("/api/payment-providers")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "stripe" });

    const res = await request(app)
      .put(`/api/payment-providers/${created.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "stripe", percentageFee: 3.5 });

    expect(res.status).toBe(200);
    expect(res.body.percentageFee).toBe(3.5);
  });

  it("soft-disables a provider", async () => {
    const { token } = await createSuperAdminWith2FA();

    const created = await request(app)
      .post("/api/payment-providers")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "stripe" });

    const res = await request(app)
      .delete(`/api/payment-providers/${created.body._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);

    const client = await request(app).get("/api/payment-providers/client");
    expect(client.body).toHaveLength(0);
  });
});

describe("DELETE /api/payment-providers/:id/permanent (2FA required)", () => {
  it("permanently deletes with a valid 2FA token", async () => {
    const { token, secret } = await createSuperAdminWith2FA();

    const created = await request(app)
      .post("/api/payment-providers")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "stripe" });

    const res = await request(app)
      .delete(`/api/payment-providers/${created.body._id}/permanent`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-2fa-token", authenticator.generate(secret));

    expect(res.status).toBe(200);
  });

  it("rejects without a 2FA token", async () => {
    const { token } = await createSuperAdminWith2FA();

    const created = await request(app)
      .post("/api/payment-providers")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "stripe" });

    const res = await request(app)
      .delete(`/api/payment-providers/${created.body._id}/permanent`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});
