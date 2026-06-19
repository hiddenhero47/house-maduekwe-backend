const { ensureAdminExists } = require("../helpers/ensureAdmin");
const {
  ensureStripePaymentProvider,
  ensureUSExportFee,
} = require("../helpers/appSetup");
const Cart = require("../models/cartModel");
const asyncHandler = require("express-async-handler");
const { User } = require("../models/userModel");
const crypto = require("crypto");
const { Payment, PAYMENT_STATUS } = require("../models/paymentModel");
const { Order, ORDER_STATUS } = require("../models/orderModel");

// @desc    Start up app
// @route   POST /api/setup/get-started
// @access  Private (protect this route!)
const runSetupScripts = async (req, res) => {
  const logs = [];

  // Add setup tasks here
  logs.push(await ensureAdminExists());
  logs.push(await ensureStripePaymentProvider());
  logs.push(await ensureUSExportFee());
  // later: logs.push(await anotherSetupTask());

  res.json({
    success: true,
    timestamp: new Date(),
    results: logs,
  });
};

// @desc    Clear carts
// @route   DELETE /api/setup/clear-cart
// @access  Private/Admin
const clearCart = asyncHandler(async (req, res) => {
  const { userIds } = req.body;

  // If userIds are passed → clear only those users
  if (Array.isArray(userIds) && userIds.length > 0) {
    await Cart.updateMany(
      { user: { $in: userIds } },
      { $set: { itemList: [] } },
    );

    return res.json({
      message: "Selected users carts cleared",
    });
  }

  // If no userIds passed → clear all carts
  await Cart.updateMany({}, { $set: { itemList: [] } });

  res.json({
    message: "All carts cleared",
  });
});

// @desc    Migrate users to add sessionId
// @route   POST /api/setup/migrate-session-id
// @access  Private (Admin)
const migrateSessionId = async (req, res) => {
  const logs = [];

  const usersWithoutSession = await User.find({
    $or: [
      { sessionId: { $exists: false } },
      { sessionId: null },
      { sessionId: "" },
    ],
  });

  if (!usersWithoutSession.length) {
    return res.json({
      success: true,
      message: "All users already have sessionId",
      updated: 0,
      results: logs,
    });
  }

  const bulkOps = usersWithoutSession.map((user) => {
    logs.push(`Updating user: ${user._id}`);

    return {
      updateOne: {
        filter: { _id: user._id },
        update: {
          $set: {
            sessionId: crypto.randomUUID(),
          },
        },
      },
    };
  });

  await User.bulkWrite(bulkOps);

  logs.push(`Migration completed for ${usersWithoutSession.length} users`);

  res.json({
    success: true,
    message: "SessionId migration completed",
    updated: usersWithoutSession.length,
    results: logs,
    timestamp: new Date(),
  });
};

// @desc    Clear orders and payments
// @route   DELETE /api/setup/clear-orders-payments
// @access  Private/Admin
const clearOrdersAndPayments = asyncHandler(async (req, res) => {
  const { orderIds, paymentIds } = req.body;

  // Clear specific records
  if (
    (Array.isArray(orderIds) && orderIds.length > 0) ||
    (Array.isArray(paymentIds) && paymentIds.length > 0)
  ) {
    if (Array.isArray(orderIds) && orderIds.length > 0) {
      await Order.deleteMany({
        _id: { $in: orderIds },
      });
    }

    if (Array.isArray(paymentIds) && paymentIds.length > 0) {
      await Payment.deleteMany({
        _id: { $in: paymentIds },
      });
    }

    return res.json({
      message: "Selected orders and payments cleared",
    });
  }

  // No ids passed -> clear everything
  await Promise.all([
    Order.deleteMany({}),
    Payment.deleteMany({}),
  ]);

  res.json({
    message: "All orders and payments cleared",
  });
});

module.exports = { runSetupScripts, clearCart, migrateSessionId, clearOrdersAndPayments };
