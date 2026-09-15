const request = require("supertest");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { createUser, createAdmin, generateToken, createShopItem } = require("../setup/fixtures");

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

describe("POST /api/reviews/:productId", () => {
  it("creates a review (regression: reviewController's ShopItem import bug)", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const item = await createShopItem();

    const res = await request(app)
      .post(`/api/reviews/${item._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ rating: 4, comment: "Pretty good" });

    expect(res.status).toBe(201);
    expect(res.body.review.rating).toBe(4);
  });

  it("upserts — a second review from the same user replaces the first", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const item = await createShopItem();

    await request(app)
      .post(`/api/reviews/${item._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ rating: 2, comment: "Meh" });

    await request(app)
      .post(`/api/reviews/${item._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ rating: 5, comment: "Actually great" });

    const res = await request(app).get(`/api/reviews/${item._id}`);

    expect(res.body.reviews).toHaveLength(1);
    expect(res.body.reviews[0].rating).toBe(5);
  });

  it("rejects a rating outside 1-5", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const item = await createShopItem();

    const res = await request(app)
      .post(`/api/reviews/${item._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ rating: 6 });

    expect(res.status).toBe(400);
  });

  it("404s for a nonexistent product", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .post("/api/reviews/64b1f3f3f3f3f3f3f3f3f3f3")
      .set("Authorization", `Bearer ${token}`)
      .send({ rating: 3 });

    expect(res.status).toBe(404);
  });
});

describe("GET /api/reviews/:productId", () => {
  it("is public and paginated", async () => {
    const item = await createShopItem();
    const user = await createUser();
    const token = generateToken(user);

    await request(app)
      .post(`/api/reviews/${item._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ rating: 5 });

    const res = await request(app).get(`/api/reviews/${item._id}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });
});

describe("DELETE /api/reviews/:id", () => {
  it("lets the owner delete their own review", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const item = await createShopItem();

    const created = await request(app)
      .post(`/api/reviews/${item._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ rating: 3 });

    const res = await request(app)
      .delete(`/api/reviews/${created.body.review._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("lets an admin delete someone else's review", async () => {
    const user = await createUser();
    const userToken = generateToken(user);
    const admin = await createAdmin();
    const adminToken = generateToken(admin);
    const item = await createShopItem();

    const created = await request(app)
      .post(`/api/reviews/${item._id}`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ rating: 3 });

    const res = await request(app)
      .delete(`/api/reviews/${created.body.review._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it("rejects a different non-admin user deleting someone else's review", async () => {
    const owner = await createUser();
    const ownerToken = generateToken(owner);
    const stranger = await createUser();
    const strangerToken = generateToken(stranger);
    const item = await createShopItem();

    const created = await request(app)
      .post(`/api/reviews/${item._id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ rating: 3 });

    const res = await request(app)
      .delete(`/api/reviews/${created.body.review._id}`)
      .set("Authorization", `Bearer ${strangerToken}`);

    expect(res.status).toBe(403);
  });
});
