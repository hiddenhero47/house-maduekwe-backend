const request = require("supertest");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const {
  createAdmin,
  createUser,
  createCategory,
  generateToken,
  TEST_PNG_BUFFER,
  TEST_PNG_BASE64,
} = require("../setup/fixtures");
const { deleteFile } = require("../../server-src/helpers/fileManager");

const app = createApp();

// createShopItem writes real files to server-src/public/pictures via
// fileManager.uploadHandler — track every path created so we can clean up
// after ourselves instead of leaving test images on disk.
const uploadedPaths = [];
const trackUploads = (imageCatalog = []) => {
  imageCatalog.forEach((img) => img?.path && uploadedPaths.push(img.path));
};

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

const baseItemData = (overrides = {}) => ({
  name: "Test Shirt",
  price: 50,
  productTax: 0,
  currency: "USD",
  quantity: 20,
  ...overrides,
});

// Real multipart upload — matches the actual admin frontend's
// buildShopItemFormData (a JSON "data" field + real attached image files).
// createShopItem/updateShopItem also accept base64/url images inside the
// "data" JSON field (see "creates an item with a base64 image" below) —
// that path used to be broken (the gate check and the actual upload call
// read base64/url from two different places) and has since been fixed.
const postShopItem = (token, data) =>
  request(app)
    .post("/api/shop-items")
    .set("Authorization", `Bearer ${token}`)
    .field("data", JSON.stringify(data))
    .attach("images", TEST_PNG_BUFFER, "test.png");

const putShopItem = (token, id, data) =>
  request(app)
    .put(`/api/shop-items/${id}`)
    .set("Authorization", `Bearer ${token}`)
    .field("data", JSON.stringify(data))
    .attach("images", TEST_PNG_BUFFER, "test.png");

describe("POST /api/shop-items", () => {
  it("creates an item with a real uploaded image", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const category = await createCategory();

    const res = await postShopItem(
      token,
      baseItemData({ category: category._id.toString() }),
    );
    trackUploads(res.body.data?.imageCatalog);

    expect(res.status).toBe(201);
    expect(res.body.data.imageCatalog).toHaveLength(1);
    expect(res.body.data.name).toBe("Test Shirt");
  });

  it("creates an item with a base64 image (regression: base64/url gate-check bug)", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const category = await createCategory();

    const res = await request(app)
      .post("/api/shop-items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        data: JSON.stringify(
          baseItemData({ category: category._id.toString(), base64: TEST_PNG_BASE64 }),
        ),
      });
    trackUploads(res.body.data?.imageCatalog);

    expect(res.status).toBe(201);
    expect(res.body.data.imageCatalog).toHaveLength(1);
  });

  it("rejects when no image is provided", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const category = await createCategory();

    const res = await request(app)
      .post("/api/shop-items")
      .set("Authorization", `Bearer ${token}`)
      .field("data", JSON.stringify(baseItemData({ category: category._id.toString() })));

    expect(res.status).toBe(400);
  });

  it("rejects a non-admin caller", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const category = await createCategory();

    const res = await postShopItem(
      token,
      baseItemData({ category: category._id.toString() }),
    );

    expect(res.status).toBe(401);
  });

  it("rejects a category that doesn't exist", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const res = await postShopItem(
      token,
      baseItemData({ category: "64b1f3f3f3f3f3f3f3f3f3f3" }),
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /api/shop-items", () => {
  const createItem = async (token, category, overrides = {}) => {
    const res = await postShopItem(
      token,
      baseItemData({ category: category._id.toString(), ...overrides }),
    );
    trackUploads(res.body.data?.imageCatalog);
    return res.body.data;
  };

  it("is public and filters by price range", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const category = await createCategory();

    await createItem(token, category, { name: "Cheap Shirt", price: 10 });
    await createItem(token, category, { name: "Expensive Shirt", price: 200 });

    const res = await request(app).get("/api/shop-items?minPrice=100");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Expensive Shirt");
  });

  it("filters by category", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const categoryA = await createCategory();
    const categoryB = await createCategory();

    await createItem(token, categoryA, { name: "In A" });
    await createItem(token, categoryB, { name: "In B" });

    const res = await request(app).get(`/api/shop-items?category=${categoryA._id}`);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("In A");
  });
});

describe("GET /api/shop-items/:id", () => {
  it("returns a single item, populated", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const category = await createCategory();

    const created = await postShopItem(
      token,
      baseItemData({ category: category._id.toString() }),
    );
    trackUploads(created.body.data?.imageCatalog);

    const res = await request(app).get(`/api/shop-items/${created.body.data._id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.category.name).toBe(category.name);
  });

  it("404s for a soft-deleted item", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const category = await createCategory();

    const created = await postShopItem(
      token,
      baseItemData({ category: category._id.toString() }),
    );
    trackUploads(created.body.data?.imageCatalog);

    await request(app)
      .delete(`/api/shop-items/${created.body.data._id}`)
      .set("Authorization", `Bearer ${token}`);

    const res = await request(app).get(`/api/shop-items/${created.body.data._id}`);
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/shop-items/:id", () => {
  it("updates fields and can add another image", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const category = await createCategory();

    const created = await postShopItem(
      token,
      baseItemData({ category: category._id.toString() }),
    );
    trackUploads(created.body.data?.imageCatalog);

    // shopItemValidationSchema requires the full payload on update too —
    // there's no partial-update variant, same convention as ExportFee.
    const res = await putShopItem(
      token,
      created.body.data._id,
      baseItemData({ category: category._id.toString(), price: 75 }),
    );
    trackUploads(res.body.data?.imageCatalog);

    expect(res.status).toBe(200);
    expect(res.body.data.price).toBe(75);
    expect(res.body.data.imageCatalog).toHaveLength(2);
  });
});

describe("DELETE /api/shop-items/:id", () => {
  it("deletes the item and its image files from disk", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const category = await createCategory();

    const created = await postShopItem(
      token,
      baseItemData({ category: category._id.toString() }),
    );

    const imagePath = created.body.data.imageCatalog[0].path;
    const fs = require("fs");
    expect(fs.existsSync(imagePath)).toBe(true);

    const res = await request(app)
      .delete(`/api/shop-items/${created.body.data._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(fs.existsSync(imagePath)).toBe(false); // already cleaned up, no need to track
  });
});
