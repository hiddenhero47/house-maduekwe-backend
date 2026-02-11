const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const asyncHandler = require("express-async-handler");
const { User, ROLE } = require("../models/userModel");
const { authenticator } = require("otplib");
const qrcode = require("qrcode");
const {
  uploadHandler,
  deleteFile,
  updateFile,
} = require("../helpers/fileManager");
const validateAvatar = require("../validations/userFileValidation");

const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const appleSignin = require("apple-signin-auth");
const { enable } = require("colors");

// @desc Register new user
// @route POST /api/users
// @access Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Please add all fields");
  }

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("User already exists");
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create user
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role: ROLE.BASIC,
  });

  if (user) {
    res.status(201).json({
      _id: user.id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      avatar: user.avatar,
      role: user.role,
      user2fa: {
        enable: user.user2fa?.enable || false,
      },
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
  const { email, password, token } = req.body;

  // Check for user email
  const user = await User.findOne({ email });

  if (user && (await bcrypt.compare(password, user.password))) {
    // If 2FA is enabled, verify token
    if (user.user2fa.enable) {
      if (!token) {
        const err = new Error("Invalid 2FA token");
        err.code = "2FA_REQUIRED";
        res.status(400);
        throw err;
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
      phoneNumber: user.phoneNumber,
      avatar: user.avatar,
      role: user.role,
      user2fa: {
        enable: user.user2fa?.enable || false,
      },
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
    tempSecret,
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

// @desc Toggle 2FA on/off
// @route PUT /api/users/2fa/toggle
// @access Private
const toggle2fa = asyncHandler(async (req, res) => {
  const { enable } = req.body;

  if (typeof enable !== "boolean") {
    res.status(400);
    throw new Error("Enable must be true or false");
  }

  const user = await User.findById(req.user.id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  if (enable === true) {
    if (user.user2fa?.enable) {
      res.status(400);
      throw new Error("2FA is already enabled");
    }

    if (!user.user2fa?.secret) {
      res.status(400);
      throw new Error("Please complete 2FA setup first");
    }

    user.user2fa.enable = true;
    await user.save();

    return res.json({
      message: "2FA enabled successfully",
      user2fa: { enable: true },
    });
  }

  if (enable === false) {
    if (!user.user2fa?.enable) {
      res.status(400);
      throw new Error("2FA is already disabled");
    }

    user.user2fa.enable = false;

    await user.save();

    return res.json({
      message: "2FA disabled successfully",
      user2fa: { enable: false },
    });
  }
});

// @desc Get user data
// @route GET /api/users/geMe
// @access Privet
const getMe = asyncHandler(async (req, res) => {
  const { _id, name, email, phoneNumber, avatar, role, user2fa } =
    await User.findById(req.user.id);
  res.status(200).json({
    id: _id,
    name,
    email,
    phoneNumber,
    avatar,
    role,
    user2fa: {
      enable: user2fa?.enable || false,
    },
  });
});

// @desc Call back authenticator
// @route POST /api/social/google
// @access Public
const googleLogin = asyncHandler(async (req, res) => {
  const { idToken, token } = req.body; // token = 2FA token (optional)

  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  const { sub, email, name, picture } = payload;

  let user = null;
  if (email) {
    user = await User.findOne({ email });
  }
  if (!user && !email) {
    user = await User.findOne({
      "authProviders.provider": "google",
      "authProviders.providerId": sub,
    });
  }

  if (!user) {
    user = await createOAuthUser({
      name,
      email,
      provider: "google",
      providerId: sub,
      picture,
    });
  } else {
    const duplicateProvider = await User.findOne({
      "authProviders.provider": "google",
      "authProviders.providerId": sub,
    });

    if (
      duplicateProvider &&
      duplicateProvider._id.toString() !== user._id.toString()
    ) {
      res.status(409);
      throw new Error("This Google account is already linked to another user");
    }

    const alreadyLinked = user.authProviders?.some(
      (p) => p.provider === "google",
    );

    if (!alreadyLinked) {
      user.authProviders.push({
        provider: "google",
        providerId: sub,
      });

      if (!user.avatar && picture) {
        const { results } = await uploadHandler({
          req: { body: { url: picture } },
          allowedTypes: ["image/jpeg", "image/png", "image/webp"],
        });
        if (results?.length) {
          user.avatar = results[0];
        }
      }

      await user.save();
    }
  }

  // 🔐 2FA check (same logic as password login)
  if (user.user2fa.enable) {
    if (!token) {
      const err = new Error("Invalid 2FA token");
      err.code = "2FA_INVALID";
      res.status(400);
      throw err;
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
});

// @desc Call back authenticator
// @route POST /api/social/apple
// @access Public
const appleLogin = asyncHandler(async (req, res) => {
  const { identityToken, token } = req.body;

  const appleUser = await appleSignin.verifyIdToken(identityToken, {
    audience: process.env.APPLE_CLIENT_ID,
    ignoreExpiration: false,
  });

  const { sub, email } = appleUser;

  let user = null;
  if (email) {
    user = await User.findOne({ email });
  }
  if (!user && !email) {
    user = await User.findOne({
      "authProviders.provider": "apple",
      "authProviders.providerId": sub,
    });
  }

  if (!user) {
    user = await createOAuthUser({
      name: "Apple User",
      email,
      provider: "apple",
      providerId: sub,
    });
  } else {
    const duplicateProvider = await User.findOne({
      "authProviders.provider": "apple",
      "authProviders.providerId": sub,
    });

    if (
      duplicateProvider &&
      duplicateProvider._id.toString() !== user._id.toString()
    ) {
      res.status(409);
      throw new Error("This Apple account is already linked to another user");
    }

    const alreadyLinked = user.authProviders?.some(
      (p) => p.provider === "apple",
    );

    if (!alreadyLinked) {
      user.authProviders.push({
        provider: "apple",
        providerId: sub,
      });
      await user.save();
    }
  }

  // 🔐 2FA check
  if (user.user2fa.enable) {
    if (!token) {
      const err = new Error("Invalid 2FA token");
      err.code = "2FA_INVALID";
      res.status(400);
      throw err;
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
});

// @desc Update user profile
// @route PUT /api/users/profile
// @access Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const { name, phoneNumber, password, oldPassword, base64, url } = req.body;

  if (password) {
    if (!oldPassword) {
      res.status(400);
      throw new Error("Old password is required to update password");
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      res.status(400);
      throw new Error("Old password is incorrect");
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
  }

  if (name) user.name = name;
  if (phoneNumber) user.phoneNumber = phoneNumber;

  const hasNewAvatar = req.files || req.file || base64 || url;

  if (hasNewAvatar) {
    let uploadResult;

    if (user.avatar?.path) {
      // ♻️ Replace existing avatar
      uploadResult = await updateFile({
        oldFilePath: user.avatar.path,
        req,
        schema: validateAvatar,
        allowedTypes: ["image/jpeg", "image/png", "image/webp"],
      });
    } else {
      // 🆕 First-time avatar upload
      uploadResult = await uploadHandler({
        req,
        allowedTypes: ["image/jpeg", "image/png", "image/webp"],
      });
    }

    if (uploadResult.results?.length) {
      user.avatar = uploadResult.results[0];
    }
  }

  await user.save();

  res.json({
    message: "Profile updated successfully",
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      avatar: user.avatar,
      role: user.role,
      user2fa: {
        enable: user.user2fa?.enable || false,
      },
    },
  });
});

// @desc Register new admin
// @route POST /api/users/admin-create
// @access Private (SUPER_ADMIN only)
const registerAdmin = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Please add all fields");
  }

  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("User already exists");
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const admin = new User({
    name,
    email,
    password: hashedPassword,
    role: ROLE.ADMIN,
  });

  // 🔐 Internal flag (NOT persisted)
  admin._adminCreation = true;

  await admin.save();

  res.status(201).json({
    _id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
  });
});

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });
};

// Create OAuth User Safely
const createOAuthUser = async ({
  name,
  email,
  provider,
  providerId,
  picture,
}) => {
  const dummyPassword = await bcrypt.hash(
    providerId + process.env.JWT_SECRET,
    10,
  );

  let avatar = null;
  if (picture) {
    const { results } = await uploadHandler({
      req: { body: { url: picture } },
      allowedTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    avatar = results[0];
  }

  return User.create({
    name: name || "User",
    email,
    avatar: avatar || undefined,
    password: dummyPassword,
    authProviders: [{ provider, providerId }],
    role: ROLE.BASIC,
  });
};

module.exports = {
  registerUser,
  loginUser,
  generate2fa,
  verify2fa,
  getMe,
  googleLogin,
  appleLogin,
  updateUserProfile,
  registerAdmin,
  toggle2fa,
};
