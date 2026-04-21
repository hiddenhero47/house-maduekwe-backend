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
      const error = new Error("Shop item not found");
      error.statusCode = 400;
      throw error;
    }

    const attributes = shopItem.attributes || [];

    // -------------------------
    // GROUP BY TYPE
    // -------------------------
    const grouped = attributes.reduce((acc, attr) => {
      const type = attr.type;
      if (!type) return acc;

      if (!acc[type]) acc[type] = [];
      acc[type].push(attr);

      return acc;
    }, {});

    // -------------------------
    // STRICT selected attributes map (IDs ONLY)
    // -------------------------
    const selectedMap = new Map(
      (incomingItem.selectedAttributes || []).map((attr) => {
        if (!attr?.Attribute?._id) {
          const error = new Error("Invalid selectedAttributes format");
          error.statusCode = 400;
          throw error;
        }

        return [attr.Attribute._id.toString(), true];
      }),
    );

    const finalSelectedAttributes = [];

    const getAttrId = (attr) => {
      if (!attr?.Attribute) {
        const error = new Error("Invalid attribute structure");
        error.statusCode = 400;
        throw error;
      }

      // populated case
      if (typeof attr.Attribute === "object") {
        if (!attr.Attribute._id) {
          const error = new Error("Populated attribute missing _id");
          error.statusCode = 400;
          throw error;
        }

        return attr.Attribute._id.toString();
      }

      // ObjectId case
      return attr.Attribute.toString();
    };

    // -------------------------
    // SIZE (REQUIRED)
    // -------------------------
    if (grouped[attributeType.SIZE]?.length) {
      console.log(grouped[attributeType.SIZE].map(getAttrId), "ALL SIZE IDS");

      console.log([...selectedMap.keys()], "SELECTED IDS");

      const selectedSize = grouped[attributeType.SIZE].find((attr) =>
        selectedMap.has(attr.Attribute._id.toString()),
      );

      if (!selectedSize) {
        const error = new Error(
          `Size selection is required for ${shopItem.name}`,
        );
        error.statusCode = 400;
        throw error;
      }

      finalSelectedAttributes.push({
        Attribute: selectedSize.Attribute.toString(),
        type: selectedSize.type,
      });
    }

    // -------------------------
    // COLOR (REQUIRED OR SINGLE AUTO)
    // -------------------------
    if (grouped[attributeType.COLOR]?.length) {
      let selectedColor = grouped[attributeType.COLOR].find((attr) =>
        selectedMap.has(attr.Attribute._id.toString()),
      );

      if (!selectedColor) {
        if (grouped[attributeType.COLOR].length === 1) {
          selectedColor = grouped[attributeType.COLOR][0];
        } else {
          const error = new Error(
            `Color selection is required for ${shopItem.name}`,
          );
          error.statusCode = 400;
          throw error;
        }
      }

      finalSelectedAttributes.push({
        Attribute: selectedColor.Attribute.toString(),
        type: selectedColor.type,
      });
    }

    // -------------------------
    // AUTO (STRICT: FIRST ONLY)
    // -------------------------
    if (grouped[attributeType.AUTO]?.length) {
      finalSelectedAttributes.push({
        Attribute: grouped[attributeType.AUTO][0].Attribute.toString(),
        type: grouped.AUTO[0].type,
      });
    }

    // -------------------------
    // OTHER TYPES
    // -------------------------
    for (const type in grouped) {
      if (type === "SIZE" || type === "COLOR" || type === "AUTO") continue;

      const selected = grouped[type].find((attr) =>
        selectedMap.has(attr.Attribute.toString()),
      );

      if (selected) {
        finalSelectedAttributes.push({
          Attribute: selected.Attribute.toString(),
          type: selected.type,
        });
      }
    }

    // -------------------------
    // FINAL PUSH (STRICT SHAPE)
    // -------------------------
    validatedItems.push({
      shopItem: shopItem._id.toString(),
      quantity: incomingItem.quantity,
      selectedAttributes: finalSelectedAttributes,
    });
  }

  return validatedItems;
};

module.exports = { hasChanged, buildValidatedCartItems };
