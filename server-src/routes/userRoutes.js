const express = require("express");
const router = express.Router();
const {
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
} = require("../controllers/userController");
const { protect, secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");

router.post("/", registerUser);
router.post("/admin-create", secureRole(ROLE.SUPER_ADMIN), registerAdmin);
router.post("/login", loginUser);
router.get("/2fa/setup", protect, generate2fa);
router.post("/2fa/verify", protect, verify2fa);
router.get("/getMe", protect, getMe);
router.post("/social/google", googleLogin);
router.post("/social/apple", appleLogin);
router.put("/profile", protect, updateUserProfile);
router.put("/2fa/toggle", protect, toggle2fa);

module.exports = router;
