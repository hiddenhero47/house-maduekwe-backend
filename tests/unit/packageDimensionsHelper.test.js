const {
  combinePackages,
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

    it("throws if an item has no linked package", () => {
      expect(() => combinePackages([{ name: "Mystery Item", package: null }])).toThrow(
        /Mystery Item/,
      );
    });

    it("returns zeros for an empty item list, not -Infinity from Math.max on []", () => {
      expect(combinePackages([])).toEqual({
        length: 0,
        width: 0,
        height: 0,
        packagingWeightKg: 0,
      });
      expect(combinePackages()).toEqual({
        length: 0,
        width: 0,
        height: 0,
        packagingWeightKg: 0,
      });
    });
  });
});
