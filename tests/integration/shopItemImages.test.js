const request = require("supertest");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const {
  createAdmin,
  createUser,
  createAttribute,
  createShopItem,
  generateToken,
  TEST_PNG_BUFFER,
} = require("../setup/fixtures");
const { deleteFile } = require("../../server-src/helpers/fileManager");
const { attributeType } = require("../../server-src/models/attributeModel");

const app = createApp();

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

// Fake-but-shaped imageCatalog entries for tests that only exercise
// reorder/tag/remove logic and don't need a real file on disk — removeFile
// on a path that doesn't exist is a no-op (fileManager.deleteFile swallows
// ENOENT), so this is safe.
const fakeImage = (id) => ({
  id,
  fileName: `${id}.jpg`,
  path: `/tmp/not-a-real-file-${id}.jpg`,
  url: `https://example.com/${id}.jpg`,
  mime: "image/jpeg",
});

describe("POST /api/shop-items/:id/images", () => {
  it("adds images to an existing item's catalog", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const item = await createShopItem();

    const res = await request(app)
      .post(`/api/shop-items/${item._id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("images", TEST_PNG_BUFFER, "test.png");
    trackUploads(res.body.data?.imageCatalog);

    expect(res.status).toBe(201);
    expect(res.body.data.imageCatalog).toHaveLength(2); // fixture default + new
    const added = res.body.data.imageCatalog[1];
    expect(added.attrTag).toEqual([]);
  });

  it("rejects once the item is at MAX_IMAGE_CATALOG", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const fullCatalog = Array.from({ length: 24 }, (_, i) => fakeImage(`seed-${i}`));
    const item = await createShopItem({ imageCatalog: fullCatalog });

    const res = await request(app)
      .post(`/api/shop-items/${item._id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("images", TEST_PNG_BUFFER, "test.png");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/24/);
  });

  it("rejects a non-admin caller", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const item = await createShopItem();

    const res = await request(app)
      .post(`/api/shop-items/${item._id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("images", TEST_PNG_BUFFER, "test.png");

    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/shop-items/:id/images/:imageId", () => {
  it("removes one image and deletes its file from disk", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const item = await createShopItem();

    const uploadRes = await request(app)
      .post(`/api/shop-items/${item._id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("images", TEST_PNG_BUFFER, "test.png");
    const uploadedImage = uploadRes.body.data.imageCatalog[1];

    const fs = require("fs");
    expect(fs.existsSync(uploadedImage.path)).toBe(true);

    const res = await request(app)
      .delete(`/api/shop-items/${item._id}/images/${uploadedImage.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.imageCatalog).toHaveLength(1);
    expect(fs.existsSync(uploadedImage.path)).toBe(false);
  });

  it("404s for an image id that isn't in the catalog", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const item = await createShopItem();

    const res = await request(app)
      .delete(`/api/shop-items/${item._id}/images/not-a-real-id`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/shop-items/:id/images/reorder", () => {
  it("reorders the catalog to match the given id order", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const item = await createShopItem({
      imageCatalog: [fakeImage("a"), fakeImage("b"), fakeImage("c")],
    });

    const res = await request(app)
      .patch(`/api/shop-items/${item._id}/images/reorder`)
      .set("Authorization", `Bearer ${token}`)
      .send({ order: ["c", "a", "b"] });

    expect(res.status).toBe(200);
    expect(res.body.data.imageCatalog.map((img) => img.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("rejects an order that isn't an exact permutation of existing ids", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const item = await createShopItem({
      imageCatalog: [fakeImage("a"), fakeImage("b")],
    });

    const res = await request(app)
      .patch(`/api/shop-items/${item._id}/images/reorder`)
      .set("Authorization", `Bearer ${token}`)
      .send({ order: ["a", "a"] });

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/shop-items/:id/images/:imageId/tags", () => {
  it("tags an image with one of the item's own attributes, deduping ids", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const colorAttr = await createAttribute({ type: attributeType.COLOR });
    const item = await createShopItem({
      imageCatalog: [fakeImage("front")],
      attributes: [
        {
          Attribute: colorAttr._id,
          type: attributeType.COLOR,
          isDefault: true,
          quantity: 5,
        },
      ],
    });

    const res = await request(app)
      .patch(`/api/shop-items/${item._id}/images/front/tags`)
      .set("Authorization", `Bearer ${token}`)
      .send({ attrTag: [colorAttr._id.toString(), colorAttr._id.toString()] });

    expect(res.status).toBe(200);
    const tagged = res.body.data.imageCatalog.find((img) => img.id === "front");
    expect(tagged.attrTag).toEqual([colorAttr._id.toString()]);
  });

  it("rejects tagging with an attribute the item doesn't have", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const otherAttr = await createAttribute({ type: attributeType.COLOR });
    const item = await createShopItem({ imageCatalog: [fakeImage("front")] });

    const res = await request(app)
      .patch(`/api/shop-items/${item._id}/images/front/tags`)
      .set("Authorization", `Bearer ${token}`)
      .send({ attrTag: [otherAttr._id.toString()] });

    expect(res.status).toBe(400);
  });
});
