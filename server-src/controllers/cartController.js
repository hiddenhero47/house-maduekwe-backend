const asyncHandler = require("express-async-handler");
const Cart = require("../models/cartModel");
const { ShopItem } = require("../models/shopItemModel");
const { addToCartSchema } = require("../validations/cartValidation");
const {
  getAttrId,
  hasChanged,
  buildValidatedCartItems,
} = require("../helpers/cartHelper");
const { validateStockStateful } = require("./checkoutController");

// @desc    Get user cart
// @route   GET /api/cart
// @access  Private
const getCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id }).populate([
    {
      path: "itemList.shopItem",
      populate: [
        { path: "category", select: "name" },
        {
          path: "attributes.Attribute",
          select: "name value type display",
        },
      ],
    },
    {
      path: "itemList.selectedAttributes.Attribute",
      select: "name value type display",
    },
  ]);

  if (!cart) {
    return res.json({
      message: "Cart is empty",
      itemList: [],
    });
  }

  let updated = false;

  const cleanedItems = [];

  for (const item of cart.itemList) {
    // ❌ Product removed
    if (!item.shopItem) {
      updated = true;
      continue;
    }

    // ✅ No selected attrs
    if (!item.selectedAttributes?.length) {
      cleanedItems.push(item);
      continue;
    }

    // ✅ Build fast lookup map
    const attrMap = new Map(
      item.shopItem.attributes.map((attr) => [getAttrId(attr), attr]),
    );

    const normalizedSelected = [];

    let invalid = false;

    for (const oldAttr of item.selectedAttributes) {
      const attrId = getAttrId(oldAttr);

      const latestAttr = attrMap.get(attrId);

      // ❌ Attribute removed
      if (!attrId || !latestAttr) {
        invalid = true;
        updated = true;
        break;
      }

      const normalizedAttr = {
        Attribute: attrId,
        type: latestAttr.type,
        isDefault: latestAttr.isDefault,
        quantity: latestAttr.quantity,
        additionalAmount: latestAttr.additionalAmount,
        images: latestAttr.images || [],
      };

      normalizedSelected.push(normalizedAttr);

      if (!updated && hasChanged(oldAttr, normalizedAttr)) {
        updated = true;
      }
    }

    if (invalid) continue;

    cleanedItems.push({
      ...item.toObject(),
      selectedAttributes: normalizedSelected,
    });
  }

  // ✅ Save only if needed
  if (updated || cleanedItems.length !== cart.itemList.length) {
    cart.itemList = cleanedItems;
    await cart.save();

    // re-populate after save because IDs were normalized
    await cart.populate({
      path: "itemList.selectedAttributes.Attribute",
      select: "name value type display",
    });
  }

  res.json(cart);
});

// @desc    Add items to cart
// @route   POST /api/cart
// @access  Private
const addToCart = asyncHandler(async (req, res) => {
  // ✅ Validate request body with yup
  await addToCartSchema.validate(req.body, { abortEarly: false });

  const { itemList } = req.body; // [{ shopItemId, quantity, selectedAttributes }, ...]

  // ✅ Validate shop items exist
  const shopItemIds = itemList.map((i) => i.shopItem);
  const uniqueIds = [...new Set(shopItemIds.map(String))];
  const shopItemsDB = await ShopItem.find({ _id: { $in: uniqueIds } }).populate(
    {
      path: "attributes.Attribute",
      select: "name value type display",
    },
  );

  // 🧠 Create a map for fast lookup
  const shopItemMap = new Map(
    shopItemsDB.map((item) => [item._id.toString(), item]),
  );

  // ✅ 🔥 VALIDATE + TRANSFORM
  if (shopItemsDB.length !== uniqueIds.length) {
    res.status(400);
    throw new Error("One or more shop items do not exist");
  }

  const validatedItems = buildValidatedCartItems(itemList, shopItemMap);

  const stockResults = validateStockStateful(
    validatedItems.map((item) => ({
      shopItem: shopItemMap.get(item.shopItem.toString()),
      quantity: item.quantity,
      selectedAttributes: item.selectedAttributes,
    })),
  );

  // 🚨 BLOCK CART ADD IF ANY ITEM IS INVALID
  const failed = stockResults.find((r) => r.isAvailable === false);

  if (failed) {
    res.status(400);
    throw new Error(failed.message);
  }

  console.log(validatedItems);

  // ✅ Find cart
  let cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    // no cart → create new
    cart = new Cart({
      user: req.user._id,
      itemList: validatedItems,
    });
  } else {
    // cart exists → append new items
    cart.itemList = [...cart.itemList, ...validatedItems];
  }

  await cart.save();

  // ✅ Populate shopItemId before returning
  const populatedCart = await cart.populate("itemList.shopItem");

  res.status(201).json(populatedCart);
});

// @desc    Remove items from cart
// @route   DELETE /api/cart
// @access  Private
const removeFromCart = asyncHandler(async (req, res) => {
  const { itemIds } = req.body; // array of itemList._id to remove

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    res.status(400);
    throw new Error("itemIds array is required");
  }

  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    res.status(404);
    throw new Error("Cart not found");
  }

  cart.itemList = cart.itemList.filter(
    (item) => !itemIds.includes(item._id.toString()),
  );

  await cart.save();

  const populatedCart = await cart.populate("itemList.shopItem");

  res.json(populatedCart);
});

module.exports = {
  getCart,
  addToCart,
  removeFromCart,
};
