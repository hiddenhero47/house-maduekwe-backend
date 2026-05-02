const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const { Order, ORDER_STATUS } = require("../models/orderModel");
const { ROLE } = require("../models/userModel");
const { Payment } = require("../models/paymentModel");
const { reverseStockFromRollback } = require("../helpers/orderHelper");
const { PAYMENT_STATUS } = require("../models/paymentModel");

const ORDER_STATUS_FLOW = {
  pending: ["processing", "cancelled"],
  processing: ["shipped", "cancelled", "paid"],
  paid: ["shipped", "processing"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

// @desc Get logged-in user's orders
// @route GET /api/orders/me
// @access Private
const getMyOrders = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const { startDate, endDate, status } = req.query;

  const filter = {
    user: req.user._id,
  };

  // Optional status filter (useful for client UI tabs)
  if (status) {
    filter.status = status;
  }

  // 📅 Date filtering
  if (startDate || endDate) {
    filter.createdAt = {};

    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start)) {
        filter.createdAt.$gte = start;
      }
    }

    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end)) {
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    // safety cleanup
    if (Object.keys(filter.createdAt).length === 0) {
      delete filter.createdAt;
    }
  }

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),

    Order.countDocuments(filter),
  ]);

  res.status(200).json({
    data: orders,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// @desc Get all orders (admin)
// @route GET /api/orders
// @access Private (Admin)
const getOrders = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const { status, user, paymentId, startDate, endDate } = req.query;

  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (user && mongoose.Types.ObjectId.isValid(user)) {
    filter.user = user;
  }

  if (paymentId && mongoose.Types.ObjectId.isValid(paymentId)) {
    filter.paymentId = paymentId;
  }

  // 📅 Date filtering
  if (startDate || endDate) {
    filter.createdAt = {};

    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start)) {
        filter.createdAt.$gte = start;
      }
    }

    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end)) {
        // include the whole end day
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    // Remove createdAt if empty (edge safety)
    if (Object.keys(filter.createdAt).length === 0) {
      delete filter.createdAt;
    }
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "name email")
      .lean(),

    Order.countDocuments(filter),
  ]);

  res.status(200).json({
    data: orders,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// @desc Get order by id with payment
// @route GET /api/orders/:id
// @access Private (Admin or Owner)
const getOrderById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error("Invalid order id");
  }

  const order = await Order.findById(id).populate("user", "name email").lean();

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  // Optional security: user can only access their own order
  if (
    req.user.role !== ROLE.ADMIN &&
    req.user.role !== ROLE.SUPER_ADMIN &&
    order.user._id.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error("Not authorized to view this order");
  }

  let payment = null;

  if (order.paymentId) {
    payment = await Payment.findById(order.paymentId).lean();
  }

  res.status(200).json({
    order,
    payment,
  });
});

// @desc Update order status
// @route PATCH /api/orders/:id/status
// @access Private (Admin)
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, shippingDetails } = req.body;
  const { id } = req.params;

  if (!Object.values(ORDER_STATUS).includes(status)) {
    res.status(400);
    throw new Error("Invalid order status");
  }

  const order = await Order.findById(id);

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  const allowedNextStatuses = ORDER_STATUS_FLOW[order.status] || [];

  if (!allowedNextStatuses.includes(status)) {
    res.status(400);
    throw new Error(
      `Cannot change order status from ${order.status} to ${status}`,
    );
  }

  // 🚚 Enforce shipping details when moving to SHIPPED
  if (status === ORDER_STATUS.SHIPPED) {
    const { company, trackingNumber } = shippingDetails || {};

    if (!company?.trim() || !trackingNumber?.trim()) {
      throw new Error("Valid shipping company and tracking number required");
    }

    // ✅ attach shipping details
    order.shippingDetails = {
      company: company.trim(),
      trackingNumber: trackingNumber.trim(),
      shippedAt: new Date(),
    };
  }

  // Optional: allow updating shipping details separately
  if (shippingDetails && status !== ORDER_STATUS.SHIPPED) {
    order.shippingDetails = {
      ...(order.shippingDetails || {}),
      ...shippingDetails,
    };
  }

  order.status = status;

  order.updatedBy = {
    id: req.user._id,
    email: req.user.email,
  };

  await order.save();

  res.status(200).json({
    message: "Order status updated",
    order,
  });
});

// @desc Cancel order
// @route PATCH /api/orders/:id/cancel
// @access Private (Owner, Admin, Super Admin)
const cancelOrder = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const order = await Order.findById(req.params.id).session(session);

    if (!order) {
      res.status(404);
      throw new Error("Order not found");
    }

    // 🔐 AUTHORIZATION
    const isOwner = order.user.toString() === req.user._id.toString();
    const isAdmin =
      req.user.role === ROLE.ADMIN ||
      req.user.role === ROLE.SUPER_ADMIN;

    if (!isOwner && !isAdmin) {
      res.status(403);
      throw new Error("Not authorized to cancel this order");
    }

    if (order.status === ORDER_STATUS.CANCELLED) {
      throw new Error("Order already cancelled");
    }

    // optional: block shipped
    if (order.status !== ORDER_STATUS.PENDING) {
      throw new Error("Cannot cancel shipped order");
    }

    // 🔁 RESTORE STOCK (only if exists)
    if (order.rollbackInfo) {
      await reverseStockFromRollback({
        rollbackInfo: order.rollbackInfo,
        session,
      });

      // 🚨 prevent double rollback
      order.rollbackInfo = null;
    }

    // 💳 update payment (safe even if null)
    if (order.paymentId) {
      await Payment.updateOne(
        { _id: order.paymentId },
        { status: PAYMENT_STATUS.CANCELLED },
        { session },
      );
    }

    // 📦 cancel order
    order.status = ORDER_STATUS.CANCELLED;

    order.updatedBy = {
      id: req.user._id,
      email: req.user.email,
    };

    await order.save({ session });

    await session.commitTransaction();

    res.status(200).json({
      message: "Order cancelled successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

module.exports = {
  getMyOrders,
  getOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
};
