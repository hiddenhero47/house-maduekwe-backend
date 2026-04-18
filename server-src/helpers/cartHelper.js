const { attributeType } = require("../models/attributeModel");

const hasChanged = (oldAttr, newAttr) => {
  if (oldAttr.Attribute?.toString() !== newAttr.Attribute?.toString())
    return true;
  if (oldAttr.isDefault !== newAttr.isDefault) return true;
  if (oldAttr.quantity !== newAttr.quantity) return true;
  if (oldAttr.additionalAmount !== newAttr.additionalAmount) return true;

  const oldImages = oldAttr.images || [];
  const newImages = newAttr.images || [];

  // ⚡ fast length check
  if (oldImages.length !== newImages.length) return true;

  // ⚡ compare by id only (VERY fast)
  for (let i = 0; i < oldImages.length; i++) {
    if (oldImages[i]?.id !== newImages[i]?.id) return true;
  }

  return false;
};

const buildValidatedCartItems = (itemList, shopItemMap) => {
  const validatedItems = [];

  for (const incomingItem of itemList) {
    const shopItem = shopItemMap.get(incomingItem.shopItem.toString());

    if (!shopItem) {
      throw new Error("Shop item not found");
    }

    const attributes = shopItem.attributes || [];

    // 🧠 group attributes by type
    const grouped = attributes.reduce((acc, attr) => {
      const type = attr.Attribute?.type;
      if (!type) return acc;

      if (!acc[type]) acc[type] = [];
      acc[type].push(attr);

      return acc;
    }, {});

    const selectedMap = new Map(
      (incomingItem.selectedAttributes || []).map((a) => [a._id.toString(), a]),
    );

    const finalSelectedAttributes = [];

    // -------------------------
    // ✅ SIZE (REQUIRED)
    // -------------------------
    if (grouped[attributeType.SIZE]?.length) {
      const selectedSize = grouped[attributeType.SIZE].find((attr) =>
        selectedMap.has(attr._id.toString()),
      );

      if (!selectedSize) {
        throw new Error(`Size selection is required for ${shopItem.name}`);
      }

      finalSelectedAttributes.push(selectedSize);
    }

    // -------------------------
    // ✅ COLOR (ENFORCED)
    // -------------------------
    if (grouped[attributeType.COLOR]?.length) {
      let selectedColor = grouped[attributeType.COLOR].find((attr) =>
        selectedMap.has(attr._id.toString()),
      );

      if (!selectedColor) {
        if (grouped[attributeType.COLOR].length === 1) {
          selectedColor = grouped[attributeType.COLOR][0];
        } else {
          throw new Error(`Color selection is required for ${shopItem.name}`);
        }
      }

      finalSelectedAttributes.push(selectedColor);
    }

    // -------------------------
    // ✅ AUTO TYPES (NEW 🔥)
    // -------------------------
    if (grouped[attributeType.AUTO]?.length) {
      for (const attr of grouped[attributeType.AUTO]) {
        // auto-select first or default
        finalSelectedAttributes.push(attr);
      }
    }

    // -------------------------
    // ✅ OTHER TYPES (FALLBACK)
    // -------------------------
    for (const type in grouped) {
      if (
        type === attributeType.SIZE ||
        type === attributeType.COLOR ||
        type === attributeType.AUTO
      )
        continue;

      const selected = grouped[type].find((attr) =>
        selectedMap.has(attr._id.toString()),
      );

      if (selected) {
        finalSelectedAttributes.push(selected);
      }
    }

    // -------------------------
    // ✅ FINAL PUSH
    // -------------------------
    validatedItems.push({
      shopItem: shopItem._id,
      quantity: incomingItem.quantity,
      selectedAttributes: finalSelectedAttributes,
    });
  }

  return validatedItems;
};

module.exports = { hasChanged, buildValidatedCartItems };
