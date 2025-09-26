const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode ? res.statusCode : 500;

  // Handle Yup validation errors specifically
  if (err.name === "ValidationError") {
    statusCode = 400;
    return res.status(statusCode).json({
      message: "Validation failed",
      errors: err.errors, // array of validation messages
    });
  }

  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};

module.exports = {
  errorHandler,
};
