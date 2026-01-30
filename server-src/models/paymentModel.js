const mongoose = require("mongoose");

const PAYMENT_STATUS = {
  PENDING: "pending",
  INITIATED: "initiated",
  SUCCESS: "success",
  FAILED: "failed",
  REFUNDED: "refunded",
};

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order reference is required"],
      index: true,
    },

    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING,
      index: true,
    },

    amountToPay: {
      type: Number,
      required: [true, "Amount to pay is required"],
      min: 0,
    },

    transactionFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    currency: {
      type: String,
      required: true,
    },

    provider: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PaymentProvider",
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
    },

    reference: {
      type: String, // gateway reference / transaction ID
      index: true,
    },

    details: {
      type: Object, // full gateway payload snapshot
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true,
    },

    userEmail: {
      type: String,
      required: true,
    },

    updatedBy: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      email: {
        type: String,
      },
    },

    isDuplicate: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ orderId: 1 });
paymentSchema.index({ "provider.id": 1 });
paymentSchema.index({ reference: 1 });

const Payment = mongoose.model("Payment", paymentSchema);

module.exports = {
  Payment,
  PAYMENT_STATUS,
};
