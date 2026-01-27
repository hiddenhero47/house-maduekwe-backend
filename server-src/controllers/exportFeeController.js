const asyncHandler = require("express-async-handler");
const { ExportFee } = require("../models/exportFeeModel");
const {
  exportFeeValidationSchema,
} = require("../validations/exportFeeValidation");

// @desc Create export fee
// @route POST /api/export-fees
// @access Private (SUPER_ADMIN)
const createExportFee = asyncHandler(async (req, res) => {
  await exportFeeValidationSchema.validate(req.body, {
    abortEarly: false,
  });

  const exportFee = await ExportFee.create(req.body);

  res.status(201).json(exportFee);
});

// @desc Get export fees (active / inactive / all)
// @route GET /api/export-fees?active=true|false
// @access Private (SUPER_ADMIN)
const getExportFees = asyncHandler(async (req, res) => {
  const { active } = req.query;

  const filter = {};
  if (active === "true") filter.isActive = true;
  if (active === "false") filter.isActive = false;

  const exportFees = await ExportFee.find(filter).sort({ country: 1 });

  res.json(exportFees);
});

// @desc Update export fee
// @route PUT /api/export-fees/:id
// @access Private (SUPER_ADMIN)
const updateExportFee = asyncHandler(async (req, res) => {
  // ✅ Validate request body with Yup (partial allowed)
  await exportFeeValidationSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  const exportFee = await ExportFee.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  if (!exportFee) {
    res.status(404);
    throw new Error("Export fee not found");
  }

  res.json(exportFee);
});


// @desc Soft delete (disable)
// @route PATCH /api/export-fees/:id/disable
// @access Private (SUPER_ADMIN)
const disableExportFee = asyncHandler(async (req, res) => {
  const exportFee = await ExportFee.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true },
  );

  if (!exportFee) {
    res.status(404);
    throw new Error("Export fee not found");
  }

  res.json({
    message: "Export fee disabled",
  });
});

// @desc Permanent delete (2FA)
// @route DELETE /api/export-fees/:id/permanent
// @access Private (SUPER_ADMIN + 2FA)
const deleteExportFeePermanently = asyncHandler(async (req, res) => {
  const exportFee = await ExportFee.findByIdAndDelete(req.params.id);

  if (!exportFee) {
    res.status(404);
    throw new Error("Export fee not found");
  }

  res.json({
    message: "Export fee permanently deleted",
  });
});

module.exports = {
  createExportFee,
  getExportFees,
  updateExportFee,
  disableExportFee,
  deleteExportFeePermanently,
};
