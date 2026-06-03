const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const { User } = require("../models/userModel");

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(" ")[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        res.status(401);
        throw new Error("Not authorized");
      }

      // 🔐 SESSION VALIDATION (IMPORTANT ADDITION)
      if (decoded.sessionId !== user.sessionId) {
        res.status(401);
        throw new Error("Session expired. Please login again.");
      }

      req.user = user;

      next();
    } catch (error) {
      console.log(error);
      res.status(401);
      throw new Error("Not authorized");
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

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get user from the token
        const user = await User.findById(decoded.id).select("-password");

        if (!user) {
          res.status(401);
          throw new Error("Not authorized");
        }

        // 🔐 SESSION VALIDATION (IMPORTANT ADDITION)
        if (decoded.sessionId !== user.sessionId) {
          res.status(401);
          throw new Error("Session expired. Please login again.");
        }

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
        console.log(error);
        res.status(401);
        throw new Error("Not authorized");
      }
    } else {
      res.status(401);
      throw new Error("Not authorized, no token!");
    }
  });

module.exports = { protect, secureRole };
