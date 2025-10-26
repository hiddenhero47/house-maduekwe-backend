const yup = require("yup");
const { STATUS } = require("../models/shopItemModel");
const { attributeType } = require("../models/attributeModel");

// ✅ Attribute Schema
const attributeSchema = yup.object({
  name: yup.string().required("Attribute name is required"),
  value: yup.string().required("Attribute value is required"),
  type: yup
    .string()
    .oneOf(Object.values(attributeType), "Invalid attribute type"),
  display: yup.string().optional(),
  quantity: yup.number().min(0).default(0),
  additionalAmount: yup.number().min(0).default(0),
  images: yup.array().optional(),
});

// ✅ File Validation Schema
// const fileValidationSchema = yup.object({
//   mimetype: yup
//     .string()
//     .matches(/^image\//, "Only image files are allowed")
//     .required("File type is required"),
//   size: yup
//     .number()
//     .max(2 * 1024 * 1024, "File size must be under 2MB")
//     .required("File size is required"),
//   originalname: yup.string().required("File name is required"),
// });

const imageCatalogSchema = yup.object({
  imageCatalog: yup
    .array()
    .of(yup.string())
    .required("Image catalog is required"),
});

// ✅ Shop Item Validation Schema
const shopItemValidationSchema = yup.object({
  itemGroupId: yup.string().optional(),
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
  category: yup.string().required("Category is required"),
  subCategory: yup.string().optional(),
  quantity: yup
    .number()
    .min(0, "Quantity must be >= 0")
    .required("Quantity is required"),
  placeHolder: yup.object().optional(),
  attributes: yup.array().of(attributeSchema).optional(),
  discount: yup.number().min(0, "Discount must be >= 0").optional(),
});

module.exports = {
  shopItemValidationSchema,
  imageCatalogSchema,
};
