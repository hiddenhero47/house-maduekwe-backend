const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const asyncHandler = require("express-async-handler");
const { User, ROLE } = require("../models/userModel");
const { authenticator } = require("otplib");
const qrcode = require("qrcode");

// @desc Register new user
// @route POST /api/users
// @access Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  const currentUserRole = req.user ? req.user.role : null;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Please add all fields");
  }

  // Block unauthorized admin/superAdmin creation
  if (
    currentUserRole !== ROLE.SUPER_ADMIN &&
    (role === ROLE.SUPER_ADMIN || role === ROLE.ADMIN)
  ) {
    res.status(403);
    throw new Error("Unauthorized to register admin");
  }

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("User already exists");
  }

  // Default role = BASIC
  let userRole = role && role !== "" ? role : ROLE.BASIC;

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create user
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role: userRole,
    currentUserRole,
  });

  if (user) {
    res.status(201).json({
      _id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error("Invalid user data");
  }
});

// @desc Authenticate a user
// @route POST /api/users/login
// @access Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Check for user email
  const user = await User.findOne({ email });

  if (user && (await bcrypt.compare(password, user.password))) {
    // If 2FA is enabled, verify token
    if (user.user2fa.enable) {
      if (!token) {
        res.status(400);
        err.code = "2FA_REQUIRED";
        throw new Error("2FA token required");
      }

      const isValid = authenticator.verify({
        token,
        secret: user.user2fa.secret,
      });

      if (!isValid) {
        res.status(400);
        throw new Error("Invalid 2FA token");
      }
    }

    res.json({
      _id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error("Invalid user credentials");
  }
});

// @desc Generate 2FA secret
// @route POST /api/users/2fa/setup
// @access Private (user must be logged in)
const generate2fa = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const tempSecret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(
    user.email,
    process.env.APP_NAME,
    tempSecret
  );

  // Generate QR Code (data URL for frontend or Postman)
  const qrCodeDataURL = await qrcode.toDataURL(otpauth);

  user.user2fa = { enable: false, tempSecret };
  await user.save();

  res.json({
    message: "2FA setup initiated",
    tempSecret,
    otpauth,
    qrCodeDataURL, // you can ignore this in Postman or render in frontend
  });
});

// @desc Verify 2FA code and enable
// @route POST /api/users/2fa/verify
// @access Private
const verify2fa = asyncHandler(async (req, res) => {
  const { token } = req.body; // 6-digit code from authenticator app
  const user = await User.findById(req.user.id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const isValid = authenticator.verify({
    token,
    secret: user.user2fa.tempSecret,
  });

  if (!isValid) {
    res.status(400);
    throw new Error("Invalid authentication code");
  }

  // Save permanent secret
  user.user2fa = { enable: true, secret: user.user2fa.tempSecret };
  await user.save();

  res.json({ message: "2FA enabled successfully" });
});

// @desc Get user data
// @route GET /api/users/geMe
// @access Privet
const getMe = asyncHandler(async (req, res) => {
  const { _id, name, email, role } = await User.findById(req.user.id);
  res.status(200).json({
    id: _id,
    name,
    email,
    role,
  });
});

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });
};

module.exports = {
  registerUser,
  loginUser,
  generate2fa,
  verify2fa,
  getMe,
};
