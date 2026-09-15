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

describe("GET /api/export-fees/accepted-countries", () => {
  it("is public and lists only active countries", async () => {
    const { token } = await createSuperAdminWith2FA();

    await request(app)
      .post("/api/export-fees")
      .set("Authorization", `Bearer ${token}`)
      .send({ country: "US", defaultAmount: 10, defaultVat: 7.5 });

    await request(app)
      .post("/api/export-fees")
      .set("Authorization", `Bearer ${token}`)
      .send({ country: "NG", defaultAmount: 5, defaultVat: 7.5, isActive: false });

    const res = await request(app).get("/api/export-fees/accepted-countries");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(["US"]);
  });
});

describe("SUPER_ADMIN-gated export-fee CRUD", () => {
  it("requires SUPER_ADMIN, not just ADMIN", async () => {
    const admin = await createUser({ role: ROLE.ADMIN });
    const token = generateToken(admin);

    const res = await request(app)
      .get("/api/export-fees")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it("creates and lists export fees", async () => {
    const { token } = await createSuperAdminWith2FA();

    await request(app)
      .post("/api/export-fees")
      .set("Authorization", `Bearer ${token}`)
      .send({
        country: "US",
        defaultAmount: 10,
        defaultVat: 7.5,
        states: [{ state: "texas", amount: 5, vat: 6 }],
      });

    const res = await request(app)
      .get("/api/export-fees")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].states[0].state).toBe("texas");
  });

  it("updates an export fee (partial update)", async () => {
    const { token } = await createSuperAdminWith2FA();

    const created = await request(app)
      .post("/api/export-fees")
      .set("Authorization", `Bearer ${token}`)
      .send({ country: "US", defaultAmount: 10, defaultVat: 7.5 });

    const res = await request(app)
      .put(`/api/export-fees/${created.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ country: "US", defaultAmount: 20, defaultVat: 7.5 });

    expect(res.status).toBe(200);
    expect(res.body.defaultAmount).toBe(20);
  });

  it("soft-disables an export fee", async () => {
    const { token } = await createSuperAdminWith2FA();

    const created = await request(app)
      .post("/api/export-fees")
      .set("Authorization", `Bearer ${token}`)
      .send({ country: "US", defaultAmount: 10, defaultVat: 7.5 });

    const res = await request(app)
      .patch(`/api/export-fees/${created.body._id}/disable`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);

    const accepted = await request(app).get("/api/export-fees/accepted-countries");
    expect(accepted.body).toEqual([]);
  });
});

describe("DELETE /api/export-fees/:id/permanent (2FA required)", () => {
  it("rejects without a 2FA token", async () => {
    const { token } = await createSuperAdminWith2FA();

    const created = await request(app)
      .post("/api/export-fees")
      .set("Authorization", `Bearer ${token}`)
      .send({ country: "US", defaultAmount: 10, defaultVat: 7.5 });

    const res = await request(app)
      .delete(`/api/export-fees/${created.body._id}/permanent`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("2FA_REQUIRED");
  });

  it("rejects an invalid 2FA token", async () => {
    const { token } = await createSuperAdminWith2FA();

    const created = await request(app)
      .post("/api/export-fees")
      .set("Authorization", `Bearer ${token}`)
      .send({ country: "US", defaultAmount: 10, defaultVat: 7.5 });

    const res = await request(app)
      .delete(`/api/export-fees/${created.body._id}/permanent`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-2fa-token", "000000");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("2FA_INVALID");
  });

  it("permanently deletes with a valid 2FA token", async () => {
    const { token, secret } = await createSuperAdminWith2FA();

    const created = await request(app)
      .post("/api/export-fees")
      .set("Authorization", `Bearer ${token}`)
      .send({ country: "US", defaultAmount: 10, defaultVat: 7.5 });

    const validToken = authenticator.generate(secret);

    const res = await request(app)
      .delete(`/api/export-fees/${created.body._id}/permanent`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-2fa-token", validToken);

    expect(res.status).toBe(200);

    const list = await request(app)
      .get("/api/export-fees")
      .set("Authorization", `Bearer ${token}`);
    expect(list.body).toHaveLength(0);
  });
});
