const express = require("express");
const router = express.Router();
const {
  getItemGroups,
  createItemGroup,
  updateItemGroup,
  deleteItemGroup,
} = require("../controllers/itemGroupController");
const { secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");

router.get("/", getItemGroups);
router.post("/", secureRole(ROLE.SUPER_ADMIN, ROLE.ADMIN), createItemGroup);
router.put("/:id", secureRole(ROLE.SUPER_ADMIN, ROLE.ADMIN), updateItemGroup);
router.delete("/:id", secureRole(ROLE.SUPER_ADMIN, ROLE.ADMIN), deleteItemGroup);

module.exports = router;
