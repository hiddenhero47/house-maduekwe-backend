const request = require("supertest");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { createAdmin, createUser, generateToken, createShopItem } = require("../setup/fixtures");

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

describe("POST /api/item-groups", () => {
  it("creates a group with shop items (admin)", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const item = await createShopItem();

    const res = await request(app)
      .post("/api/item-groups")
      .set("Authorization", `Bearer ${token}`)
      .send({ groupName: "Summer Collection", shopItems: [item._id.toString()] });

    expect(res.status).toBe(201);
    expect(res.body.shopItems).toHaveLength(1);
  });

  it("rejects a shopItems id that doesn't exist", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const res = await request(app)
      .post("/api/item-groups")
      .set("Authorization", `Bearer ${token}`)
      .send({ groupName: "Broken", shopItems: ["64b1f3f3f3f3f3f3f3f3f3f3"] });

    expect(res.status).toBe(400);
  });

  it("accepts ADMIN, not just SUPER_ADMIN (regression: secureRole array bug)", async () => {
    const admin = await createAdmin(); // role: ADMIN
    const token = generateToken(admin);

    const res = await request(app)
      .post("/api/item-groups")
      .set("Authorization", `Bearer ${token}`)
      .send({ groupName: "Admin Created" });

    expect(res.status).toBe(201);
  });

  it("rejects a non-admin caller", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .post("/api/item-groups")
      .set("Authorization", `Bearer ${token}`)
      .send({ groupName: "Nope" });

    expect(res.status).toBe(401);
  });
});

describe("PUT /api/item-groups/:id", () => {
  it("appends new shop items onto the existing list (regression: nested-array bug)", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const item1 = await createShopItem();
    const item2 = await createShopItem();

    const created = await request(app)
      .post("/api/item-groups")
      .set("Authorization", `Bearer ${token}`)
      .send({ groupName: "Group", shopItems: [item1._id.toString()] });

    const res = await request(app)
      .put(`/api/item-groups/${created.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ shopItems: [item2._id.toString()] });

    expect(res.status).toBe(200);
    expect(res.body.shopItems).toHaveLength(2);
    const ids = res.body.shopItems.map((i) => i._id);
    expect(ids).toEqual(expect.arrayContaining([item1._id.toString(), item2._id.toString()]));
  });

  it("does not duplicate a shop item that's already in the group", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const item1 = await createShopItem();

    const created = await request(app)
      .post("/api/item-groups")
      .set("Authorization", `Bearer ${token}`)
      .send({ groupName: "Group", shopItems: [item1._id.toString()] });

    const res = await request(app)
      .put(`/api/item-groups/${created.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ shopItems: [item1._id.toString()] }); // same id again

    expect(res.status).toBe(200);
    expect(res.body.shopItems).toHaveLength(1);
  });

  it("renames a group", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const created = await request(app)
      .post("/api/item-groups")
      .set("Authorization", `Bearer ${token}`)
      .send({ groupName: "Old Name" });

    const res = await request(app)
      .put(`/api/item-groups/${created.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ groupName: "New Name" });

    expect(res.status).toBe(200);
    expect(res.body.groupName).toBe("New Name");
  });
});

describe("GET /api/item-groups", () => {
  it("filters by shopItemId", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const item1 = await createShopItem();
    const item2 = await createShopItem();

    await request(app)
      .post("/api/item-groups")
      .set("Authorization", `Bearer ${token}`)
      .send({ groupName: "Group A", shopItems: [item1._id.toString()] });
    await request(app)
      .post("/api/item-groups")
      .set("Authorization", `Bearer ${token}`)
      .send({ groupName: "Group B", shopItems: [item2._id.toString()] });

    const res = await request(app).get(`/api/item-groups?shopItemId=${item1._id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].groupName).toBe("Group A");
  });
});

describe("DELETE /api/item-groups/:id", () => {
  it("deletes a group", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const created = await request(app)
      .post("/api/item-groups")
      .set("Authorization", `Bearer ${token}`)
      .send({ groupName: "To Delete" });

    const res = await request(app)
      .delete(`/api/item-groups/${created.body._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
