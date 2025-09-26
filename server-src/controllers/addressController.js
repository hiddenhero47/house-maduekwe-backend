const asyncHandler = require("express-async-handler");
const Address = require("../models/addressModel");
const { User } = require("../models/userModel");
const addressValidationSchema = require("../validations/addressValidation");

// @desc    Get all addresses for logged in user
// @route   GET /api/addresses
// @access  Private
const getAddresses = asyncHandler(async (req, res) => {
  const addresses = await Address.find({ user: req.user.id });
  res.status(200).json(addresses);
});

// @desc    Create new address
// @route   POST /api/addresses
// @access  Private
const createAddress = asyncHandler(async (req, res) => {
  await addressValidationSchema.validate(req.body, { abortEarly: false });
  const { city, state, country, description, fullAddress } = req.body;

  // Check if user already has max addresses
  const count = await Address.countDocuments({ user: req.user.id });
  if (count >= MAX_ADDRESSES) {
    res.status(400);
    throw new Error(
      `You can only have a maximum of ${MAX_ADDRESSES} addresses`
    );
  }

  const address = await Address.create({
    user: req.user.id,
    city,
    state,
    country,
    description,
    fullAddress,
  });

  res.status(201).json(address);
});

// @desc    Update an address
// @route   PUT /api/addresses/:id
// @access  Private
const updateAddress = asyncHandler(async (req, res) => {
  const address = await Address.findById(req.params.id);

  if (!address) {
    res.status(404);
    throw new Error("Address not found");
  }

  if (address.user.toString() !== req.user.id) {
    res.status(401);
    throw new Error("User not authorized");
  }

  await addressValidationSchema.validate(req.body, { abortEarly: false });

  const updatedAddress = await Address.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );

  res.status(200).json(updatedAddress);
});

// @desc    Delete an address
// @route   DELETE /api/addresses/:id
// @access  Private
const deleteAddress = asyncHandler(async (req, res) => {
  const address = await Address.findById(req.params.id);

  if (!address) {
    res.status(404);
    throw new Error("Address not found");
  }

  if (address.user.toString() !== req.user.id) {
    res.status(401);
    throw new Error("User not authorized");
  }

  await Address.deleteOne({ _id: req.params.id });

  res.status(200).json({ id: req.params.id });
});

module.exports = {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
};
