const { checkoutItemsTotals } = require("../../server-src/controllers/checkoutController");

describe("checkoutItemsTotals", () => {
  it("computes totalAmount as price × quantity with no productTax/attributes", () => {
    const items = [
      {
        shopItem: { _id: "item1", name: "Shirt", price: 20, currency: "USD" },
        quantity: 3,
      },
    ];

    const { totalAmount, totalProductTax } = checkoutItemsTotals(items);

    expect(totalAmount).toBe(60);
    expect(totalProductTax).toBe(0);
  });

  it("applies productTax as a percentage of the item's own total", () => {
    const items = [
      {
        shopItem: { _id: "item1", name: "Shirt", price: 100, currency: "USD", productTax: 10 },
        quantity: 1,
      },
    ];

    const { totalAmount, totalProductTax } = checkoutItemsTotals(items);

    expect(totalAmount).toBe(100);
    expect(totalProductTax).toBe(10);
  });

  it("treats a missing productTax as 0, not NaN", () => {
    const items = [
      { shopItem: { _id: "item1", name: "Shirt", price: 50, currency: "USD" }, quantity: 1 },
    ];

    const { totalProductTax } = checkoutItemsTotals(items);

    expect(totalProductTax).toBe(0);
  });

  it("adds selected attribute additionalAmount onto the unit price", () => {
    const items = [
      {
        shopItem: {
          _id: "item1",
          name: "Shirt",
          price: 20,
          currency: "USD",
          attributes: [{ _id: "attr1", additionalAmount: 5 }],
        },
        quantity: 2,
        selectedAttributes: ["attr1"],
      },
    ];

    const { totalAmount, breakdown } = checkoutItemsTotals(items);

    // unitPrice = 20 + 5 = 25, itemTotal = 25 * 2 = 50
    expect(breakdown[0].unitPrice).toBe(25);
    expect(totalAmount).toBe(50);
  });

  it("sums totals correctly across multiple items", () => {
    const items = [
      { shopItem: { _id: "a", name: "A", price: 10, currency: "USD", productTax: 5 }, quantity: 2 },
      { shopItem: { _id: "b", name: "B", price: 30, currency: "USD" }, quantity: 1 },
    ];

    const { totalAmount, totalProductTax } = checkoutItemsTotals(items);

    // A: itemTotal 20, tax 5% of 20 = 1
    // B: itemTotal 30, tax 0
    expect(totalAmount).toBe(50);
    expect(totalProductTax).toBe(1);
  });

  it("rounds to 2 decimal places to avoid floating-point drift", () => {
    const items = [
      { shopItem: { _id: "a", name: "A", price: 19.99, currency: "USD" }, quantity: 3 },
    ];

    const { totalAmount } = checkoutItemsTotals(items);

    expect(totalAmount).toBe(59.97);
  });

  it("throws if an item has no shopItem", () => {
    const items = [{ shopItem: null, quantity: 1 }];

    expect(() => checkoutItemsTotals(items)).toThrow("Invalid shop item in cart");
  });
});
