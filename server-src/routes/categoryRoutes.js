const express = require("express");
const router = express.Router();
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/categoryController");
const { protect, secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");

// List all & Create
router
  .route("/")
  .get(protect, getCategories)
  .post(secureRole([ROLE.SUPER_ADMIN, ROLE.ADMIN]), createCategory);

// Update & Delete by id
router
  .route("/:id")
  .put(secureRole([ROLE.SUPER_ADMIN, ROLE.ADMIN]), updateCategory)
  .delete(secureRole([ROLE.SUPER_ADMIN, ROLE.ADMIN]), deleteCategory);

module.exports = router;
