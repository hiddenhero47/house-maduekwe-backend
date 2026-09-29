jest.mock("../../server-src/providers/shippingProviders", () => ({
  getShippingProvider: jest.fn(),
}));

const {
  getShippingProvider,
} = require("../../server-src/providers/shippingProviders");
const {
  resolveShippingQuote,
} = require("../../server-src/controllers/checkoutController");

const items = [
  { shopItem: { name: "Shirt", price: 20, weight: { value: 1, unit: "kg" } }, quantity: 1 },
];
const address = { country: "US", state: "TX", city: "Austin", zipCode: "78701", fullAddress: "1 Main St" };
const settings = { originAddress: { country: "US" }, fallbackProviders: ["ups"] };

const fakeProvider = (getQuoteImpl) => ({ getQuote: getQuoteImpl });

describe("resolveShippingQuote", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns activeProvider's quote when it succeeds", async () => {
    getShippingProvider.mockImplementation((name) => {
      if (name === "internal") {
        return fakeProvider(async () => ({ shippingFee: 12.5, currency: "USD" }));
      }
      throw new Error(`should not be called: ${name}`);
    });

    const result = await resolveShippingQuote({
      items,
      address,
      settings: { ...settings, fallbackProviders: [] },
      activeProvider: "internal",
      currency: "USD",
    });

    expect(result).toEqual({ shippingFee: 12.5, provider: "internal" });
  });

  it("falls back to the next provider when the primary returns null ('can't serve')", async () => {
    getShippingProvider.mockImplementation((name) => {
      if (name === "ups") return fakeProvider(async () => null);
      if (name === "internal")
        return fakeProvider(async () => ({ shippingFee: 8, currency: "USD" }));
      throw new Error(`unexpected provider: ${name}`);
    });

    const result = await resolveShippingQuote({
      items,
      address,
      settings: { ...settings, fallbackProviders: ["internal"] },
      activeProvider: "ups",
      currency: "USD",
    });

    expect(result).toEqual({ shippingFee: 8, provider: "internal" });
  });

  it("falls back to the next provider when the primary throws (real fault, not 'can't serve')", async () => {
    getShippingProvider.mockImplementation((name) => {
      if (name === "ups")
        return fakeProvider(async () => {
          throw new Error("UPS auth failed");
        });
      if (name === "internal")
        return fakeProvider(async () => ({ shippingFee: 8, currency: "USD" }));
      throw new Error(`unexpected provider: ${name}`);
    });

    const result = await resolveShippingQuote({
      items,
      address,
      settings: { ...settings, fallbackProviders: ["internal"] },
      activeProvider: "ups",
      currency: "USD",
    });

    expect(result).toEqual({ shippingFee: 8, provider: "internal" });
  });

  it("throws a NOT_SERVICEABLE error once every provider in the chain fails", async () => {
    getShippingProvider.mockImplementation(() => fakeProvider(async () => null));

    await expect(
      resolveShippingQuote({
        items,
        address,
        settings: { ...settings, fallbackProviders: ["internal"] },
        activeProvider: "ups",
        currency: "USD",
      }),
    ).rejects.toMatchObject({
      type: "NOT_SERVICEABLE",
      statusCode: 400,
    });
  });

  it("skips an unregistered provider name in fallbackProviders instead of blowing up checkout", async () => {
    getShippingProvider.mockImplementation((name) => {
      if (name === "bogus") throw new Error('Unknown shipping provider: "bogus"');
      if (name === "internal")
        return fakeProvider(async () => ({ shippingFee: 3, currency: "USD" }));
      throw new Error(`unexpected provider: ${name}`);
    });

    const result = await resolveShippingQuote({
      items,
      address,
      settings: { ...settings, fallbackProviders: ["bogus", "internal"] },
      activeProvider: "ups",
      currency: "USD",
    });

    expect(result).toEqual({ shippingFee: 3, provider: "internal" });
  });

  it("dedupes activeProvider out of the fallback list so it's never tried twice", async () => {
    const getQuote = jest.fn().mockResolvedValue({ shippingFee: 5, currency: "USD" });
    getShippingProvider.mockImplementation(() => fakeProvider(getQuote));

    await resolveShippingQuote({
      items,
      address,
      settings: { ...settings, fallbackProviders: ["internal"] },
      activeProvider: "internal",
      currency: "USD",
    });

    expect(getQuote).toHaveBeenCalledTimes(1);
  });
});
