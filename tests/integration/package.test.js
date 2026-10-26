const request = require("supertest");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { createAdmin, createUser, generateToken, createPackage } = require("../setup/fixtures");

const app = createApp();

const validPackage = {
  name: "Small Box",
  length: 10,
  width: 8,
  height: 4,
  weight: { value: 0.2, unit: "kg" },
};

beforeAll(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

describe("GET /api/packages", () => {
  it("is admin-only and paginated", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    await createPackage({ name: "Standard Box" });

    const res = await request(app)
      .get("/api/packages")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it("rejects an unauthenticated caller", async () => {
    const res = await request(app).get("/api/packages");
    expect(res.status).toBe(401);
  });

  it("excludes soft-deleted packages", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    await createPackage({ isDeleted: true, deletedAt: new Date() });

    const res = await request(app)
      .get("/api/packages")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.data).toHaveLength(0);
  });
});

describe("POST /api/packages", () => {
  it("creates a package", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const res = await request(app)
      .post("/api/packages")
      .set("Authorization", `Bearer ${token}`)
      .send(validPackage);

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Small Box");
    expect(res.body.length).toBe(10);
  });

  it("rejects a non-admin caller", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .post("/api/packages")
      .set("Authorization", `Bearer ${token}`)
      .send(validPackage);

    expect(res.status).toBe(401);
  });

  it("rejects a missing dimension", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const res = await request(app)
      .post("/api/packages")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Incomplete Box", length: 10, width: 8 });

    expect(res.status).toBe(400);
  });
});

describe("PUT/DELETE /api/packages/:id", () => {
  it("updates a package", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const pkg = await createPackage();

    const res = await request(app)
      .put(`/api/packages/${pkg._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validPackage, name: "Updated Box" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Box");
  });

  it("404s updating a package that doesn't exist", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const res = await request(app)
      .put("/api/packages/64b1f3f3f3f3f3f3f3f3f3f3")
      .set("Authorization", `Bearer ${token}`)
      .send(validPackage);

    expect(res.status).toBe(404);
  });

  it("soft-deletes a package", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const pkg = await createPackage();

    const res = await request(app)
      .delete(`/api/packages/${pkg._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);

    const check = await request(app)
      .get("/api/packages")
      .set("Authorization", `Bearer ${token}`);
    expect(check.body.data).toHaveLength(0);
  });
});
