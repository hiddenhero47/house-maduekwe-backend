const express = require("express");
const router = express.Router();
const {
  getShopItems,
  createShopItem,
  updateShopItem,
  deleteShopItem,
  getShopItemById,
  getRelatedShopItems,
  addShopItemImages,
  removeShopItemImage,
  reorderShopItemImages,
  tagShopItemImage,
} = require("../controllers/shopItemController");
const { secureRole } = require("../middleware/authMiddleware");
const { ROLE } = require("../models/userModel");

const ADMIN_ROLES = [ROLE.SUPER_ADMIN, ROLE.ADMIN];

router.get("/", getShopItems);
router.post("/", secureRole(ADMIN_ROLES), createShopItem);
router.put("/:id", secureRole(ADMIN_ROLES), updateShopItem);
router.delete("/:id", secureRole(ADMIN_ROLES), deleteShopItem);

router.post("/:id/images", secureRole(ADMIN_ROLES), addShopItemImages);
router.delete(
  "/:id/images/:imageId",
  secureRole(ADMIN_ROLES),
  removeShopItemImage,
);
router.patch(
  "/:id/images/reorder",
  secureRole(ADMIN_ROLES),
  reorderShopItemImages,
);
router.patch(
  "/:id/images/:imageId/tags",
  secureRole(ADMIN_ROLES),
  tagShopItemImage,
);

router.get("/:id", getShopItemById);
router.get("/:id/related", getRelatedShopItems);

module.exports = router;
