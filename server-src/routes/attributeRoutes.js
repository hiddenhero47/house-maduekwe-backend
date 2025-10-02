const express = require("express");
const {
  createAttribute,
  getAttributes,
  getAttributeById,
  updateAttribute,
  deleteAttribute,
} = require("../controllers/attributeController");
const { secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");

const router = express.Router();

// Public
router.get("/", getAttributes);
router.get("/:id", getAttributeById);

// Admin / Super Admin only
router.post("/", secureRole([ROLE.SUPER_ADMIN, ROLE.ADMIN]), createAttribute);
router.put("/:id", secureRole([ROLE.SUPER_ADMIN, ROLE.ADMIN]), updateAttribute);
router.delete(
  "/:id",
  secureRole([ROLE.SUPER_ADMIN, ROLE.ADMIN]),
  deleteAttribute
);

module.exports = router;
