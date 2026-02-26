const asyncHandler = require("express-async-handler");
const { Attribute, attributeType } = require("../models/attributeModel");

// @desc    Create new attribute
// @route   POST /api/attributes
// @access  Private (admin/super_admin)
const createAttribute = asyncHandler(async (req, res) => {
  const { name, value, type, display } = req.body;

  if (
    !name ||
    !value ||
    !type ||
    !Object.values(attributeType).includes(type)
  ) {
    res.status(400);
    throw new Error("Please provide both name and value for the attribute");
  }

  const attribute = await Attribute.create({ name, value, type, display });
  res.status(201).json(attribute);
});

// @desc    Get all attributes
// @route   GET /api/attributes
// @access  Public
// @desc    Get all attributes (paginated)
// @route   GET /api/attributes
// @access  Public
const getAttributes = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 20, 500);
  const skip = (page - 1) * limit;

  const { type, search } = req.query;

  const filter = {};

  // Optional: filter by attribute type
  if (type && Object.values(attributeType).includes(type)) {
    filter.type = type;
  }

  // Optional: search by name (case-insensitive)
  if (search) {
    filter.name = { $regex: search, $options: "i" };
  }

  const [attributes, total] = await Promise.all([
    Attribute.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Attribute.countDocuments(filter),
  ]);

  res.status(200).json({
    data: attributes,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// @desc    Get single attribute
// @route   GET /api/attributes/:id
// @access  Public
const getAttributeById = asyncHandler(async (req, res) => {
  const attribute = await Attribute.findById(req.params.id);
  if (!attribute) {
    res.status(404);
    throw new Error("Attribute not found");
  }
  res.json(attribute);
});

// @desc    Update attribute
// @route   PUT /api/attributes/:id
// @access  Private (admin/super_admin)
const updateAttribute = asyncHandler(async (req, res) => {
  const attribute = await Attribute.findById(req.params.id);

  if (!attribute) {
    res.status(404);
    throw new Error("Attribute not found");
  }

  attribute.name = req.body.name || attribute.name;
  attribute.value = req.body.value || attribute.value;
  attribute.type = req.body.type || attribute.type;
  attribute.display = req.body.display || attribute.display;

  const updated = await attribute.save();
  res.json(updated);
});

// @desc    Delete attribute
// @route   DELETE /api/attributes/:id
// @access  Private (admin/super_admin)
const deleteAttribute = asyncHandler(async (req, res) => {
  const attribute = await Attribute.findById(req.params.id);

  if (!attribute) {
    res.status(404);
    throw new Error("Attribute not found");
  }

  await Attribute.deleteOne({ _id: req.params.id });
  res.json({ id: req.params.id });
});

module.exports = {
  createAttribute,
  getAttributes,
  getAttributeById,
  updateAttribute,
  deleteAttribute,
};
