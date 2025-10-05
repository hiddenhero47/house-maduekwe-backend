const yup = require("yup");

const cartItemSchema = yup.object().shape({
  shopItemId: yup.string().required("shopItemId is required"),
  quantity: yup
    .number()
    .min(1, "Quantity must be at least 1")
    .required("Quantity is required"),
  selectedAttributes: yup
    .array()
    .of(
      yup.object().shape({
        name: yup.string().optional(),
        value: yup.string().optional(),
        _id: yup.string().required(),
      })
    )
    .default([]),
});

const addToCartSchema = yup.object().shape({
  itemList: yup
    .array()
    .of(cartItemSchema)
    .min(1, "itemList must contain at least one item")
    .required(),
});

module.exports = {
  addToCartSchema,
};
