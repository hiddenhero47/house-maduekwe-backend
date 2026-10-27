// Setup routes are time-window-guarded (see routes/setupRoutes.js) so they
// can't be reliably hit over HTTP in a test. Testing the controller
// function directly instead — it's a plain (req, res) handler, so a
// minimal mock res is enough. Still hits the real DB.

const {
  runSetupScripts,
  backfillDefaultPackage,
  normalizeAddressSchema,
} = require("../../server-src/controllers/setupController");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { User, ROLE } = require("../../server-src/models/userModel");
const { PaymentProvider } = require("../../server-src/models/paymentProviderModel");
const { ExportFee } = require("../../server-src/models/exportFeeModel");
const { ShippingSettings } = require("../../server-src/models/shippingSettingsModel");
const { Package } = require("../../server-src/models/packageModel");
const { ShopItem } = require("../../server-src/models/shopItemModel");
const { Address } = require("../../server-src/models/addressModel");
const { createShopItem, createCategory, createUser } = require("../setup/fixtures");

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

describe("backfillDefaultPackage", () => {
  it("creates a default Package and backfills ShopItems missing one", async () => {
    // `package` is now required on ShopItem, so the only way to simulate a
    // pre-migration item genuinely missing it is a raw insert that bypasses
    // Mongoose validation — same approach this test file's README section
    // describes for other backfills (real legacy data, not a test mistake).
    const category = await createCategory();
    const { insertedId } = await ShopItem.collection.insertOne({
      name: "Legacy Shirt",
      price: 50,
      currency: "USD",
      quantity: 10,
      category: category._id,
      imageCatalog: ["https://example.com/image.jpg"],
    });
    const itemWithoutPackage = { _id: insertedId };

    const explicitPackage = await Package.create({
      name: "Custom Box",
      length: 20,
      width: 15,
      height: 10,
    });
    const itemWithPackage = await createShopItem({ package: explicitPackage._id });

    const res = mockRes();
    await backfillDefaultPackage({ body: {} }, res, jest.fn());

    const defaultPackage = await Package.findOne({ name: "Standard Box" });
    expect(defaultPackage).toBeTruthy();

    const backfilledItem = await ShopItem.findById(itemWithoutPackage._id);
    expect(backfilledItem.package.toString()).toBe(defaultPackage._id.toString());

    const untouchedItem = await ShopItem.findById(itemWithPackage._id);
    expect(untouchedItem.package.toString()).toBe(explicitPackage._id.toString());

    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.shopItemsBackfilled).toBe(1);
  });

  it("is idempotent — running twice doesn't create a second default Package", async () => {
    await backfillDefaultPackage({ body: {} }, mockRes(), jest.fn());
    await backfillDefaultPackage({ body: {} }, mockRes(), jest.fn());

    expect(await Package.countDocuments({ name: "Standard Box" })).toBe(1);
  });
});

describe("normalizeAddressSchema", () => {
  // Current Mongoose schemas/validators reject the old shape (fullAddress,
  // full-name states) — raw inserts are the only way to genuinely simulate
  // pre-migration data, same approach as backfillDefaultPackage's test above.
  it("renames fullAddress to addressLine1 and converts state names to codes", async () => {
    const user = await createUser();

    const { insertedId: addressId } = await Address.collection.insertOne({
      user: user._id,
      city: "Austin",
      state: "Texas",
      country: "US",
      fullAddress: "123 Legacy St",
      zipCode: "78701",
      isDefault: false,
    });

    await ShippingSettings.collection.insertOne({
      activeProvider: "internal",
      enabled: true,
      autoCreateShipment: false,
      fallbackProviders: [],
      originAddress: {
        country: "US",
        state: "Texas",
        city: "Houston",
        fullAddress: "1 Warehouse Way",
        zipCode: "77063",
      },
    });

    const { insertedId: exportFeeId } = await ExportFee.collection.insertOne({
      country: "US",
      defaultAmount: 10,
      defaultVat: 7.5,
      states: [{ state: "Texas", amount: 5, vat: 6 }],
      isActive: true,
    });

    const res = mockRes();
    await normalizeAddressSchema({ body: {} }, res, jest.fn());

    const address = await Address.findById(addressId).lean();
    expect(address.addressLine1).toBe("123 Legacy St");
    expect(address.fullAddress).toBeUndefined();
    expect(address.state).toBe("TX");

    const settings = await ShippingSettings.findOne().lean();
    expect(settings.originAddress.addressLine1).toBe("1 Warehouse Way");
    expect(settings.originAddress.fullAddress).toBeUndefined();
    expect(settings.originAddress.state).toBe("TX");

    const exportFee = await ExportFee.findById(exportFeeId).lean();
    expect(exportFee.states[0].state).toBe("TX");

    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.unmatchedStates).toHaveLength(0);
  });

  it("flags a state it can't match instead of guessing", async () => {
    const user = await createUser();

    await Address.collection.insertOne({
      user: user._id,
      city: "Nowhere",
      state: "Not A Real State",
      country: "US",
      fullAddress: "1 Mystery Rd",
      zipCode: "00000",
      isDefault: false,
    });

    const res = mockRes();
    await normalizeAddressSchema({ body: {} }, res, jest.fn());

    const payload = res.json.mock.calls[0][0];
    expect(payload.unmatchedStates).toHaveLength(1);
    expect(payload.unmatchedStates[0]).toMatchObject({
      collection: "Address",
      country: "US",
      state: "Not A Real State",
    });
  });

  it("is idempotent — running twice makes no further changes", async () => {
    const user = await createUser();
    const { insertedId } = await Address.collection.insertOne({
      user: user._id,
      city: "Austin",
      state: "Texas",
      country: "US",
      fullAddress: "123 Legacy St",
      zipCode: "78701",
      isDefault: false,
    });

    await normalizeAddressSchema({ body: {} }, mockRes(), jest.fn());
    await normalizeAddressSchema({ body: {} }, mockRes(), jest.fn());

    const address = await Address.findById(insertedId).lean();
    expect(address.state).toBe("TX");
    expect(address.addressLine1).toBe("123 Legacy St");
  });
});
