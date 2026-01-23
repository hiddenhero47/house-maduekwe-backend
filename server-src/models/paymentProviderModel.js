const mongoose = require("mongoose");

const paymentProviderSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true, // e.g. paystack, stripe
    },

    percentageFee: {
      type: Number, // e.g. 1.5 (%)
      default: 0,
      min: 0,
    },

    flatFee: {
      type: Number, // e.g. ₦100
      default: 0,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const PaymentProvider = mongoose.model(
  "PaymentProvider",
  paymentProviderSchema
);

module.exports = { PaymentProvider };
