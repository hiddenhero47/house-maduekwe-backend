const {
  toKg,
  getOrderPackageWeightKg,
  kgToGrams,
} = require("../../server-src/helpers/packageWeightHelper");

describe("packageWeightHelper", () => {
  describe("toKg", () => {
    it("converts kg to kg (identity)", () => {
      expect(toKg(2, "kg")).toBe(2);
    });

    it("converts grams to kg", () => {
      expect(toKg(500, "g")).toBeCloseTo(0.5);
    });

    it("converts pounds to kg", () => {
      expect(toKg(1, "lb")).toBeCloseTo(0.45359237);
    });

    it("converts ounces to kg", () => {
      expect(toKg(16, "oz")).toBeCloseTo(0.45359237, 4); // 16oz ≈ 1lb
    });

    it("returns 0 for an unknown unit", () => {
      expect(toKg(5, "stone")).toBe(0);
    });

    it("returns 0 for a missing/zero value", () => {
      expect(toKg(0, "kg")).toBe(0);
      expect(toKg(undefined, "kg")).toBe(0);
    });
  });

  describe("kgToGrams", () => {
    it("converts kg to whole grams", () => {
      expect(kgToGrams(0.2)).toBe(200);
    });

    it("rounds to the nearest gram", () => {
      expect(kgToGrams(0.2003)).toBe(200);
    });

    it("returns 0 for non-numeric input", () => {
      expect(kgToGrams(undefined)).toBe(0);
      expect(kgToGrams(NaN)).toBe(0);
    });
  });

  describe("getOrderPackageWeightKg", () => {
    it("sums weight × quantity across items, normalized to kg", () => {
      const items = [
        { shopItem: { weight: { value: 200, unit: "g" } }, quantity: 3 }, // 0.6kg
        { shopItem: { weight: { value: 1, unit: "kg" } }, quantity: 2 }, // 2kg
      ];

      expect(getOrderPackageWeightKg(items)).toBeCloseTo(2.6);
    });

    it("treats items with no weight set as contributing 0", () => {
      const items = [
        { shopItem: { weight: { value: 1, unit: "kg" } }, quantity: 1 },
        { shopItem: {}, quantity: 5 },
      ];

      expect(getOrderPackageWeightKg(items)).toBe(1);
    });

    it("returns 0 for an empty item list", () => {
      expect(getOrderPackageWeightKg([])).toBe(0);
      expect(getOrderPackageWeightKg()).toBe(0);
    });
  });
});
