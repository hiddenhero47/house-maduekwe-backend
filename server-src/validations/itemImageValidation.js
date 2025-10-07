const yup = require("yup");

const MAX_SIZE = 2 * 1024 * 1024; // 2MB

const validateFiles = async (req) => {
  // Helper: validate uploaded file objects (from multer)
  const fileSchema = yup.object({
    mimetype: yup
      .string()
      .matches(/^image\//, "Only image files are allowed")
      .required("File type is required"),
    size: yup
      .number()
      .max(MAX_SIZE, "File size must be under 2MB")
      .required("File size is required"),
    originalname: yup.string().required("File name is required"),
  });

  // 1️⃣ Multer - single file upload
  if (req.file) {
    await fileSchema.validate(req.file, { abortEarly: false });
    return [req.file];
  }

  // 2️⃣ Multer - multiple file uploads
  if (Array.isArray(req.files) && req.files.length > 0) {
    await yup
      .array()
      .of(fileSchema)
      .min(1, "At least one image is required")
      .validate(req.files, { abortEarly: false });
    return req.files;
  }

  // 3️⃣ Base64 image(s)
  if (req.body?.base64) {
    const base64Array = Array.isArray(req.body.base64)
      ? req.body.base64
      : [req.body.base64];

    const base64Schema = yup
      .string()
      .matches(
        /^data:image\/(jpeg|png|webp);base64,/,
        "Invalid base64 image format"
      )
      .test("base64-size", "Base64 image must be under 2MB", (str) => {
        const sizeInBytes =
          (str.length * 3) / 4 -
          (str.endsWith("==") ? 2 : str.endsWith("=") ? 1 : 0);
        return sizeInBytes <= MAX_SIZE;
      })
      .required("Base64 image is required");

    await yup
      .array()
      .of(base64Schema)
      .validate(base64Array, { abortEarly: false });
    return base64Array;
  }

  // 4️⃣ URL(s)
  if (req.body?.url) {
    const urlArray = Array.isArray(req.body.url)
      ? req.body.url
      : [req.body.url];

    const urlSchema = yup
      .string()
      .url("Invalid image URL")
      .matches(/\.(jpeg|jpg|png|webp)$/i, "URL must point to an image file")
      .required("Image URL is required");

    await yup.array().of(urlSchema).validate(urlArray, { abortEarly: false });
    return urlArray;
  }

  // ❌ No valid image input found
  throw new yup.ValidationError(["No valid image data found in request"]);
};

module.exports = validateFiles;
