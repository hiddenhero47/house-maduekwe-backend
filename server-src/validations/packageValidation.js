const yup = require("yup");

const packageValidationSchema = yup.object({
  name: yup.string().required("Package name is required"),
  length: yup
    .number()
    .required("Length is required")
    .min(0, "Length cannot be negative"),
  width: yup
    .number()
    .required("Width is required")
    .min(0, "Width cannot be negative"),
  height: yup
    .number()
    .required("Height is required")
    .min(0, "Height cannot be negative"),
  weight: yup
    .object({
      value: yup.number().min(0, "Weight value cannot be negative").optional(),
      unit: yup
        .string()
        .oneOf(["kg", "g", "lb", "oz"], "Invalid weight unit")
        .default("kg"),
    })
    .optional(),
});

module.exports = { packageValidationSchema };
