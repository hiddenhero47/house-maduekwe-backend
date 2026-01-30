const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const { Payment, PAYMENT_STATUS } = require("../models/paymentModel");
const { Order, ORDER_STATUS } = require("../models/orderModel");
const stripe = require("../config/stripe");

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
    Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),

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

  const { status, user, orderId, providerId, reference, startDate, endDate } =
    req.query;

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
    Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),

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

// @desc Strip webhook callback
// @route POST /api/payments/stripe-callback
// @access Private
const processStripeEvent = async (event) => {
  if (event.type !== "payment_intent.succeeded") return;

  const intentId = event.data.object.id;

  // 🔁 ALWAYS re-query Stripe
  const intent = await stripe.paymentIntents.retrieve(intentId);

  const paymentId = intent.metadata.paymentId;
  if (!paymentId) return;

  const payment = await Payment.findById(paymentId);
  if (!payment) return;

  // 🔐 Idempotency
  if (payment.status === PAYMENT_STATUS.SUCCESS && payment.provider) {
    if (
      payment.provider.name === intent.metadata.providerName &&
      payment.reference === intent.id
    ) {
      return;
    }
    if (intent.status === "succeeded") {
      await Payment.create({
        orderId: payment.orderId,
        user: payment.user,
        userEmail: payment.userEmail,
        amountToPay: payment.amountToPay,
        currency: payment.currency,
        status: PAYMENT_STATUS.SUCCESS,
        provider: {
          name: intent.metadata.providerName,
          id: intent.metadata.providerId,
        },
        reference: intent.id,
        transactionFee: (intent.amount_received - intent.amount) / 100,
      });
    }
    return;
  }

  payment.status = PAYMENT_STATUS.SUCCESS;
  payment.provider = {
    name: intent.metadata.providerName,
    id: intent.metadata.providerId,
  };
  payment.reference = intent.id;
  payment.transactionFee = (intent.amount_received - intent.amount) / 100;

  await payment.save();

  await Order.updateOne(
    { _id: payment.orderId },
    { status: ORDER_STATUS.PAID },
  );
};

// @desc Create Stripe payment intent
// @route POST /api/payments/stripe-intent
// @access Private
const createStripeIntent = asyncHandler(async (req, res) => {
  const { paymentId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(paymentId)) {
    res.status(400);
    throw new Error("Invalid payment id");
  }

  const payment = await Payment.findById(paymentId).lean();
  if (!payment) {
    res.status(404);
    throw new Error("Payment not found");
  }

  // Optional: prevent intent creation for already-successful payments
  if (payment.status === PAYMENT_STATUS.SUCCESS) {
    res.status(400);
    throw new Error("Payment already completed");
  }

  const intent = await stripe.paymentIntents.create(
    {
      amount: Math.round(payment.amountToPay * 100),
      currency: payment.currency.toLowerCase(),
      receipt_email: payment.userEmail,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        paymentId: payment._id.toString(),
        orderId: payment.orderId.toString(),
        userId: payment.user.toString(),
        providerName: "stripe",
      },
    },
    {
      idempotencyKey: `stripe_payment_${payment._id.toString()}`,
    },
  );

  res.status(200).json({
    clientSecret: intent.client_secret,
    intentId: intent.id,
  });
});

module.exports = {
  getMyPayments,
  getPayments,
  processStripeEvent,
  createStripeIntent,
};
