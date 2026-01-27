const yup = require("yup");

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const checkoutValidationSchema = yup.object({
  itemList: yup
    .array()
    .of(
      yup
        .string()
        .matches(objectIdRegex, "Invalid cart item id")
        .required()
    )
    .min(1, "At least one item is required")
    .required("Item list is required"),

  selectedAddress: yup
    .string()
    .matches(objectIdRegex, "Invalid address id")
    .nullable()
    .notRequired()
    .required("Shipping address is required"),

  paymentMethod: yup
    .string()
    .matches(objectIdRegex, "Invalid payment provider id")
    .nullable()
    .notRequired()
    .required("Payment method is required"),
});

module.exports = checkoutValidationSchema;
