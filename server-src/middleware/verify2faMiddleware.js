const { authenticator } = require("otplib");
const asyncHandler = require("express-async-handler");

const verify2fa = (require2fa = true) =>
  asyncHandler(async (req, res, next) => {
    const user = req.user; // assume auth middleware populated this

    if (!user) {
      res.status(401);
      throw new Error("Unauthorized");
    }

    // If 2FA not enabled
    if (!user.user2fa?.enable) {
      if (require2fa) {
        res.status(403);
        throw new Error("Two-factor authentication required but not enabled");
      }
      return next();
    }

    // If 2FA enabled but token missing
    const token = req.headers["x-2fa-token"] || req.body?.token;
    if (!token) {
      res.status(403);
      const err = new Error("Two-factor authentication token required");
      err.code = "2FA_REQUIRED";
      throw err;
    }

    // Verify token
    const isValid = authenticator.verify({
      token,
      secret: user.user2fa.secret,
    });

    if (!isValid) {
      res.status(403);
      const err = new Error("Invalid two-factor authentication token");
      err.code = "2FA_INVALID";
      throw err;
    }

    next();
  });

module.exports = verify2fa;
