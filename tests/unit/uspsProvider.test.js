jest.mock("../../server-src/config/usps", () => ({
  getUspsClient: jest.fn(),
  USPS_CRID: "TEST-CRID",
  USPS_MAILER_ID: "TEST-MID",
}));

const { getUspsClient } = require("../../server-src/config/usps");
const uspsProvider = require("../../server-src/providers/shippingProviders/uspsProvider");

const mockClient = (impl) => {
  const client = { post: jest.fn(), get: jest.fn() };
  impl(client);
  getUspsClient.mockResolvedValue(client);
  return client;
};

const usAddress = { country: "US", zipCode: "78701", city: "Austin", state: "TX" };

describe("uspsProvider.getQuote", () => {
  beforeEach(() => jest.clearAllMocks());

  it("throws if origin/destination ZIP codes are missing", async () => {
    await expect(
      uspsProvider.getQuote({ items: [], destination: {}, origin: {} }),
    ).rejects.toThrow("Origin and destination ZIP codes are required");
  });

  it("returns null for a non-US destination — USPS is domestic-only", async () => {
    const quote = await uspsProvider.getQuote({
      items: [],
      destination: { country: "GB", zipCode: "SW1A 1AA" },
      origin: usAddress,
    });

    expect(quote).toBeNull();
  });

  it("returns null for a non-US origin", async () => {
    const quote = await uspsProvider.getQuote({
      items: [],
      destination: usAddress,
      origin: { country: "CA", zipCode: "H0H 0H0" },
    });

    expect(quote).toBeNull();
  });

  it("returns a shippingFee from totalBasePrice", async () => {
    mockClient((client) => {
      client.post.mockResolvedValue({ data: { totalBasePrice: 8.02 } });
    });

    const quote = await uspsProvider.getQuote({
      items: [{ weightGrams: 2000 }],
      destination: usAddress,
      origin: usAddress,
      currency: "USD",
    });

    expect(quote).toEqual({ shippingFee: 8.02, currency: "USD", raw: expect.any(Object) });
  });

  it("returns null when USPS returns no totalBasePrice", async () => {
    mockClient((client) => {
      client.post.mockResolvedValue({ data: {} });
    });

    const quote = await uspsProvider.getQuote({
      items: [],
      destination: usAddress,
      origin: usAddress,
    });

    expect(quote).toBeNull();
  });

  it("returns null (not a throw) on a 4xx — 'can't serve this destination'", async () => {
    mockClient((client) => {
      const err = new Error("Bad ZIP");
      err.response = { status: 400 };
      client.post.mockRejectedValue(err);
    });

    const quote = await uspsProvider.getQuote({
      items: [],
      destination: usAddress,
      origin: usAddress,
    });

    expect(quote).toBeNull();
  });

  it("rethrows a real fault (5xx / network)", async () => {
    mockClient((client) => {
      const err = new Error("USPS is down");
      err.response = { status: 503 };
      client.post.mockRejectedValue(err);
    });

    await expect(
      uspsProvider.getQuote({ items: [], destination: usAddress, origin: usAddress }),
    ).rejects.toThrow("USPS is down");
  });
});

describe("uspsProvider.createShipment", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns tracking info and a decoded label buffer", async () => {
    const labelBase64 = Buffer.from("fake-usps-label-pdf").toString("base64");

    mockClient((client) => {
      client.post.mockResolvedValue({
        data: {
          labelMetadata: { trackingNumber: "9400100000000000000000", postage: 8.02 },
          labelImage: labelBase64,
        },
      });
    });

    const result = await uspsProvider.createShipment({
      order: { _id: "order1", consigneesName: "Jane Doe" },
      items: [{ weightGrams: 1000 }],
      destination: usAddress,
      origin: usAddress,
    });

    expect(result.trackingNumber).toBe("9400100000000000000000");
    expect(result.carrier).toBe("USPS");
    expect(result.shippingCost).toBe(8.02);
    expect(result.label.format).toBe("PDF");
    expect(result.label.data.toString()).toBe("fake-usps-label-pdf");
  });

  it("throws if USPS doesn't return a tracking number", async () => {
    mockClient((client) => {
      client.post.mockResolvedValue({ data: {} });
    });

    await expect(
      uspsProvider.createShipment({
        order: { _id: "order1" },
        items: [],
        destination: usAddress,
        origin: usAddress,
      }),
    ).rejects.toThrow("did not return a tracking number");
  });
});

describe("uspsProvider.getShipment", () => {
  beforeEach(() => jest.clearAllMocks());

  it("throws without a providerShipmentId", async () => {
    await expect(uspsProvider.getShipment({})).rejects.toThrow(
      "providerShipmentId (USPS tracking number) is required",
    );
  });

  it("maps USPS's statusCategory to our SHIPMENT_STATUS enum", async () => {
    mockClient((client) => {
      client.get.mockResolvedValue({
        data: { trackingNumber: "94001", statusCategory: "Delivered" },
      });
    });

    const result = await uspsProvider.getShipment({ providerShipmentId: "94001" });

    expect(result.status).toBe("delivered");
    expect(result.trackingNumber).toBe("94001");
  });

  it("falls back to 'pending' for an unrecognized statusCategory", () => {
    expect(uspsProvider.mapUspsStatus("???")).toBe("pending");
  });
});

describe("uspsProvider has no recoverLabel", () => {
  it("does not export recoverLabel — no confirmed USPS equivalent", () => {
    expect(uspsProvider.recoverLabel).toBeUndefined();
  });
});
