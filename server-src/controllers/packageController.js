const asyncHandler = require("express-async-handler");
const { Package } = require("../models/packageModel");
const { packageValidationSchema } = require("../validations/packageValidation");

// @desc    Get all packages
// @route   GET /api/packages
// @access  Private (admin/super_admin) — packages are never customer-facing
const getPackages = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 20, 500);
  const skip = (page - 1) * limit;

  const filter = { isDeleted: false };

  const [packages, total] = await Promise.all([
    Package.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Package.countDocuments(filter),
  ]);

  res.status(200).json({
    data: packages,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// @desc    Get a single package
// @route   GET /api/packages/:id
// @access  Private (admin/super_admin)
const getPackageById = asyncHandler(async (req, res) => {
  const pkg = await Package.findOne({
    _id: req.params.id,
    isDeleted: false,
  }).lean();

  if (!pkg) {
    res.status(404);
    throw new Error("Package not found");
  }

  res.json({ success: true, data: pkg });
});

// @desc    Create a package
// @route   POST /api/packages
// @access  Private (admin/super_admin)
const createPackage = asyncHandler(async (req, res) => {
  await packageValidationSchema.validate(req.body, { abortEarly: false });

  const pkg = await Package.create(req.body);
  res.status(201).json(pkg);
});

// @desc    Update a package
// @route   PUT /api/packages/:id
// @access  Private (admin/super_admin)
const updatePackage = asyncHandler(async (req, res) => {
  const pkg = await Package.findOne({ _id: req.params.id, isDeleted: false });
  if (!pkg) {
    res.status(404);
    throw new Error("Package not found");
  }

  await packageValidationSchema.validate(req.body, { abortEarly: false });

  Object.assign(pkg, req.body);
  const updated = await pkg.save();
  res.status(200).json(updated);
});

// @desc    Delete a package (soft delete — ShopItems may still reference it)
// @route   DELETE /api/packages/:id
// @access  Private (admin/super_admin)
const deletePackage = asyncHandler(async (req, res) => {
  const pkg = await Package.findOne({ _id: req.params.id, isDeleted: false });
  if (!pkg) {
    res.status(404);
    throw new Error("Package not found");
  }

  pkg.isDeleted = true;
  pkg.deletedAt = new Date();
  await pkg.save();

  res.status(200).json({ message: "Package deleted", id: pkg._id });
});

module.exports = {
  getPackages,
  getPackageById,
  createPackage,
  updatePackage,
  deletePackage,
};
