// Setup routes are time-window-guarded (see routes/setupRoutes.js) so they
// can't be reliably hit over HTTP in a test. Testing the controller
// function directly instead — it's a plain (req, res) handler, so a
// minimal mock res is enough. Still hits the real DB.

const {
  runSetupScripts,
  backfillDefaultPackage,
} = require("../../server-src/controllers/setupController");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { User, ROLE } = require("../../server-src/models/userModel");
const { PaymentProvider } = require("../../server-src/models/paymentProviderModel");
const { ExportFee } = require("../../server-src/models/exportFeeModel");
const { ShippingSettings } = require("../../server-src/models/shippingSettingsModel");
const { Package } = require("../../server-src/models/packageModel");
const { ShopItem } = require("../../server-src/models/shopItemModel");
const { createShopItem } = require("../setup/fixtures");

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
    const itemWithoutPackage = await createShopItem();
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
