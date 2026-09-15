const request = require("supertest");
const fs = require("fs");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { createAdmin, createUser, generateToken, TEST_PNG_BASE64 } = require("../setup/fixtures");
const { ROLE } = require("../../server-src/models/userModel");
const { deleteFile } = require("../../server-src/helpers/fileManager");

const app = createApp();

const uploadedPaths = [];

beforeAll(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
  await Promise.all(uploadedPaths.map((p) => deleteFile(p)));
});

const createSuperAdmin = () => createUser({ role: ROLE.SUPER_ADMIN });

describe("POST /api/media", () => {
  it("uploads a picture (super admin only)", async () => {
    const superAdmin = await createSuperAdmin();
    const token = generateToken(superAdmin);

    const res = await request(app)
      .post("/api/media?type=pictures")
      .set("Authorization", `Bearer ${token}`)
      .send({ base64: TEST_PNG_BASE64 });

    expect(res.status).toBe(201);
    expect(res.body.uploaded).toHaveLength(1);
    res.body.uploaded.forEach((f) => uploadedPaths.push(f.path));
    expect(fs.existsSync(res.body.uploaded[0].path)).toBe(true);
  });

  it("rejects a plain admin (not super admin)", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const res = await request(app)
      .post("/api/media?type=pictures")
      .set("Authorization", `Bearer ${token}`)
      .send({ base64: TEST_PNG_BASE64 });

    expect(res.status).toBe(401);
  });

  it("rejects an invalid media type", async () => {
    const superAdmin = await createSuperAdmin();
    const token = generateToken(superAdmin);

    const res = await request(app)
      .post("/api/media?type=documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ base64: TEST_PNG_BASE64 });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/media", () => {
  it("lists uploaded pictures", async () => {
    const superAdmin = await createSuperAdmin();
    const token = generateToken(superAdmin);

    const uploaded = await request(app)
      .post("/api/media?type=pictures")
      .set("Authorization", `Bearer ${token}`)
      .send({ base64: TEST_PNG_BASE64 });
    uploaded.body.uploaded.forEach((f) => uploadedPaths.push(f.path));

    const res = await request(app)
      .get("/api/media?type=pictures")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });
});

describe("DELETE /api/media", () => {
  it("deletes one file by url", async () => {
    const superAdmin = await createSuperAdmin();
    const token = generateToken(superAdmin);

    const uploaded = await request(app)
      .post("/api/media?type=pictures")
      .set("Authorization", `Bearer ${token}`)
      .send({ base64: TEST_PNG_BASE64 });

    const { url, path } = uploaded.body.uploaded[0];

    const res = await request(app)
      .delete("/api/media")
      .set("Authorization", `Bearer ${token}`)
      .send({ method: "delete-one", url, type: "pictures" });

    expect(res.status).toBe(200);
    expect(fs.existsSync(path)).toBe(false);
  });

  it("404s deleting a file that doesn't exist", async () => {
    const superAdmin = await createSuperAdmin();
    const token = generateToken(superAdmin);

    const res = await request(app)
      .delete("/api/media")
      .set("Authorization", `Bearer ${token}`)
      .send({ method: "delete-one", url: "/pictures/does-not-exist.png", type: "pictures" });

    expect(res.status).toBe(404);
  });
});
