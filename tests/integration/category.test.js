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

describe("GET /api/categories", () => {
  it("is public and paginated", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Shirts" });

    const res = await request(app).get("/api/categories");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("shirts"); // normalized lowercase
    expect(res.body.pagination.total).toBe(1);
  });

  it("supports case-insensitive search", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Trousers" });

    const res = await request(app).get("/api/categories?search=TROUS");

    expect(res.body.data).toHaveLength(1);
  });
});

describe("POST /api/categories", () => {
  it("normalizes the name to lowercase", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const res = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "  Jackets  " });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("jackets");
  });

  it("rejects a duplicate name", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Shoes" });

    const res = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "shoes" });

    expect(res.status).toBe(400);
  });

  it("rejects a non-admin caller", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Hats" });

    expect(res.status).toBe(401);
  });
});

describe("PUT/DELETE /api/categories/:id", () => {
  it("updates a category", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const created = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Belts" });

    const res = await request(app)
      .put(`/api/categories/${created.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Leather Belts" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("leather belts");
  });

  it("deletes a category", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const created = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Socks" });

    const res = await request(app)
      .delete(`/api/categories/${created.body._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);

    const check = await request(app).get("/api/categories");
    expect(check.body.data).toHaveLength(0);
  });

  it("404s updating a category that doesn't exist", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const res = await request(app)
      .put("/api/categories/64b1f3f3f3f3f3f3f3f3f3f3")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Ghost" });

    expect(res.status).toBe(404);
  });
});
