const express = require("express");
const router = express.Router();
const {
  registerUser,
  loginUser,
  generate2fa,
  verify2fa,
  getMe,
} = require("../controllers/userController");
const { protect, secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");

router.post("/", registerUser);
router.post("/admin-create", secureRole(ROLE.SUPER_ADMIN), registerUser);
router.post("/login", loginUser);
router.get("/2fa/setup", protect, generate2fa);
router.post("/2fa/verify", protect, verify2fa);
router.get("/geMe", protect, getMe);

module.exports = router;
