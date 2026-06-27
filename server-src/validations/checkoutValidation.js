const yup = require("yup");

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const checkoutValidationSchema = yup.object({
  itemList: yup
    .array()
    .of(yup.string().matches(objectIdRegex, "Invalid cart item id").required())
    .min(1, "At least one item is required")
    .required("Item list is required"),

  consigneesName: yup
    .string()
    .trim()
    .min(2, "Consignee name is too short")
    .max(100, "Consignee name is too long")
    .required("Please provide the full name of the consignee"),

  selectedAddress: yup
    .string()
    .matches(objectIdRegex, "Invalid address id")
    .nullable()
    .notRequired()
    .required("Shipping address is required"),
});

const confirmCheckoutValidation = yup.object({
  itemList: yup
    .array()
    .of(yup.string().matches(objectIdRegex, "Invalid cart item id").required())
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
    .optional(),
});

const guestCheckoutValidationSchema = yup.object({
  itemList: yup
    .array()
    .of(
      yup.object({
        shopItem: yup
          .string()
          .matches(objectIdRegex, "Invalid shop item id")
          .required("Shop item is required"),

        quantity: yup
          .number()
          .integer("Quantity must be a whole number")
          .min(1, "Quantity must be at least 1")
          .required("Quantity is required"),

        selectedAttributes: yup
          .array()
          .of(
            yup.object({
              Attribute: yup
                .object({
                  _id: yup
                    .string()
                    .matches(objectIdRegex, "Invalid selected attribute id")
                    .required("Attribute id is required"),
                })
                .required("Attribute is required"),
            }),
          )
          .default([]),
      }),
    )
    .min(1, "At least one item is required")
    .required("Item list is required"),

  consigneesName: yup
    .string()
    .trim()
    .min(2, "Consignee name is too short")
    .max(100, "Consignee name is too long")
    .required("Please provide the full name of the consignee"),

  email: yup
    .string()
    .trim()
    .email("Invalid email address")
    .required("Email is required"),

  phoneNumber: yup.object().when([], {
    is: (_, schema) => schema,
    then: yup
      .object({
        number: yup.string().trim().required("Phone number is required"),
        country: yup
          .string()
          .trim()
          .uppercase()
          .matches(
            /^[A-Z]{2}$/,
            "Phone country must be a valid 2-letter country code",
          )
          .required("Phone country is required"),
      })
      .notRequired(),
  }),

  address: yup
    .object({
      country: yup.string().trim().required("Country is required"),
      state: yup.string().trim().required("State is required"),
      city: yup.string().trim().required("City is required"),
      fullAddress: yup.string().trim().required("Full address is required"),
      zipCode: yup.string().trim().default(""),
      stateLine: yup.string().trim().default(""),
    })
    .required("Address is required"),
});

module.exports = {
  checkoutValidationSchema,
  confirmCheckoutValidation,
  guestCheckoutValidationSchema,
};
