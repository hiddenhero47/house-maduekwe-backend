const request = require("supertest");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const {
  createAdmin,
  createUser,
  generateToken,
  createAttribute,
  createShopItem,
  createCategory,
} = require("../setup/fixtures");

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

describe("GET /api/attributes", () => {
  it("is public, and supports type + search filters", async () => {
    await createAttribute({ name: "Red", value: "red", type: "color" });
    await createAttribute({ name: "Large", value: "L", type: "size" });

    const all = await request(app).get("/api/attributes");
    expect(all.body.data).toHaveLength(2);

    const byType = await request(app).get("/api/attributes?type=size");
    expect(byType.body.data).toHaveLength(1);
    expect(byType.body.data[0].name).toBe("Large");

    const bySearch = await request(app).get("/api/attributes?search=red");
    expect(bySearch.body.data).toHaveLength(1);
  });
});

describe("POST /api/attributes", () => {
  it("creates an attribute (admin)", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const res = await request(app)
      .post("/api/attributes")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Blue", value: "blue", type: "color" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Blue");
  });

  it("rejects an invalid type", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const res = await request(app)
      .post("/api/attributes")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Blue", value: "blue", type: "not-a-real-type" });

    expect(res.status).toBe(400);
  });

  it("rejects a non-admin caller", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .post("/api/attributes")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Blue", value: "blue", type: "color" });

    expect(res.status).toBe(401);
  });
});

describe("PUT /api/attributes/:id", () => {
  it("updates name/value/display but the type field cannot change", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const attribute = await createAttribute({ type: "color" });

    const res = await request(app)
      .put(`/api/attributes/${attribute._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Crimson", value: "crimson" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Crimson");
    expect(res.body.type).toBe("color");
  });
});

describe("DELETE /api/attributes/:id", () => {
  it("deletes an unused attribute", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const attribute = await createAttribute();

    const res = await request(app)
      .delete(`/api/attributes/${attribute._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("refuses to delete an attribute currently used by a shop item", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const attribute = await createAttribute({ type: "color" });
    const category = await createCategory();

    await createShopItem({
      category: category._id,
      attributes: [{ Attribute: attribute._id, type: "color", quantity: 5 }],
    });

    const res = await request(app)
      .delete(`/api/attributes/${attribute._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.itemsUsingAttribute).toBe(1);
  });
});
