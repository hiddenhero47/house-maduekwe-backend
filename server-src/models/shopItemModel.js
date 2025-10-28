const mongoose = require("mongoose");
const { attributeType } = require("./attributeModel");

const STATUS = {
  UNAVAILABLE: "unavailable",
  SOLD_OUT: "sold-out",
  AVAILABLE: "available",
};

const attributeSchema = new mongoose.Schema({
  Attribute: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Attribute",
    required: [true, "Attribute Ref is needed for this item"],
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
  quantity: {
    type: Number,
  },
  additionalAmount: {
    type: Number,
  },
  images: {
    type: Array, // optional
  },
});

const shopItemSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Add a name for the item"],
    },
    brand: {
      type: String,
    },
    status: {
      type: String,
      default: STATUS.AVAILABLE,
      enum: Object.values(STATUS),
      required: [true, "Set a status for this item"],
    },
    description: {
      type: String,
    },
    price: {
      type: Number,
      required: [true, "Add a price for the item"],
    },
    vat: {
      type: Number,
      required: [true, "Add a vat percentage for the item"],
    },
    currency: {
      type: String,
      required: [true, "Add currency for the item"],
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is needed for this item"],
    },
    subCategory: {
      type: String,
    },
    quantity: {
      type: Number,
      required: [true, "quantity for this item is missing"],
    },
    placeHolder: {
      type: Object,
    },
    imageCatalog: {
      type: Array,
      required: [true, "A catalog for the item is needed"],
    },
    attributes: {
      type: [attributeSchema], // array of objects
      default: [],
    },
    discount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

shopItemSchema.index(
  { _id: 1, "attributes.Attribute": 1 },
  { unique: true, sparse: true }
);

shopItemSchema.pre("validate", function (next) {
  const defaultCount = this.attributes.filter((attr) => attr.isDefault).length;

  if (defaultCount > 1) {
    return next(
      new Error("Only one attribute can be marked as default for this item.")
    );
  }

  next();
});

const ShopItem = mongoose.model("ShopItem", shopItemSchema);
module.exports = { ShopItem, STATUS };
