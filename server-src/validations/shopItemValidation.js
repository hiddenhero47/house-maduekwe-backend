const yup = require("yup");
const { STATUS } = require("../models/shopItemModel");
const Category = require("../models/categoryModel");
const { Attribute, attributeType } = require("../models/attributeModel");

// ✅ Helper to validate and verify MongoDB ObjectId existence
const objectIdExists = (Model, fieldName) =>
  yup
    .string()
    .matches(/^[0-9a-fA-F]{24}$/, `Invalid ${fieldName} format`)
    .test(
      `${fieldName}-exists`,
      `${fieldName} does not exist`,
      async function (value) {
        if (!value) return true; // let required() handle emptiness
        const exists = await Model.exists({ _id: value });
        return !!exists;
      },
    );

// ✅ Image Catalog Schema
const imageCatalogSchema = yup.object({
  imageCatalog: yup
    .array()
    .of(yup.string().url("Each image must be a valid URL"))
    .required("Image catalog is required"),
});

// ✅ Shop Item Schema
const shopItemValidationSchema = yup.object({
  name: yup.string().required("Item name is required"),
  brand: yup.string().optional(),
  status: yup
    .string()
    .oneOf(Object.values(STATUS), "Invalid status")
    .default("available"),
  description: yup.string().optional(),
  price: yup
    .number()
    .required("Price is required")
    .min(1, "Price must be at least 1"),
  vat: yup
    .number()
    .required("VAT percentage is required")
    .min(0, "VAT cannot be negative"),
  currency: yup
    .string()
    .required("Currency is required")
    .matches(/^[A-Z]{3}$/, "Currency must be a valid 3-letter currency code"),

  category: objectIdExists(Category, "Category").required(
    "Category is required",
  ),
  subCategory: yup.string().optional(),

  quantity: yup.number().min(0).required("Quantity is required"),
  placeHolder: yup.object().optional(),
  attributes: yup
    .array()
    .of(
      yup.object({
        Attribute: objectIdExists(Attribute, "Attribute").required(
          "Attribute is required",
        ),
        type: yup
          .string()
          .oneOf(Object.values(attributeType), "Invalid attribute type")
          .required("Attribute type is required"),
        isDefault: yup.boolean().default(false),
        quantity: yup.number().min(0).optional(),
        additionalAmount: yup.number().min(0).optional(),
        images: yup
          .array()
          .of(
            yup.object({
              id: yup.string().required(),
              fileName: yup.string().required(),
              path: yup.string().required(),
              url: yup.string().required(),
              mime: yup.string().required(),
            }),
          )
          .optional(),
      }),
    )
    .test(
      "unique-attributes",
      "Duplicate Attribute references are not allowed",
      function (attributes) {
        if (!attributes) return true;
        const ids = attributes.map((a) => a.Attribute);
        const uniqueIds = new Set(ids);
        return ids.length === uniqueIds.size;
      },
    )
    .test(
      "single-default-per-type",
      "Each attribute type can only have one default",
      function (attributes) {
        if (!attributes) return true;

        // group by type
        const typeMap = new Map();

        for (const attr of attributes) {
          if (!attr.isDefault) continue;

          const type = attr.type || "unknown";

          if (!typeMap.has(type)) {
            typeMap.set(type, 0);
          }

          typeMap.set(type, typeMap.get(type) + 1);

          if (typeMap.get(type) > 1) {
            return this.createError({
              message: `Only one default allowed per type (${type})`,
            });
          }
        }

        return true;
      },
    )
    .test(
      "attributes-total-qty-per-type",
      "Attribute quantities exceed product stock per type",
      function (attributes) {
        const { parent } = this;

        if (!attributes || !parent?.quantity) return true;

        const typeMap = new Map();

        for (const attr of attributes) {
          const type = attr.type || "unknown";
          const qty = attr.quantity || 0;

          typeMap.set(type, (typeMap.get(type) || 0) + qty);

          if (typeMap.get(type) > parent.quantity) {
            return this.createError({
              message: `Attributes of type "${type}" exceed product stock (${typeMap.get(
                type,
              )} > ${parent.quantity})`,
            });
          }
        }

        return true;
      },
    )
    .optional(),

  discount: yup.number().min(0).optional(),

  highlights: yup
    .array()
    .of(yup.string().trim().min(1, "Highlight cannot be empty"))
    .optional(),

  classTags: yup
    .array()
    .of(yup.string().trim().min(1))
    .test(
      "unique-tags",
      "Duplicate tags are not allowed",
      (tags) => !tags || tags.length === new Set(tags).size,
    )
    .optional(),

  groupedVariants: yup
    .array()
    .of(
      yup
        .object({
          primaryAttribute: objectIdExists(
            Attribute,
            "Primary attribute",
          ).required("Primary attribute is required"),

          options: yup
            .array()
            .of(
              yup.object({
                attribute: objectIdExists(
                  Attribute,
                  "Variant attribute",
                ).required("Variant attribute is required"),

                quantity: yup
                  .number()
                  .required("Quantity is required for each variant option")
                  .min(0, "Quantity cannot be negative"),
              }),
            )
            .min(1, "Each groupedVariant must have at least one option")
            .test(
              "unique-options",
              "Duplicate attributes in groupedVariants options",
              function (options) {
                if (!options) return true;
                const ids = options.map((o) => o.attribute);
                return ids.length === new Set(ids).size;
              },
            ),
        })
        .test(
          "no-self-reference",
          "Primary attribute cannot be inside its own options",
          function (group) {
            if (!group) return true;

            const primary = group.primaryAttribute;
            const optionIds = group.options?.map((o) => o.attribute) || [];

            return !optionIds.includes(primary);
          },
        ),
    )
    .test(
      "unique-primary",
      "Duplicate primaryAttribute in groupedVariants",
      function (groups) {
        if (!groups) return true;

        const ids = groups.map((g) => g.primaryAttribute);
        return ids.length === new Set(ids).size;
      },
    )
    .test(
      "same-type",
      "All groupedVariants must share same attribute type",
      function (groups) {
        const { attributes } = this.parent;

        if (!groups || !attributes) return true;

        const attrMap = new Map(
          attributes.map((a) => [a.Attribute?.toString(), a]),
        );

        const first = attrMap.get(groups[0]?.primaryAttribute);

        if (!first) return true;

        const type = first.type;

        return groups.every((g) => {
          const attr = attrMap.get(g.primaryAttribute);
          return attr && attr.type === type;
        });
      },
    )
    .test(
      "variant-total-match",
      "Sum of variant options must not exceed primary quantity",
      function (groups) {
        const { attributes } = this.parent;

        if (!groups || !attributes) return true;

        // ✅ STRICT: use Attribute._id only
        const attrMap = new Map(
          attributes.map((a) => [a.Attribute?.toString(), a]),
        );

        for (const group of groups) {
          const primaryKey = group.primaryAttribute?.toString();

          const primary = attrMap.get(primaryKey);

          if (!primary) {
            return this.createError({
              message: `Primary attribute "${group.primaryAttribute}" not found in attributes`,
            });
          }

          const primaryQty = primary.quantity || 0;

          const totalOptionsQty = (group.options || []).reduce(
            (sum, opt) => sum + (opt.quantity || 0),
            0,
          );

          if (totalOptionsQty > primaryQty) {
            return this.createError({
              message: `Grouped variant "${group.primaryAttribute}" exceeds primary stock (${totalOptionsQty} > ${primaryQty})`,
            });
          }
        }

        return true;
      },
    )
    .test(
      "attributes-must-exist-in-parent",
      "Grouped variants must reference attributes defined in attributes[]",
      function (groups) {
        const { attributes } = this.parent;

        if (!groups || !attributes) return true;

        const validAttrIds = new Set(
          attributes.map((a) => a.Attribute?.toString()),
        );

        for (const group of groups) {
          const primary = group.primaryAttribute?.toString();

          if (!validAttrIds.has(primary)) {
            return this.createError({
              message: `Primary attribute "${primary}" is not in attributes[]`,
            });
          }

          for (const opt of group.options || []) {
            const attr = opt.attribute?.toString();

            if (!validAttrIds.has(attr)) {
              return this.createError({
                message: `Variant attribute "${attr}" is not in attributes[]`,
              });
            }
          }
        }

        return true;
      },
    )
    .optional(),
});

module.exports = {
  shopItemValidationSchema,
  imageCatalogSchema,
};
