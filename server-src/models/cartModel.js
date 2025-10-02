const mongoose = require("mongoose");

const itemListSchema = new mongoose.Schema(
  {
    shopItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShopItem", // link to master attribute
      required: true,
    },
    name: {
      type: String,
      required: [true, ""],
    },
  },
  {
    timestamps: true,
  },
  { _id: false } // no need for _id on each attribute if you don't want it
);

const cartSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
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
