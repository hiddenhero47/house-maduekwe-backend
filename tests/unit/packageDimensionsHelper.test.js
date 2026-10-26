const {
  combinePackages,
  FALLBACK_PACKAGE_DIMENSIONS_IN,
} = require("../../server-src/helpers/packageDimensionsHelper");

describe("packageDimensionsHelper", () => {
  describe("combinePackages", () => {
    it("uses a single package's own dimensions and weight", () => {
      const items = [
        {
          package: {
            _id: "pkg1",
            length: 10,
            width: 8,
            height: 4,
            weight: { value: 0.2, unit: "kg" },
          },
        },
      ];

      const result = combinePackages(items);

      expect(result).toEqual({
        length: 10,
        width: 8,
        height: 4,
        packagingWeightKg: 0.2,
      });
    });

    it("combines distinct package types by max length/width and summed height", () => {
      const items = [
        {
          package: {
            _id: "pkg1",
            length: 10,
            width: 8,
            height: 4,
            weight: { value: 0.2, unit: "kg" },
          },
        },
        {
          package: {
            _id: "pkg2",
            length: 12,
            width: 6,
            height: 5,
            weight: { value: 0.3, unit: "kg" },
          },
        },
      ];

      const result = combinePackages(items);

      expect(result.length).toBe(12); // max
      expect(result.width).toBe(8); // max
      expect(result.height).toBe(9); // sum
      expect(result.packagingWeightKg).toBeCloseTo(0.5); // sum
    });

    it("counts each distinct package type once, regardless of how many items use it", () => {
      const pkg = {
        _id: "pkg1",
        length: 10,
        width: 8,
        height: 4,
        weight: { value: 0.2, unit: "kg" },
      };

      const result = combinePackages([{ package: pkg }, { package: pkg }]);

      expect(result).toEqual({
        length: 10,
        width: 8,
        height: 4,
        packagingWeightKg: 0.2,
      });
    });

    it("falls back to the default box for items with no linked package", () => {
      const result = combinePackages([{ package: null }]);

      expect(result).toEqual({
        ...FALLBACK_PACKAGE_DIMENSIONS_IN,
        packagingWeightKg: 0,
      });
    });

    it("combines a real package with the fallback for an item missing one", () => {
      const items = [
        {
          package: {
            _id: "pkg1",
            length: 20,
            width: 2,
            height: 2,
            weight: { value: 0.1, unit: "kg" },
          },
        },
        { package: null },
      ];

      const result = combinePackages(items);

      expect(result.length).toBe(20); // max(20, fallback 12)
      expect(result.width).toBe(FALLBACK_PACKAGE_DIMENSIONS_IN.width); // max(2, 9)
      expect(result.height).toBe(2 + FALLBACK_PACKAGE_DIMENSIONS_IN.height); // sum
      expect(result.packagingWeightKg).toBeCloseTo(0.1); // fallback contributes 0
    });

    it("returns the fallback box for an empty item list", () => {
      expect(combinePackages([])).toEqual({
        ...FALLBACK_PACKAGE_DIMENSIONS_IN,
        packagingWeightKg: 0,
      });
      expect(combinePackages()).toEqual({
        ...FALLBACK_PACKAGE_DIMENSIONS_IN,
        packagingWeightKg: 0,
      });
    });
  });
});
