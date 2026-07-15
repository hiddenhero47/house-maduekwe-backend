const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const { User } = require("../models/userModel");

const getAuthenticatedUser = async (token) => {
  // Verify token
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  // Get user from the token
  const user = await User.findById(decoded.id).select("-password");

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  // 🔐 SESSION VALIDATION (IMPORTANT ADDITION)
  if (decoded.sessionId !== user.sessionId) {
    throw new Error("SESSION_INVALID");
  }

  return user;
};

const handleAuthError = (error, res) => {
  console.error(error);

  res.status(401);

  if (error.name === "TokenExpiredError") {
    throw new Error("Session expired. Please login again.");
  }

  if (error.message === "SESSION_INVALID") {
    throw new Error("Session expired. Please login again.");
  }

  if (error.message === "USER_NOT_FOUND") {
    throw new Error("User not authorized");
  }

  throw new Error("Not authorized");
};

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(" ")[1];

      req.user = await getAuthenticatedUser(token);

      next();
    } catch (error) {
      handleAuthError(error, res);
    }
  }
  if (!token) {
    res.status(401);
    throw new Error("Not authorized, no token!");
  }
});

const secureRole = (roles) =>
  asyncHandler(async (req, res, next) => {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      try {
        // Get token from header
        token = req.headers.authorization.split(" ")[1];

        const user = await getAuthenticatedUser(token);

        const allowedRoles = Array.isArray(roles) ? roles : [roles];

        if (!user || !allowedRoles.includes(user.role)) {
          // Check if user is not found or role doesn't match
          console.log("error user role");
          res.status(401);
          throw new Error("Not authorized");
        }

        req.user = user; // Assign the user object to req.user

        next();
      } catch (error) {
        handleAuthError(error, res);
      }
    } else {
      res.status(401);
      throw new Error("Not authorized, no token!");
    }
  });

module.exports = { protect, secureRole };
