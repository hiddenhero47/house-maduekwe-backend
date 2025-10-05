const mongoose = require("mongoose");

const itemGroupSchema = new mongoose.Schema(
  {
    groupName: {
      type: String,
      required: [true, "Group name is required"],
    },
    shopItems: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ShopItem",
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ItemGroup", itemGroupSchema);
