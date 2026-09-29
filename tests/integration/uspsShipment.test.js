jest.mock("../../server-src/helpers/emailSender", () => ({
  sendTemplatedEmail: jest.fn().mockResolvedValue({}),
  loadTemplates: jest.fn().mockResolvedValue(undefined),
}));

const uspsLabelBase64 = Buffer.from("fake-usps-label-pdf").toString("base64");

const mockCreateShipment = jest.fn().mockResolvedValue({
  providerShipmentId: "9400100000000000000000",
  carrier: "USPS",
  trackingNumber: "9400100000000000000000",
  trackingUrl:
    "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400100000000000000000",
  status: "label_created",
  shippingCost: 8.02,
  currency: "USD",
  label: {
    format: "PDF",
    contentType: "application/pdf",
    data: Buffer.from(uspsLabelBase64, "base64"),
  },
  raw: {},
});

const mockGetShipment = jest.fn();

jest.mock("../../server-src/providers/shippingProviders/uspsProvider", () => ({
  name: "usps",
  supportsAutoTracking: true,
  getQuote: jest.fn(),
  createShipment: (...args) => mockCreateShipment(...args),
  getShipment: (...args) => mockGetShipment(...args),
  // no recoverLabel, matching the real module
}));

const request = require("supertest");
const crypto = require("crypto");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const {
  createAdmin,
  createUser,
  generateToken,
  createShopItem,
  createOrder,
} = require("../setup/fixtures");
const { Shipment } = require("../../server-src/models/shipmentModel");
const { PRIVATE_DIR } = require("../../server-src/helpers/privateFileManager");
const fs = require("fs");
const path = require("path");

const app = createApp();

beforeAll(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearTestDB();
  jest.clearAllMocks();
});

afterAll(async () => {
  await disconnectTestDB();
});

const createUspsShippedOrder = async () => {
  const admin = await createAdmin();
  const token = generateToken(admin);
  const buyer = await createUser();
  const shopItem = await createShopItem();
  const order = await createOrder({ user: buyer, shopItem, shippedBy: "usps" });
  return { admin, token, order };
};

describe("POST /api/shipments/orders/:id (create) — USPS", () => {
  it("creates the shipment and persists the returned label to a private file", async () => {
    const { token, order } = await createUspsShippedOrder();

    const res = await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.shipment.provider).toBe("usps");
    expect(res.body.shipment.trackingNumber).toBe("9400100000000000000000");
    expect(res.body.shipment.files[0]).toMatchObject({
      kind: "label",
      format: "PDF",
      contentType: "application/pdf",
    });

    const onDisk = fs.readFileSync(
      path.join(PRIVATE_DIR, res.body.shipment.files[0].path),
    );
    expect(onDisk.toString()).toBe("fake-usps-label-pdf");
  });
});

describe("GET /api/shipments/orders/:id/label — USPS (no recoverLabel)", () => {
  it("streams the stored label without attempting recovery", async () => {
    const { token, order } = await createUspsShippedOrder();

    await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const res = await request(app)
      .get(`/api/shipments/orders/${order._id}/label`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.toString()).toBe("fake-usps-label-pdf");
  });

  it("404s (not a crash) when the label file is missing and the provider has no recoverLabel", async () => {
    const { token, order } = await createUspsShippedOrder();

    const createRes = await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    // Simulate the stored file having gone missing without a recovery path.
    await Shipment.updateOne(
      { _id: createRes.body.shipment._id },
      { $set: { files: [] } },
    );

    const res = await request(app)
      .get(`/api/shipments/orders/${order._id}/label`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe("POST /api/shipments/usps/webhook", () => {
  const waitFor = async (check, { timeoutMs = 1000, intervalMs = 20 } = {}) => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const result = await check();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error("waitFor: condition never became true within the timeout");
  };

  const sign = (timestamp, bodyString) =>
    crypto
      .createHmac("sha256", process.env.USPS_WEBHOOK_SECRET)
      .update(timestamp + bodyString)
      .digest("base64");

  it("re-queries USPS directly and updates the shipment status", async () => {
    const { token, order } = await createUspsShippedOrder();

    await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    mockGetShipment.mockResolvedValue({
      status: "delivered",
      trackingNumber: "9400100000000000000000",
      trackingUrl: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400100000000000000000",
      raw: {},
    });

    const bodyString = JSON.stringify({ trackingNumber: "9400100000000000000000" });
    const timestamp = String(Date.now());

    const res = await request(app)
      .post("/api/shipments/usps/webhook")
      .set("Content-Type", "application/json")
      .set("x-timestamp", timestamp)
      .set("x-hmac", sign(timestamp, bodyString))
      .send(bodyString);

    expect(res.status).toBe(200);

    const shipmentInDb = await waitFor(async () => {
      const doc = await Shipment.findOne({
        trackingNumber: "9400100000000000000000",
      }).lean();
      return doc?.status === "delivered" ? doc : null;
    });

    expect(shipmentInDb.status).toBe("delivered");
    expect(mockGetShipment).toHaveBeenCalledWith({
      providerShipmentId: "9400100000000000000000",
    });
  });

  it("rejects a bad signature", async () => {
    const bodyString = JSON.stringify({ trackingNumber: "9400100000000000000000" });
    const timestamp = String(Date.now());

    const res = await request(app)
      .post("/api/shipments/usps/webhook")
      .set("Content-Type", "application/json")
      .set("x-timestamp", timestamp)
      .set("x-hmac", "not-a-real-signature")
      .send(bodyString);

    expect(res.status).toBe(401);
  });

  it("rejects a missing timestamp header", async () => {
    const bodyString = JSON.stringify({ trackingNumber: "9400100000000000000000" });

    const res = await request(app)
      .post("/api/shipments/usps/webhook")
      .set("Content-Type", "application/json")
      .set("x-hmac", sign("whatever", bodyString))
      .send(bodyString);

    expect(res.status).toBe(400);
  });
});
