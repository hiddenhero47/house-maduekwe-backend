const mongoose = require("mongoose");

const itemListSchema = new mongoose.Schema(
  {
    shopItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShopItem",
      required: true,
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
  {
    timestamps: true,
  }
);

const cartSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
      unique: true,
    },
    itemList: {
      type: [itemListSchema], // array of objects
      default: [],
      required: [true, "An item or item list is required"],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Cart", cartSchema);
