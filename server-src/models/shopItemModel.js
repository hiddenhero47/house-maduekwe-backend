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
  type: {
    type: String,
    required: true,
    enum: Object.values(attributeType),
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

const groupedVariantSchema = new mongoose.Schema({
  primaryAttribute: {
    type: mongoose.Schema.Types.ObjectId, // attributes._id (e.g. Red)
    required: true,
  },

  options: [
    {
      attribute: {
        type: mongoose.Schema.Types.ObjectId, // attributes._id (e.g. M)
        required: true,
      },

      quantity: {
        type: Number,
        required: true,
        min: 0,
      },
    },
  ],
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
    groupedVariants: {
      type: [groupedVariantSchema],
      default: [],
    },
    discount: {
      type: Number,
      default: 0,
    },
    highlights: {
      type: [String],
      default: [],
    },
    classTags: {
      type: [String],
      default: [],
      index: true,
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

shopItemSchema.index(
  { _id: 1, "attributes.Attribute": 1 },
  { unique: true, sparse: true },
);

shopItemSchema.index(
  {
    name: "text",
    brand: "text",
    classTags: "text",
  },
  {
    weights: {
      name: 10,
      brand: 5,
      classTags: 5,
    },
  },
);

shopItemSchema.pre("validate", function (next) {
  const typeMap = new Map();

  for (const attr of this.attributes) {
    if (!attr.isDefault) continue;

    const type = attr.type;

    typeMap.set(type, (typeMap.get(type) || 0) + 1);

    if (typeMap.get(type) > 1) {
      return next(new Error(`Only one default allowed per type (${type})`));
    }
  }

  // ✅ Validate groupedVariants references
  const attributeIds = this.attributes.map((a) => a._id.toString());

  for (const group of this.groupedVariants) {
    // Check primaryAttribute exists
    if (!attributeIds.includes(group.primaryAttribute.toString())) {
      return next(
        new Error("GroupedVariant primaryAttribute is not in attributes list"),
      );
    }

    // Prevent duplicate options within group
    const seen = new Set();

    for (const opt of group.options) {
      const optId = opt.attribute.toString();

      if (!attributeIds.includes(optId)) {
        return next(
          new Error(
            "GroupedVariant option attribute is not in attributes list",
          ),
        );
      }

      if (seen.has(optId)) {
        return next(
          new Error("Duplicate attribute in groupedVariants options"),
        );
      }

      seen.add(optId);
    }
  }

  if (this.groupedVariants.length > 0) {
    const attributesMap = new Map(
      this.attributes.map((a) => [a._id.toString(), a]),
    );

    const firstPrimary = attributesMap.get(
      this.groupedVariants[0]?.primaryAttribute.toString(),
    );

    const primaryType = firstPrimary?.type;

    for (const group of this.groupedVariants) {
      const attr = attributesMap.get(group.primaryAttribute.toString());

      if (!attr) continue;

      if (attr.type !== primaryType) {
        return next(
          new Error("All groupedVariants must share same attribute type"),
        );
      }

      if (
        group.options.some(
          (opt) =>
            opt.attribute.toString() === group.primaryAttribute.toString(),
        )
      ) {
        return next(
          new Error("Primary attribute cannot be inside its own options"),
        );
      }
    }
  }

  next();
});

shopItemSchema.pre("save", function (next) {
  if (this.classTags?.length) {
    this.classTags = this.classTags.map((tag) => tag.toLowerCase().trim());
  }
  next();
});

shopItemSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();

  if (!update) return next();

  // Handle $set wrappers
  const data =
    update.$set && typeof update.$set === "object" ? update.$set : update;

  // ✅ Normalize classTags
  if (Array.isArray(data.classTags)) {
    data.classTags = [
      ...new Set(
        data.classTags.map((tag) =>
          typeof tag === "string" ? tag.toLowerCase().trim() : tag,
        ),
      ),
    ];
  }

  // ✅ Enforce single default attribute on update
  if (Array.isArray(data.attributes)) {
    const typeMap = new Map();

    for (const attr of data.attributes) {
      if (!attr.isDefault) continue;

      const type = attr.type;

      typeMap.set(type, (typeMap.get(type) || 0) + 1);

      if (typeMap.get(type) > 1) {
        return next(new Error(`Only one default allowed per type (${type})`));
      }
    }
  }

  // Re-assign in case we used $set
  if (update.$set) {
    update.$set = data;
  } else {
    this.setUpdate(data);
  }

  next();
});

const ShopItem = mongoose.model("ShopItem", shopItemSchema);
module.exports = { ShopItem, STATUS };
