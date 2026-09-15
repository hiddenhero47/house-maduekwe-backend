const UNIT_TO_KG = {
  kg: 1,
  g: 0.001,
  lb: 0.45359237,
  oz: 0.028349523125,
};

const toKg = (value, unit) => {
  const factor = UNIT_TO_KG[unit];
  if (!factor || !value) return 0;
  return Number(value) * factor;
};

// Sums each item's weight × quantity, normalized to kg. Items with no
// weight set contribute 0.
const getOrderPackageWeightKg = (items = []) => {
  return items.reduce((totalKg, item) => {
    const weight = item.shopItem?.weight;
    if (!weight?.value) return totalKg;
    return totalKg + toKg(weight.value, weight.unit) * item.quantity;
  }, 0);
};

const kgToGrams = (kg) => Math.round((Number(kg) || 0) * 1000);

module.exports = { toKg, getOrderPackageWeightKg, kgToGrams };
