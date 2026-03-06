const asyncHandler = require("express-async-handler");
const Category = require("../models/categoryModel");

// @desc    Get all categories
// @route   GET /api/categories
// @access  Private (or Public depending on your needs)
const getCategories = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 20, 500);
  const skip = (page - 1) * limit;

  const { search } = req.query;

  const filter = {};

  // Optional: search by name (case-insensitive)
  if (search) {
    filter.name = { $regex: search.trim(), $options: "i" };
  }

  const [categories, total] = await Promise.all([
    Category.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Category.countDocuments(filter),
  ]);

  res.status(200).json({
    data: categories,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// @desc    Create new category
// @route   POST /api/categories
// @access  Private (Admin only usually)
const createCategory = asyncHandler(async (req, res) => {
  const { name } = req.body;

  if (!name) {
    res.status(400);
    throw new Error("Category name is required");
  }

  const normalizedName = name.trim().toLowerCase();

  // check duplicate
  const exists = await Category.findOne({ name: normalizedName });
  if (exists) {
    res.status(400);
    throw new Error("Category already exists");
  }

  const category = await Category.create({ name: normalizedName });
  res.status(201).json(category);
});

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private (Admin only)
const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  const category = await Category.findById(id);
  if (!category) {
    res.status(404);
    throw new Error("Category not found");
  }

  const normalizedName = name.trim().toLowerCase();

  if (name) category.name = normalizedName;

  const updated = await category.save();
  res.status(200).json(updated);
});

// @desc    Delete category
// @route   DELETE /api/categories/:id
// @access  Private (Admin only)
const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const category = await Category.findById(id);
  if (!category) {
    res.status(404);
    throw new Error("Category not found");
  }

  await category.deleteOne();
  res.status(200).json({ message: "Category deleted" });
});

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
