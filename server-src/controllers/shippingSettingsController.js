const asyncHandler = require("express-async-handler");
const { getShippingSettings } = require("../helpers/shippingSettingsHelper");
const {
  shippingSettingsValidationSchema,
} = require("../validations/shippingSettingsValidation");

// @desc Get shipping settings (creates a safe default if none exists yet)
// @route GET /api/shipping-settings
// @access Private (Admin)
const getSettings = asyncHandler(async (req, res) => {
  const settings = await getShippingSettings();

  res.status(200).json(settings);
});

// @desc Update shipping settings
// @route PUT /api/shipping-settings
// @access Private (Admin)
const updateSettings = asyncHandler(async (req, res) => {
  await shippingSettingsValidationSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  const settings = await getShippingSettings();

  Object.assign(settings, req.body, {
    updatedBy: {
      id: req.user._id,
      email: req.user.email,
    },
  });

  await settings.save();

  res.status(200).json(settings);
});

module.exports = { getSettings, updateSettings };
