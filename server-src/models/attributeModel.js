const mongoose = require("mongoose");

const attributeType = {
  COLOR: "color",
  SIZE: "size",
  AUTO: "auto",
};

const attributeSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "A name is needed for this attribute"],
      trim: true,
    },
    value: {
      type: String,
      required: [true, "A value is needed for this attribute"],
      trim: true,
    },
    type: {
      type: String,
      required: [true, "Attribute type is needed"],
      enum: Object.values(attributeType),
    },
    display: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

const Attribute = mongoose.model("Attribute", attributeSchema);

module.exports = { Attribute, attributeType };
