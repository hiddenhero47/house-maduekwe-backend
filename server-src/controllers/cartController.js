const asyncHandler = require("express-async-handler");
const Cart = require("../models/cartModel");
const ShopItem = require("../models/shopItemModel");
const { addToCartSchema } = require("../validations/cartValidation");

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
  // ✅ Validate request body with yup
  await addToCartSchema.validate(req.body, { abortEarly: false });

  const { itemList } = req.body; // [{ shopItemId, quantity, selectedAttributes }, ...]

  // ✅ Validate shop items exist
  const shopItemIds = itemList.map((i) => i.shopItemId);
  const shopItems = await ShopItem.find({ _id: { $in: shopItemIds } });

  if (shopItems.length !== shopItemIds.length) {
    res.status(400);
    throw new Error("One or more shop items do not exist");
  }

  // ✅ Find cart
  let cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    // no cart → create new
    cart = new Cart({
      user: req.user._id,
      itemList,
    });
  } else {
    // cart exists → append new items
    cart.itemList = [...cart.itemList, ...itemList];
  }

  await cart.save();

  // ✅ Populate shopItemId before returning
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
