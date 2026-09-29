jest.mock("../../server-src/helpers/emailSender", () => ({
  sendTemplatedEmail: jest.fn().mockResolvedValue({}),
  loadTemplates: jest.fn().mockResolvedValue(undefined),
}));

const upsLabelBase64 = Buffer.from("fake-ups-label-pdf").toString("base64");

const mockCreateShipment = jest.fn().mockResolvedValue({
  providerShipmentId: "1Z999AA10123456784",
  carrier: "UPS",
  trackingNumber: "1Z999AA10123456784",
  trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784",
  status: "label_created",
  shippingCost: 15.5,
  currency: "USD",
  label: {
    format: "PDF",
    contentType: "application/pdf",
    data: Buffer.from(upsLabelBase64, "base64"),
  },
  raw: {},
});

const mockGetShipment = jest.fn();

jest.mock("../../server-src/providers/shippingProviders/upsProvider", () => ({
  name: "ups",
  supportsAutoTracking: true,
  getQuote: jest.fn(),
  createShipment: (...args) => mockCreateShipment(...args),
  getShipment: (...args) => mockGetShipment(...args),
  recoverLabel: jest.fn(),
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

const createUpsShippedOrder = async () => {
  const admin = await createAdmin();
  const token = generateToken(admin);
  const buyer = await createUser();
  const shopItem = await createShopItem();
  const order = await createOrder({ user: buyer, shopItem, shippedBy: "ups" });
  return { admin, token, order };
};

describe("POST /api/shipments/orders/:id (create) — UPS", () => {
  it("creates the shipment and persists the returned label to a private file", async () => {
    const { token, order } = await createUpsShippedOrder();

    const res = await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.shipment.provider).toBe("ups");
    expect(res.body.shipment.trackingNumber).toBe("1Z999AA10123456784");
    expect(res.body.shipment.files).toHaveLength(1);
    expect(res.body.shipment.files[0]).toMatchObject({
      kind: "label",
      format: "PDF",
      contentType: "application/pdf",
      filename: "label.pdf",
    });

    const onDisk = fs.readFileSync(
      path.join(PRIVATE_DIR, res.body.shipment.files[0].path),
    );
    expect(onDisk.toString()).toBe("fake-ups-label-pdf");

    // never reachable via the public static folder
    expect(res.body.shipment.files[0].path.startsWith("../")).toBe(false);
  });

  it("does not require manualDetails for UPS (self-serves tracking, unlike internal)", async () => {
    const { token, order } = await createUpsShippedOrder();

    const res = await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send();

    expect(res.status).toBe(201);
    expect(mockCreateShipment).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/shipments/orders/:id/label", () => {
  const setupShipment = async () => {
    const { token, order } = await createUpsShippedOrder();

    const createRes = await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    return { token, order, shipment: createRes.body.shipment };
  };

  it("streams the label inline by default", async () => {
    const { token, order } = await setupShipment();

    const res = await request(app)
      .get(`/api/shipments/orders/${order._id}/label`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain("inline");
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.toString()).toBe("fake-ups-label-pdf");
  });

  it("switches to attachment disposition with ?download=true", async () => {
    const { token, order } = await setupShipment();

    const res = await request(app)
      .get(`/api/shipments/orders/${order._id}/label?download=true`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("attachment");
  });

  it("404s when no shipment exists for the order", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const buyer = await createUser();
    const shopItem = await createShopItem();
    const order = await createOrder({ user: buyer, shopItem });

    const res = await request(app)
      .get(`/api/shipments/orders/${order._id}/label`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it("rejects a non-admin caller", async () => {
    const { order } = await setupShipment();
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .get(`/api/shipments/orders/${order._id}/label`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});

describe("Delivered shipment cleans up its label file", () => {
  it("clears shipment.files and deletes the private folder once status hits delivered", async () => {
    const { token, order } = await createUpsShippedOrder();

    const createRes = await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const labelPath = path.join(
      PRIVATE_DIR,
      createRes.body.shipment.files[0].path,
    );
    expect(fs.existsSync(labelPath)).toBe(true);

    const statusRes = await request(app)
      .patch(`/api/shipments/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "delivered" });

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.shipment.files).toHaveLength(0);
    expect(fs.existsSync(labelPath)).toBe(false);

    const shipmentInDb = await Shipment.findById(createRes.body.shipment._id).lean();
    expect(shipmentInDb.files).toHaveLength(0);
  });
});

// processUpsShipmentEvent acknowledges the webhook (res.sendStatus(200))
// before its background work (re-query UPS, save) finishes — same
// fire-and-forget shape as the Stripe/Shopify webhook handlers. Supertest's
// request resolves as soon as that early response is sent, so asserting on
// the DB state immediately after is a race. Poll briefly instead of
// asserting the instant the HTTP response comes back.
const waitFor = async (check, { timeoutMs = 1000, intervalMs = 20 } = {}) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("waitFor: condition never became true within the timeout");
};

describe("POST /api/shipments/ups/webhook", () => {
  const sign = (buffer) =>
    crypto
      .createHmac("sha256", process.env.UPS_WEBHOOK_SECRET)
      .update(buffer)
      .digest("base64");

  it("re-queries UPS directly and updates the shipment status", async () => {
    const { token, order } = await createUpsShippedOrder();

    await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    mockGetShipment.mockResolvedValue({
      status: "delivered",
      trackingNumber: "1Z999AA10123456784",
      trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784",
      raw: {},
    });

    const payload = Buffer.from(
      JSON.stringify({ trackingNumber: "1Z999AA10123456784" }),
    );

    const res = await request(app)
      .post("/api/shipments/ups/webhook")
      .set("Content-Type", "application/json")
      .set("x-ups-signature", sign(payload))
      .send(payload.toString("utf8"));

    expect(res.status).toBe(200);

    const shipmentInDb = await waitFor(async () => {
      const doc = await Shipment.findOne({
        trackingNumber: "1Z999AA10123456784",
      }).lean();
      return doc?.status === "delivered" ? doc : null;
    });

    expect(shipmentInDb.status).toBe("delivered");
    expect(mockGetShipment).toHaveBeenCalledWith({
      providerShipmentId: "1Z999AA10123456784",
    });
  });

  it("rejects a bad signature", async () => {
    const payload = Buffer.from(JSON.stringify({ trackingNumber: "1Z1" }));

    const res = await request(app)
      .post("/api/shipments/ups/webhook")
      .set("Content-Type", "application/json")
      .set("x-ups-signature", "not-a-real-signature")
      .send(payload.toString("utf8"));

    expect(res.status).toBe(401);
  });
});
