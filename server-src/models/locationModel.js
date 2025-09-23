const mongoose = require("mongoose");

const locationSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please add a name"],
    },
    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
    },
    city: {
      type: String,
      required: [true, "Please add your city"],
    },
    state: {
      type: String,
      required: [true, "Please add your state"],
    },
    country: {
      type: String,
      required: [true, "Please add your country"],
    },
    positionInfo: {
      type: Object,
      required: [true, "Please add your location"],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Location", locationSchema);
