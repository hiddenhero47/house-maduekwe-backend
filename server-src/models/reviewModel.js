const mongoose = require("mongoose");

const productReviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShopItem",
      required: true,
      index: true,
    },

    user: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      email: {
        type: String,
        required: true,
      },
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    comment: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * ❗ Prevent duplicate reviews by same user on same product
 */
productReviewSchema.index(
  { product: 1, "user.id": 1 },
  { unique: true }
);

module.exports = mongoose.model("ProductReview", productReviewSchema);
