const express = require("express");
const router = express.Router();
const {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
} = require("../controllers/addressController");
const { protect } = require("../middleware/authMiddleware");

router.route("/").get(protect, getAddresses).post(protect, createAddress);

router.route("/:id").put(protect, updateAddress).delete(protect, deleteAddress);

module.exports = router;
