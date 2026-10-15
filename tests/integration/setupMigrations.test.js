// Setup routes are time-window-guarded (see routes/setupRoutes.js) so they
// can't be reliably hit over HTTP in a test. Testing the controller
// function directly instead — it's a plain (req, res) handler, so a
// minimal mock res is enough. Still hits the real DB.

const {
  runSetupScripts,
} = require("../../server-src/controllers/setupController");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { User, ROLE } = require("../../server-src/models/userModel");
const { PaymentProvider } = require("../../server-src/models/paymentProviderModel");
const { ExportFee } = require("../../server-src/models/exportFeeModel");
const { ShippingSettings } = require("../../server-src/models/shippingSettingsModel");

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
