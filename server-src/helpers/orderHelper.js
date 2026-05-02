const { ShopItem } = require("../models/shopItemModel");
const { ORDER_STATUS, Order } = require("../models/orderModel");

const reverseStockFromRollback = async ({ rollbackInfo, session }) => {
  if (!rollbackInfo || rollbackInfo.length === 0) return;

  for (const entry of rollbackInfo) {
    const { quantity, shopItem, attributes, groupedVariant } = entry;

    // -----------------------------
    // 1️⃣ RESTORE MAIN STOCK
    // -----------------------------
    await ShopItem.updateOne(
      { _id: shopItem },
      { $inc: { quantity } },
      { session },
    );

    // -----------------------------
    // 2️⃣ RESTORE ATTRIBUTES
    // -----------------------------
    if (Array.isArray(attributes) && attributes.length > 0) {
      await ShopItem.updateOne(
        { _id: shopItem },
        {
          $inc: {
            "attributes.$[attr].quantity": quantity,
          },
        },
        {
          arrayFilters: [
            {
              "attr.Attribute": { $in: attributes },
            },
          ],
          session,
        },
      );
    }

    // -----------------------------
    // 3️⃣ RESTORE GROUPED VARIANT
    // -----------------------------
    if (groupedVariant?.primaryId && groupedVariant?.optionId) {
      await ShopItem.updateOne(
        { _id: shopItem },
        {
          $inc: {
            "groupedVariants.$[group].options.$[opt].quantity": quantity,
          },
        },
        {
          arrayFilters: [
            {
              "group.primaryAttribute": groupedVariant.primaryId,
            },
            {
              "opt.attribute": groupedVariant.optionId,
            },
          ],
          session,
        },
      );
    }
  }
};

module.exports = {
  reverseStockFromRollback,
};
