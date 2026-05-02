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

const badRequest = (msg) => {
  const err = new Error(msg);
  err.statusCode = 400;
  return err;
};

shopItemSchema.pre("validate", function (next) {
  const getAttrKey = (a) => {
    if (!a?.Attribute) {
      const error = new Error("Attribute reference missing in attributes[]");
      error.statusCode = 400;
      throw error;
    }

    if (typeof a.Attribute === "object") {
      if (!a.Attribute._id) {
        const error = new Error("Populated Attribute missing _id");
        error.statusCode = 400;
        throw error;
      }
      return a.Attribute._id.toString();
    }

    return a.Attribute.toString();
  };

  const typeMap = new Map();

  for (const attr of this.attributes) {
    if (!attr.isDefault) continue;

    const type = attr.type;

    typeMap.set(type, (typeMap.get(type) || 0) + 1);

    if (typeMap.get(type) > 1) {
      return next(badRequest(`Only one default allowed per type (${type})`));
    }
  }

  if (!Array.isArray(this.groupedVariants) || this.groupedVariants.length === 0)
    return next();

  const attributeIds = new Set(this.attributes.map(getAttrKey));

  for (const group of this.groupedVariants) {
    const primary = group.primaryAttribute?.toString();

    if (!attributeIds.has(primary)) {
      return next(
        badRequest("GroupedVariant primaryAttribute is not in attributes list"),
      );
    }

    const seen = new Set();

    for (const opt of group.options) {
      const optId = opt.attribute?.toString();

      if (!attributeIds.has(optId)) {
        return next(
          badRequest(
            "GroupedVariant option attribute is not in attributes list",
          ),
        );
      }

      if (seen.has(optId)) {
        return next(
          badRequest("Duplicate attribute in groupedVariants options"),
        );
      }

      seen.add(optId);
    }
  }

  const attributesMap = new Map(this.attributes.map((a) => [getAttrKey(a), a]));

  const firstGroup = this.groupedVariants.find((g) =>
    attributesMap.has(g.primaryAttribute?.toString()),
  );

  if (!firstGroup) {
    return next(badRequest("Invalid groupedVariants structure"));
  }

  const primaryType = attributesMap.get(
    firstGroup.primaryAttribute.toString(),
  ).type;

  for (const group of this.groupedVariants) {
    const attr = attributesMap.get(group.primaryAttribute?.toString());

    if (!attr) continue;

    if (attr.type !== primaryType) {
      return next(
        badRequest("All groupedVariants must share same attribute type"),
      );
    }

    if (
      group.options.some(
        (opt) =>
          opt.attribute?.toString() === group.primaryAttribute?.toString(),
      )
    ) {
      return next(
        badRequest("Primary attribute cannot be inside its own options"),
      );
    }
  }

  // -----------------------------
  // ATTRIBUTE TOTAL ≤ PRODUCT (per type)
  // -----------------------------
  const attrTypeQtyMap = new Map();

  for (const attr of this.attributes) {
    const type = attr.type;
    const qty = attr.quantity || 0;

    attrTypeQtyMap.set(type, (attrTypeQtyMap.get(type) || 0) + qty);

    if (attrTypeQtyMap.get(type) > this.quantity) {
      return next(
        badRequest(
          `Attributes of type "${type}" exceed product stock (${attrTypeQtyMap.get(
            type,
          )} > ${this.quantity})`,
        ),
      );
    }
  }

  // -----------------------------
  // VARIANT TOTAL ≤ PRIMARY ATTRIBUTE
  // -----------------------------
  for (const group of this.groupedVariants) {
    const primaryKey = group.primaryAttribute?.toString();

    const primaryAttr = attributesMap.get(primaryKey);

    if (!primaryAttr) continue;

    const primaryQty = primaryAttr.quantity || 0;

    const totalOptionsQty = (group.options || []).reduce(
      (sum, opt) => sum + (opt.quantity || 0),
      0,
    );

    if (totalOptionsQty > primaryQty) {
      return next(
        badRequest(
          `Grouped variant exceeds primary stock (${totalOptionsQty} > ${primaryQty})`,
        ),
      );
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

shopItemSchema.pre("findOneAndUpdate", async function (next) {
  const update = this.getUpdate() || {};
  if (!update) return next();

  const data = update.$set ? update.$set : update;

  // -----------------------------
  // NORMALIZE TAGS
  // -----------------------------
  if (Array.isArray(data.classTags)) {
    data.classTags = [
      ...new Set(
        data.classTags.map((tag) =>
          typeof tag === "string" ? tag.toLowerCase().trim() : tag,
        ),
      ),
    ];
  }

  // -----------------------------
  // LOAD EXISTING DOCUMENT
  // -----------------------------
  const doc = await this.model.findOne(this.getQuery()).lean();

  if (!doc) return next();

  // merge existing + update
  const attributes = data.attributes ?? doc.attributes;
  const groupedVariants = data.groupedVariants ?? doc.groupedVariants;

  // -----------------------------
  // SINGLE DEFAULT PER TYPE
  // -----------------------------
  if (Array.isArray(attributes)) {
    const typeMap = new Map();

    for (const attr of attributes) {
      if (!attr.isDefault) continue;

      const type = attr.type;
      if (!type) continue;

      const count = (typeMap.get(type) || 0) + 1;
      typeMap.set(type, count);

      if (count > 1) {
        return next(badRequest(`Only one default allowed per type (${type})`));
      }
    }
  }

  // -----------------------------
  // STRICT ATTRIBUTE KEY
  // -----------------------------
  const getAttrKey = (a) => {
    if (!a?.Attribute) {
      const error = new Error("Attribute reference missing in attributes[]");
      error.statusCode = 400;
      throw error;
    }

    if (typeof a.Attribute === "object") {
      if (!a.Attribute._id) {
        const error = new Error("Populated Attribute missing _id");
        error.statusCode = 400;
        throw error;
      }
      return a.Attribute._id.toString();
    }

    return a.Attribute.toString();
  };

  const attributeIds = new Set(attributes.map(getAttrKey));

  // -----------------------------
  // GROUPED VARIANTS VALIDATION
  // -----------------------------
  if (Array.isArray(groupedVariants)) {
    for (const group of groupedVariants) {
      const primary = group.primaryAttribute?.toString();

      if (!attributeIds.has(primary)) {
        return next(
          badRequest(
            "GroupedVariant primaryAttribute is not in attributes list",
          ),
        );
      }

      const seen = new Set();

      for (const opt of group.options || []) {
        const optId = opt.attribute?.toString();

        if (!attributeIds.has(optId)) {
          return next(
            badRequest(
              "GroupedVariant option attribute is not in attributes list",
            ),
          );
        }

        if (seen.has(optId)) {
          return next(
            badRequest("Duplicate attribute in groupedVariants options"),
          );
        }

        seen.add(optId);
      }
    }
  }

  // -----------------------------
  // RE-ASSIGN UPDATE
  // -----------------------------
  if (update.$set) {
    update.$set = data;
  } else {
    this.setUpdate(data);
  }

  // -----------------------------
  // ATTRIBUTE TOTAL ≤ PRODUCT (per type)
  // -----------------------------
  if (Array.isArray(attributes)) {
    const productQty = data.quantity ?? doc.quantity;

    const typeMap = new Map();

    for (const attr of attributes) {
      const type = attr.type;
      const qty = attr.quantity || 0;

      typeMap.set(type, (typeMap.get(type) || 0) + qty);

      if (typeMap.get(type) > productQty) {
        return next(
          badRequest(
            `Attributes of type "${type}" exceed product stock (${typeMap.get(
              type,
            )} > ${productQty})`,
          ),
        );
      }
    }
  }

  // -----------------------------
  // VARIANT TOTAL ≤ PRIMARY ATTRIBUTE
  // -----------------------------
  if (Array.isArray(groupedVariants) && Array.isArray(attributes)) {
    const attrMap = new Map(attributes.map((a) => [getAttrKey(a), a]));

    for (const group of groupedVariants) {
      const primaryKey = group.primaryAttribute?.toString();

      const primaryAttr = attrMap.get(primaryKey);
      if (!primaryAttr) continue;

      const primaryQty = primaryAttr.quantity || 0;

      const totalOptionsQty = (group.options || []).reduce(
        (sum, opt) => sum + (opt.quantity || 0),
        0,
      );

      if (totalOptionsQty > primaryQty) {
        return next(
          badRequest(
            `Grouped variant exceeds primary stock (${totalOptionsQty} > ${primaryQty})`,
          ),
        );
      }
    }
  }

  next();
});

const ShopItem = mongoose.model("ShopItem", shopItemSchema);
module.exports = { ShopItem, STATUS };
