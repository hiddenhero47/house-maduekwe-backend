const { toKg } = require("./packageWeightHelper");

// Combines every distinct Package type referenced by an order's items into
// one estimated shipment box, modeled as physically stacking them: the
// footprint (length/width) is the largest among the distinct packages in
// use, height is their sum. Packaging weight is added once per distinct
// package type (one physical box), not per unit — matching the existing
// per-item weightGrams, which also doesn't scale with quantity (see
// checkoutController.js/shipmentController.js) — kept consistent here
// rather than silently changed as a side effect of this feature.
//
// `package` is a required field on ShopItem, so every item is expected to
// have one — this throws rather than guessing if that's ever not true.
const combinePackages = (items = []) => {
  const groups = new Map();

  for (const item of items) {
    const pkg = item.package;

    if (!pkg) {
      throw new Error(
        `combinePackages: item "${item.name || "unknown"}" has no linked package`,
      );
    }

    const key = String(pkg._id);
    if (groups.has(key)) continue;

    groups.set(key, {
      length: pkg.length,
      width: pkg.width,
      height: pkg.height,
      weightKg: toKg(pkg.weight?.value, pkg.weight?.unit),
    });
  }

  const packages = [...groups.values()];

  if (packages.length === 0) {
    return { length: 0, width: 0, height: 0, packagingWeightKg: 0 };
  }

  return {
    length: Math.max(...packages.map((p) => p.length)),
    width: Math.max(...packages.map((p) => p.width)),
    height: packages.reduce((sum, p) => sum + p.height, 0),
    packagingWeightKg: packages.reduce((sum, p) => sum + p.weightKg, 0),
  };
};

module.exports = { combinePackages };
