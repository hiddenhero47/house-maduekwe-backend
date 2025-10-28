const yup = require("yup");
const { STATUS } = require("../models/shopItemModel");
const Category = require("../models/categoryModel");
const { Attribute } = require("../models/attributeModel");

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
      }
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
  price: yup.number().required("Price is required"),
  vat: yup.number().required("VAT percentage is required"),
  currency: yup.string().required("Currency is required"),

  category: objectIdExists(Category, "Category").required(
    "Category is required"
  ),
  subCategory: yup.string().optional(),

  quantity: yup.number().min(0).required("Quantity is required"),
  placeHolder: yup.object().optional(),
  attributes: yup
    .array()
    .of(
      yup.object({
        Attribute: objectIdExists(Attribute, "Attribute").required(
          "Attribute is required"
        ),
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
              url: yup.string().url().required(),
              mime: yup.string().required(),
            })
          )
          .optional(),
      })
    )
    .optional(),
  discount: yup.number().min(0).optional(),
});

module.exports = {
  shopItemValidationSchema,
  imageCatalogSchema,
};
