const asyncHandler = require("express-async-handler");
const Cart = require("../models/cartModel");
const ShopItem = require("../models/shopItemModel");

// @desc    Get user cart
// @route   GET /api/cart
// @access  Private
const getCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id }).populate(
    "itemList.shopItemId"
  );

  if (!cart) {
    return res.json({ message: "Cart is empty", itemList: [] });
  }

  res.json(cart);
});

// @desc    Add items to cart
// @route   POST /api/cart
// @access  Private
const addToCart = asyncHandler(async (req, res) => {
  const items = req.body.items; // [{ shopItemId, quantity, selectedAttributes }, ...]

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error("Items array is required");
  }

  // validate shop items exist
  const shopItemIds = items.map((i) => i.shopItemId);
  const shopItems = await ShopItem.find({ _id: { $in: shopItemIds } });

  if (shopItems.length !== shopItemIds.length) {
    res.status(400);
    throw new Error("One or more shop items do not exist");
  }

  let cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    // create a new cart
    cart = new Cart({
      user: req.user._id,
      itemList: [],
    });
  }

  // update or insert items
  for (let newItem of items) {
    const existingIndex = cart.itemList.findIndex(
      (item) =>
        item.shopItemId.toString() === newItem.shopItemId &&
        JSON.stringify(item.selectedAttributes) ===
          JSON.stringify(newItem.selectedAttributes)
    );

    if (existingIndex >= 0) {
      // item already exists in cart → update quantity
      cart.itemList[existingIndex].quantity += newItem.quantity;
    } else {
      // add new item
      cart.itemList.push(newItem);
    }
  }

  await cart.save();

  const populatedCart = await cart.populate("itemList.shopItemId");

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
    (item) => !itemIds.includes(item._id.toString())
  );

  await cart.save();

  const populatedCart = await cart.populate("itemList.shopItemId");

  res.json(populatedCart);
});

module.exports = {
  getCart,
  addToCart,
  removeFromCart,
};
