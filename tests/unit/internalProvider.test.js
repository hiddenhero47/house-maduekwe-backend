jest.mock("../../server-src/models/exportFeeModel", () => ({
  ExportFee: { findOne: jest.fn() },
}));

const { ExportFee } = require("../../server-src/models/exportFeeModel");
const internalProvider = require("../../server-src/providers/shippingProviders/internalProvider");

const mockExportFeeDoc = (doc) => {
  ExportFee.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(doc) });
};

describe("internalProvider.getQuote", () => {
  beforeEach(() => jest.clearAllMocks());

  it("throws if no destination country is given", async () => {
    await expect(internalProvider.getQuote({ destination: {} })).rejects.toThrow(
      "Shipping country is required",
    );
  });

  it("returns null (not a throw) if no active ExportFee exists for the country — signals 'can't serve' to the fallback loop", async () => {
    mockExportFeeDoc(null);

    const quote = await internalProvider.getQuote({
      destination: { country: "us" },
    });

    expect(quote).toBeNull();
  });

  it("queries ExportFee with the country uppercased (schema stores it uppercase)", async () => {
    mockExportFeeDoc({ country: "US", defaultAmount: 10, states: [] });

    await internalProvider.getQuote({ destination: { country: "us" } });

    expect(ExportFee.findOne).toHaveBeenCalledWith({ country: "US", isActive: true });
  });

  it("returns the country default amount when no state matches", async () => {
    mockExportFeeDoc({
      country: "US",
      defaultAmount: 10,
      states: [{ state: "texas", amount: 5 }],
    });

    const quote = await internalProvider.getQuote({
      destination: { country: "US", state: "California" },
    });

    expect(quote.shippingFee).toBe(10);
  });

  it("returns the state-specific amount when the state matches (case/whitespace-insensitive)", async () => {
    mockExportFeeDoc({
      country: "US",
      defaultAmount: 10,
      states: [{ state: "texas", amount: 5 }],
    });

    const quote = await internalProvider.getQuote({
      destination: { country: "US", state: "  TEXAS  " },
    });

    expect(quote.shippingFee).toBe(5);
  });

  it("falls back to DEFAULT_CURRENCY when no currency is passed", async () => {
    mockExportFeeDoc({ country: "US", defaultAmount: 10, states: [] });

    const quote = await internalProvider.getQuote({ destination: { country: "US" } });

    expect(quote.currency).toBe("USD");
  });

  it("echoes back the given currency instead of the default", async () => {
    mockExportFeeDoc({ country: "US", defaultAmount: 10, states: [] });

    const quote = await internalProvider.getQuote({
      destination: { country: "US" },
      currency: "EUR",
    });

    expect(quote.currency).toBe("EUR");
  });
});

describe("internalProvider.createShipment", () => {
  it("throws if carrier or trackingNumber is missing", async () => {
    await expect(internalProvider.createShipment({ manualDetails: {} })).rejects.toThrow(
      "carrier and trackingNumber are required",
    );
    await expect(
      internalProvider.createShipment({ manualDetails: { carrier: "DHL" } }),
    ).rejects.toThrow("carrier and trackingNumber are required");
  });

  it("returns a label_created shipment when carrier + trackingNumber are given", async () => {
    const result = await internalProvider.createShipment({
      manualDetails: { carrier: "DHL", trackingNumber: "T1", trackingUrl: "https://track" },
    });

    expect(result).toMatchObject({
      carrier: "DHL",
      trackingNumber: "T1",
      trackingUrl: "https://track",
      status: "label_created",
      providerShipmentId: null,
    });
  });
});

describe("internalProvider.getShipment", () => {
  it("always throws — internal shipments have nothing to poll", async () => {
    await expect(internalProvider.getShipment()).rejects.toThrow(
      "Internal shipments have no external provider to poll",
    );
  });
});
