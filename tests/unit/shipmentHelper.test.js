jest.mock("../../server-src/helpers/emailSender", () => ({
  sendTemplatedEmail: jest.fn().mockResolvedValue({}),
}));

const { applyShipmentStatusToOrder } = require("../../server-src/helpers/shipmentHelper");
const { sendTemplatedEmail } = require("../../server-src/helpers/emailSender");

// applyShipmentStatusToOrder only ever reads/writes fields on the plain
// objects it's given and calls .save() on them — it never talks to Mongoose
// directly, so a bare mock object with a jest.fn() save is enough here.
const makeOrder = (overrides = {}) => ({
  status: "paid",
  userEmail: "customer@example.com",
  checkoutType: "user-checkout",
  shippingDetails: null,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("applyShipmentStatusToOrder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("flips the order to SHIPPED once a carrier + tracking number exist", async () => {
    const order = makeOrder();
    const shipment = {
      status: "label_created",
      carrier: "DHL",
      trackingNumber: "TRACK123",
      shippedAt: new Date("2026-01-01T00:00:00Z"),
    };

    const changed = await applyShipmentStatusToOrder({ order, shipment });

    expect(changed).toBe(true);
    expect(order.status).toBe("shipped");
    expect(order.shippingDetails).toEqual({
      company: "DHL",
      trackingNumber: "TRACK123",
      shippedAt: shipment.shippedAt,
    });
    expect(order.save).toHaveBeenCalledTimes(1);
    expect(sendTemplatedEmail).toHaveBeenCalledTimes(1);
  });

  it("does NOT flip to SHIPPED if there's no tracking number yet", async () => {
    const order = makeOrder();
    const shipment = { status: "label_created", carrier: "DHL", trackingNumber: null };

    const changed = await applyShipmentStatusToOrder({ order, shipment });

    expect(changed).toBe(false);
    expect(order.status).toBe("paid");
    expect(order.save).not.toHaveBeenCalled();
    expect(sendTemplatedEmail).not.toHaveBeenCalled();
  });

  it("does NOT flip to SHIPPED if there's no carrier", async () => {
    const order = makeOrder();
    const shipment = { status: "label_created", carrier: null, trackingNumber: "TRACK123" };

    const changed = await applyShipmentStatusToOrder({ order, shipment });

    expect(changed).toBe(false);
    expect(order.status).toBe("paid");
  });

  it("flips an already-SHIPPED order to DELIVERED when the shipment is delivered", async () => {
    const order = makeOrder({ status: "shipped", shippingDetails: { company: "DHL", trackingNumber: "T1" } });
    const shipment = { status: "delivered", carrier: "DHL", trackingNumber: "T1" };

    const changed = await applyShipmentStatusToOrder({ order, shipment });

    expect(changed).toBe(true);
    expect(order.status).toBe("delivered");
    expect(order.save).toHaveBeenCalledTimes(1);
    // Delivery doesn't re-send the "shipped" email
    expect(sendTemplatedEmail).not.toHaveBeenCalled();
  });

  it("only takes ONE step per call — a PAID order jumping straight to a delivered shipment lands on SHIPPED, not DELIVERED", async () => {
    // Documents real (slightly non-obvious) behavior: the two branches are
    // mutually exclusive per call — the SHIPPED branch runs first and
    // returns immediately. In the actual app this edge case can't really
    // happen, since createShipmentForOrder always sets the order to SHIPPED
    // at shipment-creation time, so by the time any status update runs,
    // order.status is already "shipped" and the DELIVERED branch is the one
    // that fires. This test pins down what happens if that invariant is
    // ever broken (e.g. called directly on a still-PAID order).
    const order = makeOrder({ status: "paid" });
    const shipment = { status: "delivered", carrier: "DHL", trackingNumber: "T1", shippedAt: new Date() };

    const changed = await applyShipmentStatusToOrder({ order, shipment });

    expect(changed).toBe(true);
    expect(order.status).toBe("shipped");
  });

  it("does nothing and returns false once the order is already DELIVERED", async () => {
    const order = makeOrder({ status: "delivered" });
    const shipment = { status: "delivered", carrier: "DHL", trackingNumber: "T1" };

    const changed = await applyShipmentStatusToOrder({ order, shipment });

    expect(changed).toBe(false);
    expect(order.save).not.toHaveBeenCalled();
  });

  it("does not send an email when sendEmail: false is passed", async () => {
    const order = makeOrder();
    const shipment = { status: "label_created", carrier: "DHL", trackingNumber: "T1" };

    await applyShipmentStatusToOrder({ order, shipment, sendEmail: false });

    expect(order.status).toBe("shipped");
    expect(sendTemplatedEmail).not.toHaveBeenCalled();
  });
});
