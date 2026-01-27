const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const { Payment, PAYMENT_STATUS } = require("../models/paymentModel");

// @desc Get logged-in user's payments
// @route GET /api/payments/me
// @access Private
const getMyPayments = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const { status, startDate, endDate } = req.query;

  const filter = {
    user: req.user._id,
  };

  if (status && Object.values(PAYMENT_STATUS).includes(status)) {
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

    if (Object.keys(filter.createdAt).length === 0) {
      delete filter.createdAt;
    }
  }

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Payment.countDocuments(filter),
  ]);

  res.status(200).json({
    data: payments,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// @desc Get all payments (admin)
// @route GET /api/payments
// @access Private (Admin)
const getPayments = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const {
    status,
    user,
    orderId,
    providerId,
    reference,
    startDate,
    endDate,
  } = req.query;

  const filter = {};

  if (status && Object.values(PAYMENT_STATUS).includes(status)) {
    filter.status = status;
  }

  if (user && mongoose.Types.ObjectId.isValid(user)) {
    filter.user = user;
  }

  if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
    filter.orderId = orderId;
  }

  if (providerId && mongoose.Types.ObjectId.isValid(providerId)) {
    filter["provider.id"] = providerId;
  }

  if (reference) {
    filter.reference = reference;
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

    if (Object.keys(filter.createdAt).length === 0) {
      delete filter.createdAt;
    }
  }

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Payment.countDocuments(filter),
  ]);

  res.status(200).json({
    data: payments,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

module.exports = {
  getMyPayments,
  getPayments,
};
