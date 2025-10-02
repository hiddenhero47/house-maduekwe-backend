const mongoose = require("mongoose");

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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Attribute", attributeSchema);
