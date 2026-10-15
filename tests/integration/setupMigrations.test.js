// Setup/migration routes are time-window-guarded (see routes/setupRoutes.js)
// so they can't be reliably hit over HTTP in a test. Testing the controller
// functions directly instead — they're plain (req, res) handlers, so a
// minimal mock res is enough. Still hits the real DB.

const {
  runSetupScripts,
  normalizeAddresses,
  clearCart,
} = require("../../server-src/controllers/setupController");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { createUser, createShopItem, createCart } = require("../setup/fixtures");
const { User, ROLE } = require("../../server-src/models/userModel");
const { PaymentProvider } = require("../../server-src/models/paymentProviderModel");
const { ExportFee } = require("../../server-src/models/exportFeeModel");
const { ShippingSettings } = require("../../server-src/models/shippingSettingsModel");
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
