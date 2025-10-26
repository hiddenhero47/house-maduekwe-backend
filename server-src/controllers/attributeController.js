const asyncHandler = require("express-async-handler");
const { Attribute, attributeType } = require("../models/attributeModel");

// @desc    Create new attribute
// @route   POST /api/attributes
// @access  Private (admin/super_admin)
const createAttribute = asyncHandler(async (req, res) => {
  const { name, value, type, display } = req.body;

  if (!name || !value || !type || !Object.values(attributeType).includes(type)) {
    res.status(400);
    throw new Error("Please provide both name and value for the attribute");
  }

  const attribute = await Attribute.create({ name, value, type, display });
  res.status(201).json(attribute);
});

// @desc    Get all attributes
// @route   GET /api/attributes
// @access  Public
const getAttributes = asyncHandler(async (req, res) => {
  const attributes = await Attribute.find().sort({ createdAt: -1 });
  res.json(attributes);
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
