const errorHandler = (err, req, res, next) => {
  // err.status is a defensive fallback — this codebase's convention is
  // err.statusCode.
  let statusCode =
    err.statusCode ||
    err.status ||
    (res.statusCode === 200 ? 500 : res.statusCode);

  // Handle Yup validation errors specifically
  if (err.name === "ValidationError") {
    return res.status(400).json({
      message: "Validation failed",
      errors: err.errors, // array of validation messages
    });
  }

  // Multer throws on exceeding app.js's forms() limits (fileSize/files) —
  // a clear 413 instead of the generic "something broke" 500.
  if (err.name === "MulterError") {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "One of the files you uploaded is too large (max 12MB each)"
        : err.code === "LIMIT_FILE_COUNT"
          ? "Too many files in one upload (max 40 at a time)"
          : err.message;

    return res.status(413).json({ message, code: err.code });
  }

  res.status(statusCode).json({
    message: err.message,
    code: err.code,
    data: err.data,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};

module.exports = {
  errorHandler,
};
