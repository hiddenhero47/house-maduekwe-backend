const { toKg } = require("./packageWeightHelper");

// Inches / kg — used only when an item has no linked Package (shouldn't
// happen after the backfillDefaultPackage migration has run, but a real
// shipment must never end up with zero dimensions).
const FALLBACK_PACKAGE_DIMENSIONS_IN = { length: 12, width: 9, height: 6 };

// Combines every distinct Package type referenced by an order's items into
// one estimated shipment box, modeled as physically stacking them: the
// footprint (length/width) is the largest among the distinct packages in
// use, height is their sum. Packaging weight is added once per distinct
// package type (one physical box), not per unit — matching the existing
// per-item weightGrams, which also doesn't scale with quantity (see
// checkoutController.js/shipmentController.js) — kept consistent here
// rather than silently changed as a side effect of this feature.
const combinePackages = (items = []) => {
  const groups = new Map();

  for (const item of items) {
    const pkg = item.package;
    const key = pkg?._id ? String(pkg._id) : "default";

    if (groups.has(key)) continue;

    groups.set(key, {
      length: pkg?.length || FALLBACK_PACKAGE_DIMENSIONS_IN.length,
      width: pkg?.width || FALLBACK_PACKAGE_DIMENSIONS_IN.width,
      height: pkg?.height || FALLBACK_PACKAGE_DIMENSIONS_IN.height,
      weightKg: pkg ? toKg(pkg.weight?.value, pkg.weight?.unit) : 0,
    });
  }

  const packages = [...groups.values()];

  if (packages.length === 0) {
    return { ...FALLBACK_PACKAGE_DIMENSIONS_IN, packagingWeightKg: 0 };
  }

  return {
    length: Math.max(...packages.map((p) => p.length)),
    width: Math.max(...packages.map((p) => p.width)),
    height: packages.reduce((sum, p) => sum + p.height, 0),
    packagingWeightKg: packages.reduce((sum, p) => sum + p.weightKg, 0),
  };
};

module.exports = { combinePackages, FALLBACK_PACKAGE_DIMENSIONS_IN };
