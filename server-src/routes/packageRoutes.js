const express = require("express");
const router = express.Router();
const {
  getPackages,
  getPackageById,
  createPackage,
  updatePackage,
  deletePackage,
} = require("../controllers/packageController");
const { secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");

const adminOnly = secureRole([ROLE.SUPER_ADMIN, ROLE.ADMIN]);

router.route("/").get(adminOnly, getPackages).post(adminOnly, createPackage);

router
  .route("/:id")
  .get(adminOnly, getPackageById)
  .put(adminOnly, updatePackage)
  .delete(adminOnly, deletePackage);

module.exports = router;
