const express = require("express");
const router = express.Router();

const {
  getMedia,
  uploadMedia,
  deleteMedia,
} = require("../controllers/mediaController");

const { secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");

// Get media files
router.get("/", secureRole(ROLE.SUPER_ADMIN), getMedia);

// Upload media files
router.post("/", secureRole(ROLE.SUPER_ADMIN), uploadMedia);

// Delete one or all media files
router.delete("/", secureRole(ROLE.SUPER_ADMIN), deleteMedia);

module.exports = router;
