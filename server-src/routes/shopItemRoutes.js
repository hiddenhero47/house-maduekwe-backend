const express = require("express");
const {
  getShopItems,
  createShopItem,
  updateShopItem,
  deleteShopItem,
} = require("../controllers/shopItemController");
const { secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");

const router = express.Router();

router.get("/", getShopItems);
router.post("/", secureRole([ROLE.SUPER_ADMIN, ROLE.ADMIN]), createShopItem);
router.put("/:id", secureRole([ROLE.SUPER_ADMIN, ROLE.ADMIN]), updateShopItem);
router.delete(
  "/:id",
  secureRole([ROLE.SUPER_ADMIN, ROLE.ADMIN]),
  deleteShopItem
);

module.exports = router;
