const express = require("express");
const {
  getMyOrders,
  getOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
} = require("../controllers/orderController");
const {
  confirmCheckout,
  checkout,
} = require("../controllers/checkoutController");
const { protect, secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");

const router = express.Router();

router.post("/confirm-checkout", protect, confirmCheckout);
router.post("/checkout", protect, checkout);
router.get("/me", protect, getMyOrders);
router.get("/", secureRole([ROLE.ADMIN, ROLE.SUPER_ADMIN]), getOrders);
router.get("/:id", protect, getOrderById);
router.patch(
  "/:id/status",
  secureRole([ROLE.ADMIN, ROLE.SUPER_ADMIN]),
  updateOrderStatus,
);
router.patch("/:id/cancel", protect, cancelOrder);

module.exports = router;
