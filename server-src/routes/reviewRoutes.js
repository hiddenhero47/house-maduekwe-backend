const express = require("express");
const router = express.Router();

const {
  reviewProduct,
  getProductReviews,
  deleteReview,
} = require("../controllers/reviewController");

const { protect } = require("../middleware/authMiddleware");

router.post("/:productId", protect, reviewProduct);
router.get("/:productId", getProductReviews);
router.delete("/:id", protect, deleteReview);

module.exports = router;
