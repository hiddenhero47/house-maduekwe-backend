// Setup/migration routes are time-window-guarded (see routes/setupRoutes.js)
// so they can't be reliably hit over HTTP in a test. Testing the controller
// functions directly instead — they're plain (req, res) handlers, so a
// minimal mock res is enough. Still hits the real DB.

const {
  runSetupScripts,
  migrateTaxAndVatFields,
  normalizeAddresses,
  clearCart,
  clearOrdersAndPayments,
} = require("../../server-src/controllers/setupController");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { createUser, createShopItem, createOrder, createCart } = require("../setup/fixtures");
const { User, ROLE } = require("../../server-src/models/userModel");
const { PaymentProvider } = require("../../server-src/models/paymentProviderModel");
const { ExportFee } = require("../../server-src/models/exportFeeModel");
const { ShippingSettings } = require("../../server-src/models/shippingSettingsModel");
const { ShopItem } = require("../../server-src/models/shopItemModel");
const { Order } = require("../../server-src/models/orderModel");
const { Address } = require("../../server-src/models/addressModel");
const Cart = require("../../server-src/models/cartModel");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
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

describe("runSetupScripts", () => {
  it("creates the super admin, stripe provider, US export fee, and shipping settings from a clean DB", async () => {
    const res = mockRes();

    await runSetupScripts({ body: {} }, res);

    expect(await User.exists({ role: ROLE.SUPER_ADMIN })).toBeTruthy();
    expect(await PaymentProvider.exists({ provider: "stripe" })).toBeTruthy();
    expect(await ExportFee.exists({ country: "US" })).toBeTruthy();
    expect(await ShippingSettings.exists({})).toBeTruthy();

    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.results.every((r) => r.status === "success")).toBe(true);
  });

  it("is idempotent — running twice doesn't duplicate anything", async () => {
    await runSetupScripts({ body: {} }, mockRes());
    await runSetupScripts({ body: {} }, mockRes());

    expect(await User.countDocuments({ role: ROLE.SUPER_ADMIN })).toBe(1);
    expect(await PaymentProvider.countDocuments({ provider: "stripe" })).toBe(1);
    expect(await ExportFee.countDocuments({ country: "US" })).toBe(1);
    expect(await ShippingSettings.countDocuments({})).toBe(1);
  });
});

describe("migrateTaxAndVatFields", () => {
  it("backfills legacy documents missing the new fields, and leaves migrated ones untouched", async () => {
    // Simulate pre-migration data by inserting directly via the raw driver,
    // bypassing Mongoose schema defaults/requirements entirely — this is
    // exactly the situation the migration exists to fix.
    await ExportFee.collection.insertOne({
      country: "NG",
      defaultAmount: 5,
      isActive: true,
      states: [],
    }); // no defaultVat

    await ShopItem.collection.insertOne({
      name: "Legacy Shirt",
      price: 20,
      currency: "USD",
      quantity: 5,
      imageCatalog: ["https://example.com/x.jpg"],
      vat: 7.5, // orphaned old field
      isDeleted: false,
    }); // no productTax, no weight

    const category = await require("../../server-src/models/categoryModel").create({
      name: "already-migrated",
    });
    const alreadyMigrated = await ShopItem.create({
      name: "New Shirt",
      price: 20,
      currency: "USD",
      quantity: 5,
      productTax: 3,
      weight: { value: 0.5, unit: "kg" },
      category: category._id,
      imageCatalog: ["https://example.com/x.jpg"],
    });

    const user = await createUser();
    const shopItem = await createShopItem();
    const order = await createOrder({ user, shopItem });
    await Order.collection.updateOne(
      { _id: order._id },
      { $unset: { totalProductTax: "" } },
    );

    const res = mockRes();
    await migrateTaxAndVatFields({}, res);

    const migratedFee = await ExportFee.findOne({ country: "NG" }).lean();
    expect(migratedFee.defaultVat).toBe(0);

    const migratedItem = await ShopItem.findOne({ name: "Legacy Shirt" }).lean();
    expect(migratedItem.productTax).toBe(0);
    expect(migratedItem.weight).toEqual({ value: 0.2, unit: "kg" });
    expect(migratedItem.vat).toBeUndefined();

    const untouchedItem = await ShopItem.findById(alreadyMigrated._id).lean();
    expect(untouchedItem.productTax).toBe(3); // unchanged
    expect(untouchedItem.weight.value).toBe(0.5); // unchanged

    const migratedOrder = await Order.findById(order._id).lean();
    expect(migratedOrder.totalProductTax).toBe(0);

    const payload = res.json.mock.calls[0][0];
    expect(payload.results.exportFeesDefaultVatBackfilled).toBe(1);
    expect(payload.results.shopItemsOldVatFieldRemoved).toBe(1);
  });
});

describe("normalizeAddresses", () => {
  it("renames the legacy stateLine field to addressLine2", async () => {
    const user = await createUser();
    const address = await Address.create({
      user: user._id,
      city: "Austin",
      state: "Texas",
      country: "US",
      fullAddress: "123 Test St",
    });
    await Address.collection.updateOne(
      { _id: address._id },
      { $set: { stateLine: "Apt 4B" } },
    );

    const res = mockRes();
    await normalizeAddresses({}, res);

    const updated = await Address.findById(address._id).lean();
    expect(updated.addressLine2).toBe("Apt 4B");
    expect(updated.stateLine).toBeUndefined();
  });
});

describe("clearCart", () => {
  it("clears a specific user's cart when userIds is given", async () => {
    const user1 = await createUser();
    const user2 = await createUser();
    const item = await createShopItem();
    await createCart({ user: user1, itemList: [{ shopItem: item._id, quantity: 1 }] });
    await createCart({ user: user2, itemList: [{ shopItem: item._id, quantity: 1 }] });

    const res = mockRes();
    await clearCart({ body: { userIds: [user1._id.toString()] } }, res);

    expect((await Cart.findOne({ user: user1._id })).itemList).toHaveLength(0);
    expect((await Cart.findOne({ user: user2._id })).itemList).toHaveLength(1);
  });

  it("clears every cart when no userIds are given", async () => {
    const user1 = await createUser();
    const item = await createShopItem();
    await createCart({ user: user1, itemList: [{ shopItem: item._id, quantity: 1 }] });

    await clearCart({ body: {} }, mockRes());

    expect((await Cart.findOne({ user: user1._id })).itemList).toHaveLength(0);
  });
});

describe("clearOrdersAndPayments", () => {
  it("clears everything when no ids are given", async () => {
    const user = await createUser();
    const item = await createShopItem();
    await createOrder({ user, shopItem: item });

    await clearOrdersAndPayments({ body: {} }, mockRes());

    expect(await Order.countDocuments({})).toBe(0);
  });
});
