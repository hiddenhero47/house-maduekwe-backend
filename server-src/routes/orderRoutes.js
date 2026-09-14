const express = require("express");
const {
  getMyOrders,
  getOrders,
  getOrderById,
  getOrderByIdAll,
  // updateOrderStatus, // 🛑 disabled — see controllers/orderController.js
  cancelOrder,
  cancelExpiredOrdersAdmin,
  cancelExpiredGuestOrders,
} = require("../controllers/orderController");
const {
  confirmCheckout,
  checkout,
  guestConfirmCheckout,
  guestCheckout,
} = require("../controllers/checkoutController");
const { protect, secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");

const router = express.Router();

router.post("/confirm-checkout", protect, confirmCheckout);
router.post("/checkout", protect, checkout);
router.post("/guest-confirm-checkout", guestConfirmCheckout);
router.post("/guest-checkout", guestCheckout);
router.get("/me", protect, getMyOrders);
router.get("/", secureRole([ROLE.ADMIN, ROLE.SUPER_ADMIN]), getOrders);
router.get("/:id", protect, getOrderById);
router.get("/:id/public", getOrderByIdAll);
// router.patch(
//   "/:id/status",
//   secureRole([ROLE.ADMIN, ROLE.SUPER_ADMIN]),
//   updateOrderStatus,
// ); // 🛑 disabled — see controllers/orderController.js
router.patch("/:id/cancel", protect, cancelOrder);
router.patch(
  "/cancel-expired",
  secureRole([ROLE.ADMIN, ROLE.SUPER_ADMIN]),
  cancelExpiredOrdersAdmin,
);
router.patch("/guest/cancel-expired", cancelExpiredGuestOrders);

module.exports = router;
