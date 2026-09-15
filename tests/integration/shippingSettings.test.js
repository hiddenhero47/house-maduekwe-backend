const request = require("supertest");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { createAdmin, createUser, generateToken } = require("../setup/fixtures");

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

describe("GET /api/shipping-settings", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/shipping-settings");
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin user", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .get("/api/shipping-settings")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it("creates and returns a default settings document (provider: internal) for an admin", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const res = await request(app)
      .get("/api/shipping-settings")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.activeProvider).toBe("internal");
    expect(res.body.enabled).toBe(true);
  });

  it("returns the same settings document on repeated calls (doesn't create duplicates)", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const first = await request(app)
      .get("/api/shipping-settings")
      .set("Authorization", `Bearer ${token}`);
    const second = await request(app)
      .get("/api/shipping-settings")
      .set("Authorization", `Bearer ${token}`);

    expect(first.body._id).toBe(second.body._id);
  });
});

describe("PUT /api/shipping-settings", () => {
  it("updates the origin address", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const res = await request(app)
      .put("/api/shipping-settings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        originAddress: {
          country: "US",
          state: "Texas",
          city: "Austin",
          fullAddress: "1 Warehouse Way",
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.originAddress.city).toBe("Austin");
  });

  it("rejects selecting a disabled/unregistered provider (e.g. shopify)", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const res = await request(app)
      .put("/api/shipping-settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ activeProvider: "shopify" });

    expect(res.status).toBe(400);
  });

  it("accepts activeProvider: internal", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const res = await request(app)
      .put("/api/shipping-settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ activeProvider: "internal" });

    expect(res.status).toBe(200);
    expect(res.body.activeProvider).toBe("internal");
  });
});
