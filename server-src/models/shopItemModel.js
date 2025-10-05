const mongoose = require("mongoose");
// const Attribute = require("./attributeModel");

const STATUS = {
  UNAVAILABLE: "unavailable",
  SOLD_OUT: "sold-out",
  AVAILABLE: "available",
};

const attributeSchema = new mongoose.Schema(
  {
    attributeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attribute", // link to master attribute
      required: true,
    },
    name: {
      type: String,
      required: [true, "A name is needed for this attribute"],
    },
    value: {
      type: String,
      required: [true, "A type is needed for this attribute"],
    },
    quantity: {
      type: Number,
    },
    additionalAmount: {
      type: Number,
    },
    display: {
      type: Array, // optional
    },
  },
);

const attributeGroupsSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "A name is needed for this group"],
    },
    list: {
      type: Array,
    },
  },
);

const shopItemSchema = mongoose.Schema(
  {
    itemGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ItemGroup",
    },
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
      type: String,
      required: [true, "Add the category for the item"],
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
    attributeGroups: {
      type: [attributeGroupsSchema],
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
  { _id: 1, "attributes.attributeId": 1 },
  { unique: true, sparse: true }
);

// shopItemSchema.pre("save", async function (next) {
//   try {
//     for (let attr of this.attributes) {
//       if (attr.attributeId && (!attr.name || !attr.value)) {
//         const attributeDoc = await Attribute.findById(attr.attributeId);
//         if (attributeDoc) {
//           attr.name = attributeDoc.name;
//           attr.value = attributeDoc.value;
//         }
//       }
//     }
//     next();
//   } catch (err) {
//     next(err);
//   }
// });

const ShopItem = mongoose.model("ShopItem", shopItemSchema);
module.exports = { ShopItem, STATUS };
