const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const ProductReview = require("../models/reviewModel");
const ShopItem = require("../models/shopItemModel");

// @desc   Create or Update Product Review
// @route  POST /api/reviews/:productId
// @access Private
const reviewProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { rating, comment } = req.body;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    res.status(400);
    throw new Error("Invalid product ID");
  }

  if (!rating || rating < 1 || rating > 5) {
    res.status(400);
    throw new Error("Rating must be between 1 and 5");
  }

  const productExists = await ShopItem.exists({
    _id: productId,
    isDeleted: false,
  });

  if (!productExists) {
    res.status(404);
    throw new Error("Product not found");
  }

  const review = await ProductReview.findOneAndUpdate(
    {
      product: productId,
      "user.id": req.user._id,
    },
    {
      product: productId,
      user: {
        id: req.user._id,
        email: req.user.email,
      },
      rating,
      comment,
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  ).lean();

  res.status(201).json({
    success: true,
    review,
  });
});

// @desc   Get Product Reviews
// @route  GET /api/reviews/:productId
// @access Public
const getProductReviews = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const limit = Number(req.query.limit) || 10;
  const page = Number(req.query.page) || 1;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    res.status(400);
    throw new Error("Invalid product ID");
  }

  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    ProductReview.find({
      product: productId,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    ProductReview.countDocuments({
      product: productId,
    }),
  ]);

  res.json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    reviews,
  });
});

const { ROLE } = require("../models/userModel");

// @desc   Delete Review
// @route  DELETE /api/reviews/:id
// @access Private
const deleteReview = asyncHandler(async (req, res) => {
  const review = await ProductReview.findById(req.params.id);

  if (!review) {
    res.status(404);
    throw new Error("Review not found");
  }

  const isOwner = review.user.id.toString() === req.user._id.toString();

  const isAdmin =
    req.user.role === ROLE.ADMIN || req.user.role === ROLE.SUPER_ADMIN;

  if (!isOwner && !isAdmin) {
    res.status(403);
    throw new Error("Not authorized");
  }

  await review.deleteOne();

  res.json({
    success: true,
    message: "Review deleted successfully",
  });
});

module.exports = {
  reviewProduct,
  getProductReviews,
  deleteReview,
};
