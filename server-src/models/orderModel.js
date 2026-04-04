const mongoose = require("mongoose");

const ORDER_STATUS = {
  PENDING: "pending", // order created, payment not completed
  PAID: "paid", // payment successful
  PROCESSING: "processing", // admin acknowledged
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  RETURNED: "returned",
  RETURNING: "processing-return",
};

const orderItemSchema = new mongoose.Schema(
  {
    shopItem: {
      type: Object,
      required: [true, "Shop item snapshot is required"],
      validate: {
        validator: (v) =>
          v &&
          mongoose.Types.ObjectId.isValid(v._id) &&
          typeof v.price === "number" &&
          typeof v.currency === "string",
        message: "Invalid shop item snapshot",
      },
    },

    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },

    selectedAttributes: {
      type: Array,
      default: [],
    },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
    },

    items: {
      type: [orderItemSchema],
      required: [true, "Order items are required"],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "Order must contain at least one item",
      },
    },

    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING,
      index: true,
    },

    shippedBy: {
      type: String, // e.g. DHL, FedEx, Internal
    },

    address: {
      type: Object,
      required: [true, "Shipping address is required"],
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    totalVat: {
      type: Number,
      required: true,
      min: 0,
    },

    shippingFee: {
      type: Number,
      default: 0,
      min: 0,
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

    shippingDetails: {
      company: {
        type: String,
        trim: true,
      },
      trackingNumber: {
        type: String,
        trim: true,
      },
      shippedAt: {
        type: Date,
      },
      validate: {
        validator: function (v) {
          if (!v) return true; // allow empty

          // if object exists, enforce required fields
          return v.company && v.trackingNumber;
        },
        message: "Shipping details must include company and tracking number",
      },
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
  },
  {
    timestamps: true,
  },
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

const Order = mongoose.model("Order", orderSchema);

module.exports = {
  Order,
  ORDER_STATUS,
};
