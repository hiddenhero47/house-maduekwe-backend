jest.mock("../../server-src/config/ups", () => ({
  getUpsClient: jest.fn(),
  UPS_ACCOUNT_NUMBER: "TEST123",
}));

const { getUpsClient } = require("../../server-src/config/ups");
const upsProvider = require("../../server-src/providers/shippingProviders/upsProvider");

const mockClient = (impl) => {
  const client = { post: jest.fn(), get: jest.fn() };
  impl(client);
  getUpsClient.mockResolvedValue(client);
  return client;
};

describe("upsProvider.getQuote", () => {
  beforeEach(() => jest.clearAllMocks());

  it("throws if destination country is missing", async () => {
    await expect(
      upsProvider.getQuote({ items: [], destination: {} }),
    ).rejects.toThrow("Destination country is required");
  });

  it("returns a shippingFee from the cheapest rated shipment", async () => {
    mockClient((client) => {
      client.post.mockResolvedValue({
        data: {
          RateResponse: {
            RatedShipment: [
              { TotalCharges: { MonetaryValue: "24.99", CurrencyCode: "USD" } },
            ],
          },
        },
      });
    });

    const quote = await upsProvider.getQuote({
      items: [{ weightGrams: 2000 }],
      destination: { country: "US", state: "TX" },
      origin: { country: "US" },
    });

    expect(quote).toEqual({
      shippingFee: 24.99,
      currency: "USD",
      raw: expect.any(Object),
    });
  });

  it("returns null when UPS responds with no rated shipment (no price to report)", async () => {
    mockClient((client) => {
      client.post.mockResolvedValue({ data: { RateResponse: {} } });
    });

    const quote = await upsProvider.getQuote({
      items: [],
      destination: { country: "US" },
      origin: {},
    });

    expect(quote).toBeNull();
  });

  it("returns null (not a throw) on a 4xx — 'can't serve this destination'", async () => {
    mockClient((client) => {
      const err = new Error("Bad address");
      err.response = { status: 400 };
      client.post.mockRejectedValue(err);
    });

    const quote = await upsProvider.getQuote({
      items: [],
      destination: { country: "US" },
      origin: {},
    });

    expect(quote).toBeNull();
  });

  it("rethrows a real fault (5xx / network) rather than swallowing it", async () => {
    mockClient((client) => {
      const err = new Error("UPS is down");
      err.response = { status: 503 };
      client.post.mockRejectedValue(err);
    });

    await expect(
      upsProvider.getQuote({
        items: [],
        destination: { country: "US" },
        origin: {},
      }),
    ).rejects.toThrow("UPS is down");
  });

  it("floors package weight at 0.1kg so UPS never sees a 0 weight", async () => {
    const client = mockClient((c) => {
      c.post.mockResolvedValue({
        data: {
          RateResponse: {
            RatedShipment: { TotalCharges: { MonetaryValue: "5", CurrencyCode: "USD" } },
          },
        },
      });
    });

    await upsProvider.getQuote({
      items: [{ weightGrams: 0 }],
      destination: { country: "US" },
      origin: {},
    });

    const body = client.post.mock.calls[0][1];
    expect(body.RateRequest.Shipment.Package[0].PackageWeight.Weight).toBe("0.1");
  });
});

describe("upsProvider.createShipment", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns tracking info and a decoded label buffer", async () => {
    const labelBase64 = Buffer.from("fake-pdf-bytes").toString("base64");

    mockClient((client) => {
      client.post.mockResolvedValue({
        data: {
          ShipmentResponse: {
            ShipmentResults: {
              PackageResults: {
                TrackingNumber: "1Z999AA10123456784",
                ShippingLabel: { GraphicImage: labelBase64 },
              },
              ShipmentCharges: {
                TotalCharges: { MonetaryValue: "15.50", CurrencyCode: "USD" },
              },
            },
          },
        },
      });
    });

    const result = await upsProvider.createShipment({
      order: { _id: "order1", consigneesName: "Jane Doe" },
      items: [{ weightGrams: 1000 }],
      destination: { country: "US" },
      origin: { country: "US" },
    });

    expect(result.trackingNumber).toBe("1Z999AA10123456784");
    expect(result.carrier).toBe("UPS");
    expect(result.status).toBe("label_created");
    expect(result.shippingCost).toBe(15.5);
    expect(result.label.format).toBe("PDF");
    expect(result.label.contentType).toBe("application/pdf");
    expect(result.label.data.toString()).toBe("fake-pdf-bytes");
  });

  it("throws if UPS doesn't return a tracking number", async () => {
    mockClient((client) => {
      client.post.mockResolvedValue({
        data: { ShipmentResponse: { ShipmentResults: { PackageResults: {} } } },
      });
    });

    await expect(
      upsProvider.createShipment({
        order: { _id: "order1" },
        items: [],
        destination: {},
        origin: {},
      }),
    ).rejects.toThrow("did not return a tracking number");
  });
});

describe("upsProvider.getShipment", () => {
  beforeEach(() => jest.clearAllMocks());

  it("throws without a providerShipmentId", async () => {
    await expect(upsProvider.getShipment({})).rejects.toThrow(
      "providerShipmentId (UPS tracking number) is required",
    );
  });

  it("maps UPS's status type to our SHIPMENT_STATUS enum", async () => {
    mockClient((client) => {
      client.get.mockResolvedValue({
        data: {
          trackResponse: {
            shipment: [
              { package: [{ trackingNumber: "1Z1", activity: [{ status: { type: "D" } }] }] },
            ],
          },
        },
      });
    });

    const result = await upsProvider.getShipment({ providerShipmentId: "1Z1" });

    expect(result.status).toBe("delivered");
    expect(result.trackingNumber).toBe("1Z1");
  });

  it("falls back to 'pending' for an unrecognized status type", () => {
    expect(upsProvider.mapUpsStatus("???")).toBe("pending");
  });
});

describe("upsProvider.recoverLabel", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns a decoded label from the recovery response", async () => {
    const labelBase64 = Buffer.from("recovered-label").toString("base64");

    mockClient((client) => {
      client.post.mockResolvedValue({
        data: {
          LabelRecoveryResponse: {
            LabelResults: { LabelImage: { GraphicImage: labelBase64 } },
          },
        },
      });
    });

    const label = await upsProvider.recoverLabel({ trackingNumber: "1Z1" });

    expect(label.data.toString()).toBe("recovered-label");
  });

  it("throws when UPS returns no label image", async () => {
    mockClient((client) => {
      client.post.mockResolvedValue({
        data: { LabelRecoveryResponse: { LabelResults: {} } },
      });
    });

    await expect(upsProvider.recoverLabel({ trackingNumber: "1Z1" })).rejects.toThrow(
      "returned no label image",
    );
  });
});
