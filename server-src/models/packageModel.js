const mongoose = require("mongoose");

// Admin-defined shipping package types (box dimensions + packaging weight)
// that a ShopItem links to, so carrier quotes/labels use real dimensions
// instead of a hardcoded placeholder (see uspsProvider.js's
// DEFAULT_PACKAGE_DIMENSIONS_IN).
const packageSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Add a name for this package"],
    },
    // Inches — fixed unit, matching what USPS's Prices/Labels APIs expect.
    length: {
      type: Number,
      required: [true, "Add a length for this package"],
      min: [0, "Length cannot be negative"],
    },
    width: {
      type: Number,
      required: [true, "Add a width for this package"],
      min: [0, "Width cannot be negative"],
    },
    height: {
      type: Number,
      required: [true, "Add a height for this package"],
      min: [0, "Height cannot be negative"],
    },
    // Packaging material weight (the box itself, not the product it holds)
    // — same {value, unit} shape as ShopItem.weight so packageWeightHelper's
    // toKg() works on it unchanged.
    weight: {
      value: {
        type: Number,
        min: [0, "Weight value cannot be negative"],
      },
      unit: {
        type: String,
        enum: ["kg", "g", "lb", "oz"],
        default: "kg",
      },
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

const Package = mongoose.model("Package", packageSchema);
module.exports = { Package };
