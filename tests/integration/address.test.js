const request = require("supertest");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { createUser, generateToken, createAddress } = require("../setup/fixtures");

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

const validAddressBody = (overrides = {}) => ({
  city: "Austin",
  state: "Texas",
  country: "US",
  fullAddress: "123 Test St",
  zipCode: "78701",
  ...overrides,
});

describe("POST /api/addresses", () => {
  it("creates an address for the logged-in user", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .post("/api/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send(validAddressBody());

    expect(res.status).toBe(201);
    expect(res.body.user).toBe(user._id.toString());
  });

  it("rejects an invalid country code", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .post("/api/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send(validAddressBody({ country: "USA" })); // must be 2 letters

    expect(res.status).toBe(400);
  });

  it("enforces the max-5-addresses limit", async () => {
    const user = await createUser();
    const token = generateToken(user);

    for (let i = 0; i < 5; i++) {
      await createAddress({ user });
    }

    const res = await request(app)
      .post("/api/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send(validAddressBody());

    expect(res.status).toBe(400);
  });

  it("unsets other default addresses when a new one is set as default", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const first = await createAddress({ user, isDefault: true });

    await request(app)
      .post("/api/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send(validAddressBody({ isDefault: true }));

    const { Address } = require("../../server-src/models/addressModel");
    const refreshedFirst = await Address.findById(first._id).lean();
    expect(refreshedFirst.isDefault).toBe(false);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).post("/api/addresses").send(validAddressBody());
    expect(res.status).toBe(401);
  });
});

describe("GET /api/addresses", () => {
  it("only returns the logged-in user's own addresses", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const token = generateToken(user);

    await createAddress({ user });
    await createAddress({ user: otherUser });

    const res = await request(app)
      .get("/api/addresses")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("PUT /api/addresses/:id", () => {
  it("updates the caller's own address", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const address = await createAddress({ user });

    const res = await request(app)
      .put(`/api/addresses/${address._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send(validAddressBody({ city: "Dallas" }));

    expect(res.status).toBe(200);
    expect(res.body.city).toBe("Dallas");
  });

  it("rejects updating another user's address", async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const token = generateToken(attacker);
    const address = await createAddress({ user: owner });

    const res = await request(app)
      .put(`/api/addresses/${address._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send(validAddressBody({ city: "Dallas" }));

    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/addresses/:id", () => {
  it("deletes the caller's own address", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const address = await createAddress({ user });

    const res = await request(app)
      .delete(`/api/addresses/${address._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("rejects deleting another user's address", async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const token = generateToken(attacker);
    const address = await createAddress({ user: owner });

    const res = await request(app)
      .delete(`/api/addresses/${address._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});
