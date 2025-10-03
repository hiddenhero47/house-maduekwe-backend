const express = require("express");
const router = express.Router();
const {
  getCart,
  addToCart,
  removeFromCart,
} = require("../controllers/cartController");
const { protect } = require("../middleware/authMiddleware");

// Get all cart items & Add to cart
router.route("/").get(protect, getCart).post(protect, addToCart);

// Remove items from cart (expects array of IDs from frontend)
router.route("/").delete(protect, removeFromCart);

module.exports = router;
