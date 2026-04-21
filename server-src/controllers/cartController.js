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
  let cart = await Cart.findOne({ user: req.user._id }).populate({
    path: "itemList.shopItem",
    populate: [
      { path: "category", select: "name" },
      {
        path: "attributes.Attribute",
        select: "name value type display",
      },
    ],
  });

  if (!cart) {
    return res.json({ message: "Cart is empty", itemList: [] });
  }

  // 🔥 Remove items whose ShopItem no longer exists
  const originalLength = cart.itemList.length;
  cart.itemList = cart.itemList.filter((item) => item.shopItem);

  let updated = false;
  const newItemList = [];

  for (const item of cart.itemList) {
    if (!item.selectedAttributes?.length) {
      newItemList.push(item);
      continue;
    }

    // ✅ Map current product attributes (latest state)
    const productAttrMap = new Map(
      item.shopItem.attributes
        .map((attr) => {
          const id = getAttrId(attr);
          return id ? [id, attr] : null;
        })
        .filter(Boolean),
    );

    let hasInvalidAttribute = false;
    const newSelectedAttributes = [];

    for (const oldAttr of item.selectedAttributes) {
      const attrId = getAttrId(oldAttr);

      if (!attrId) {
        hasInvalidAttribute = true;
        break;
      }

      const latestAttr = productAttrMap.get(attrId);

      // ❌ Attribute removed from product
      if (!latestAttr) {
        hasInvalidAttribute = true;
        break;
      }

      // 🔁 Keep STRICT CART SHAPE (VERY IMPORTANT)
      const normalizedAttr = {
        ...latestAttr,
        Attribute: attrId, // 🔥 force ID, not object
      };

      newSelectedAttributes.push(normalizedAttr);

      // 🔍 Detect changes
      if (!updated && hasChanged(oldAttr, normalizedAttr)) {
        updated = true;
      }
    }

    if (hasInvalidAttribute) {
      updated = true;
      continue; // 🚨 remove item
    }

    item.selectedAttributes = newSelectedAttributes;
    newItemList.push(item);
  }

  // replace cart items
  if (newItemList.length !== cart.itemList.length) {
    updated = true;
  }

  cart.itemList = newItemList;

  // Only save if something was removed
  if (cart.itemList.length !== originalLength || updated) {
    await cart.save();
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
