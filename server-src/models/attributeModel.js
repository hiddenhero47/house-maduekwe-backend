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
      type: mongoose.Schema.Types.Mixed, // can be string or number
      required: [true, "A value is needed for this attribute"],
      validate: {
        validator: function (v) {
          // valid only if string or number
          return typeof v === "string" || typeof v === "number";
        },
        message: "Value must be a string or a number.",
      },
    },
    type: {
      type: String,
      required: [true, "Attribute type is needed"],
      enum: Object.values(attributeType),
    },
    display: {
      type: mongoose.Schema.Types.Mixed,
      default: "",
      validate: {
        validator: function (v) {
          // valid if it's a string or an array of strings
          return (
            typeof v === "string" ||
            (Array.isArray(v) && v.every((item) => typeof item === "string"))
          );
        },
        message: "Display must be a string or an array of strings",
      },
    },
  },
  {
    timestamps: true,
  }
);

const Attribute = mongoose.model("Attribute", attributeSchema);

module.exports = { Attribute, attributeType };
