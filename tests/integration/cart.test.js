const request = require("supertest");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { createUser, generateToken, createShopItem } = require("../setup/fixtures");

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

describe("POST /api/cart", () => {
  it("adds an item to a new cart", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const item = await createShopItem({ quantity: 10 });

    const res = await request(app)
      .post("/api/cart")
      .set("Authorization", `Bearer ${token}`)
      .send({ itemList: [{ shopItem: item._id.toString(), quantity: 2 }] });

    expect(res.status).toBe(201);
    expect(res.body.itemList).toHaveLength(1);
    expect(res.body.itemList[0].quantity).toBe(2);
  });

  it("appends to an existing cart rather than replacing it", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const item1 = await createShopItem({ quantity: 10 });
    const item2 = await createShopItem({ quantity: 10 });

    await request(app)
      .post("/api/cart")
      .set("Authorization", `Bearer ${token}`)
      .send({ itemList: [{ shopItem: item1._id.toString(), quantity: 1 }] });

    const res = await request(app)
      .post("/api/cart")
      .set("Authorization", `Bearer ${token}`)
      .send({ itemList: [{ shopItem: item2._id.toString(), quantity: 1 }] });

    expect(res.body.itemList).toHaveLength(2);
  });

  it("rejects adding more than the available stock", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const item = await createShopItem({ quantity: 2 });

    const res = await request(app)
      .post("/api/cart")
      .set("Authorization", `Bearer ${token}`)
      .send({ itemList: [{ shopItem: item._id.toString(), quantity: 5 }] });

    expect(res.status).toBe(400);
  });

  it("rejects a shop item id that doesn't exist", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .post("/api/cart")
      .set("Authorization", `Bearer ${token}`)
      .send({ itemList: [{ shopItem: "64b1f3f3f3f3f3f3f3f3f3f3", quantity: 1 }] });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/cart/count", () => {
  it("sums quantities across all cart items", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const item1 = await createShopItem({ quantity: 10 });
    const item2 = await createShopItem({ quantity: 10 });

    await request(app)
      .post("/api/cart")
      .set("Authorization", `Bearer ${token}`)
      .send({
        itemList: [
          { shopItem: item1._id.toString(), quantity: 2 },
          { shopItem: item2._id.toString(), quantity: 3 },
        ],
      });

    const res = await request(app)
      .get("/api/cart/count")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.count).toBe(5);
  });

  it("returns 0 for a user with no cart", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .get("/api/cart/count")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.count).toBe(0);
  });
});

describe("DELETE /api/cart", () => {
  it("removes the given items from the cart", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const item = await createShopItem({ quantity: 10 });

    const added = await request(app)
      .post("/api/cart")
      .set("Authorization", `Bearer ${token}`)
      .send({ itemList: [{ shopItem: item._id.toString(), quantity: 1 }] });

    const cartItemId = added.body.itemList[0]._id;

    const res = await request(app)
      .delete("/api/cart")
      .set("Authorization", `Bearer ${token}`)
      .send({ itemIds: [cartItemId] });

    expect(res.status).toBe(200);
    expect(res.body.itemList).toHaveLength(0);
  });
});

describe("GET /api/cart", () => {
  it("returns an empty cart message when none exists", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .get("/api/cart")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.itemList).toEqual([]);
  });
});
