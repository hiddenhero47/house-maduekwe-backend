jest.mock("../../server-src/helpers/emailSender", () => ({
  sendTemplatedEmail: jest.fn().mockResolvedValue({}),
  loadTemplates: jest.fn().mockResolvedValue(undefined),
}));

const request = require("supertest");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { createAdmin, createUser, generateToken, createShopItem, createOrder } = require("../setup/fixtures");
const { Order } = require("../../server-src/models/orderModel");
const { Shipment } = require("../../server-src/models/shipmentModel");
const { sendTemplatedEmail } = require("../../server-src/helpers/emailSender");

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

describe("POST /api/shipments/orders/:id (create)", () => {
  it("creates a shipment and flips the order to SHIPPED", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const buyer = await createUser();
    const shopItem = await createShopItem();
    const order = await createOrder({ user: buyer, shopItem });

    const res = await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ carrier: "DHL", trackingNumber: "TRACK123", trackingUrl: "https://track.example/123" });

    expect(res.status).toBe(201);
    expect(res.body.shipment.status).toBe("label_created");
    expect(res.body.shipment.provider).toBe("internal");
    expect(res.body.order.status).toBe("shipped");
    expect(res.body.order.shippingDetails.company).toBe("DHL");
    expect(res.body.order.shippingDetails.trackingNumber).toBe("TRACK123");
    expect(sendTemplatedEmail).toHaveBeenCalledTimes(1);

    const shipmentInDb = await Shipment.findOne({ order: order._id }).lean();
    expect(shipmentInDb).not.toBeNull();
  });

  it("uses the provider that was quoted at checkout (order.shippedBy), normalizing legacy casing", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const buyer = await createUser();
    const shopItem = await createShopItem();
    // Legacy orders (pre shipping-provider work) have shippedBy: "Internal" (capitalized)
    const order = await createOrder({ user: buyer, shopItem, shippedBy: "Internal" });

    const res = await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ carrier: "DHL", trackingNumber: "TRACK123" });

    expect(res.status).toBe(201);
    expect(res.body.shipment.provider).toBe("internal");
  });

  it("rejects if the order's shippedBy is not a registered provider", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const buyer = await createUser();
    const shopItem = await createShopItem();
    const order = await createOrder({ user: buyer, shopItem, shippedBy: "shopify" }); // disabled

    const res = await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ carrier: "DHL", trackingNumber: "TRACK123" });

    expect(res.status).toBe(500); // getShippingProvider throws, uncaught error -> 500
  });

  it("rejects a shipment for an order that isn't paid/processing", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const buyer = await createUser();
    const shopItem = await createShopItem();
    const order = await createOrder({ user: buyer, shopItem, status: "pending" });

    const res = await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ carrier: "DHL", trackingNumber: "TRACK123" });

    expect(res.status).toBe(400);
  });

  it("rejects creating a second shipment for the same order", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const buyer = await createUser();
    const shopItem = await createShopItem();
    const order = await createOrder({ user: buyer, shopItem });

    await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ carrier: "DHL", trackingNumber: "TRACK1" });

    const res = await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ carrier: "FedEx", trackingNumber: "TRACK2" });

    expect(res.status).toBe(400);

    const shipments = await Shipment.find({ order: order._id });
    expect(shipments).toHaveLength(1);
  });

  it("rejects without carrier/trackingNumber (internal provider requires them)", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const buyer = await createUser();
    const shopItem = await createShopItem();
    const order = await createOrder({ user: buyer, shopItem });

    const res = await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(500); // internalProvider.createShipment throws
  });

  it("rejects a non-admin caller", async () => {
    const user = await createUser();
    const token = generateToken(user);
    const buyer = await createUser();
    const shopItem = await createShopItem();
    const order = await createOrder({ user: buyer, shopItem });

    const res = await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ carrier: "DHL", trackingNumber: "T1" });

    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/shipments/orders/:id/status (update)", () => {
  const createShippedOrder = async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const buyer = await createUser();
    const shopItem = await createShopItem();
    const order = await createOrder({ user: buyer, shopItem });

    await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ carrier: "DHL", trackingNumber: "TRACK123" });

    return { admin, token, order };
  };

  it("moving to delivered flips the order to DELIVERED", async () => {
    const { token, order } = await createShippedOrder();

    const res = await request(app)
      .patch(`/api/shipments/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "delivered" });

    expect(res.status).toBe(200);
    expect(res.body.shipment.status).toBe("delivered");
    expect(res.body.order.status).toBe("delivered");

    const orderInDb = await Order.findById(order._id).lean();
    expect(orderInDb.status).toBe("delivered");
  });

  it("an intermediate status (e.g. in_transit) updates the shipment but leaves the order as SHIPPED", async () => {
    const { token, order } = await createShippedOrder();

    const res = await request(app)
      .patch(`/api/shipments/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "in_transit" });

    expect(res.status).toBe(200);
    expect(res.body.shipment.status).toBe("in_transit");
    expect(res.body.order.status).toBe("shipped"); // unchanged
  });

  it("rejects an invalid status value", async () => {
    const { token, order } = await createShippedOrder();

    const res = await request(app)
      .patch(`/api/shipments/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "not-a-real-status" });

    expect(res.status).toBe(400);
  });

  it("404s if there's no shipment for that order yet", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const buyer = await createUser();
    const shopItem = await createShopItem();
    const order = await createOrder({ user: buyer, shopItem });

    const res = await request(app)
      .patch(`/api/shipments/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "in_transit" });

    expect(res.status).toBe(404);
  });
});

describe("GET /api/shipments (list)", () => {
  it("lists shipments newest first, paginated", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    for (let i = 0; i < 3; i++) {
      const buyer = await createUser();
      const shopItem = await createShopItem();
      const order = await createOrder({ user: buyer, shopItem });

      await request(app)
        .post(`/api/shipments/orders/${order._id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ carrier: "DHL", trackingNumber: `TRACK${i}` });
    }

    const res = await request(app)
      .get("/api/shipments?limit=2&page=1")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.pagination.totalPages).toBe(2);
    expect(res.body.data[0].order.consigneesName).toBeDefined();
  });

  it("filters by status", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const buyer = await createUser();
    const shopItem = await createShopItem();
    const order = await createOrder({ user: buyer, shopItem });

    await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ carrier: "DHL", trackingNumber: "TRACK1" });

    const matching = await request(app)
      .get("/api/shipments?status=label_created")
      .set("Authorization", `Bearer ${token}`);
    expect(matching.body.data).toHaveLength(1);

    const nonMatching = await request(app)
      .get("/api/shipments?status=delivered")
      .set("Authorization", `Bearer ${token}`);
    expect(nonMatching.body.data).toHaveLength(0);
  });

  it("rejects a non-admin caller", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .get("/api/shipments")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});

describe("GET /api/shipments/orders/:id", () => {
  it("returns the shipment for an order", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const buyer = await createUser();
    const shopItem = await createShopItem();
    const order = await createOrder({ user: buyer, shopItem });

    await request(app)
      .post(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ carrier: "DHL", trackingNumber: "TRACK123" });

    const res = await request(app)
      .get(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.trackingNumber).toBe("TRACK123");
  });

  it("404s when no shipment exists", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);
    const buyer = await createUser();
    const shopItem = await createShopItem();
    const order = await createOrder({ user: buyer, shopItem });

    const res = await request(app)
      .get(`/api/shipments/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
