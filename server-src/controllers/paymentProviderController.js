const asyncHandler = require("express-async-handler");
const { PaymentProvider } = require("../models/paymentProviderModel");
const {
  paymentProviderValidationSchema,
} = require("../validations/paymentProviderValidation");

// @desc Create payment provider
// @route POST /api/payment-providers
// @access Private (SUPER_ADMIN)
const createPaymentProvider = asyncHandler(async (req, res) => {
  await paymentProviderValidationSchema.validate(req.body, {
    abortEarly: false,
  });

  const exists = await PaymentProvider.findOne({
    provider: req.body.provider,
  });

  if (exists) {
    res.status(400);
    throw new Error("Payment provider already exists");
  }

  const provider = await PaymentProvider.create(req.body);

  res.status(201).json(provider);
});

// @desc Get payment providers
// @route GET /api/payment-providers?active=true|false
// @access Private (SUPER_ADMIN)
const getPaymentProviders = asyncHandler(async (req, res) => {
  const { active } = req.query;

  const filter = {};
  if (active === "true") filter.isActive = true;
  if (active === "false") filter.isActive = false;

  const providers = await PaymentProvider.find(filter).sort({
    provider: 1,
  });

  res.json(providers);
});

// @desc Update payment provider
// @route PUT /api/payment-providers/:id
// @access Private (SUPER_ADMIN)
const updatePaymentProvider = asyncHandler(async (req, res) => {
  await paymentProviderValidationSchema.validate(req.body, {
    abortEarly: false,
  });

  const provider = await PaymentProvider.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
      runValidators: true,
    },
  );

  if (!provider) {
    res.status(404);
    throw new Error("Payment provider not found");
  }

  res.json(provider);
});

// @desc Soft delete (disable)
// @route PATCH /api/payment-providers/:id/disable
// @access Private (SUPER_ADMIN)
const disablePaymentProvider = asyncHandler(async (req, res) => {
  const provider = await PaymentProvider.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true },
  );

  if (!provider) {
    res.status(404);
    throw new Error("Payment provider not found");
  }

  res.json({
    message: "Payment provider disabled",
  });
});

// @desc Permanent delete (2FA)
// @route DELETE /api/payment-providers/:id/permanent
// @access Private (SUPER_ADMIN + 2FA)
const deletePaymentProviderPermanent = asyncHandler(async (req, res) => {
  const provider = await PaymentProvider.findByIdAndDelete(req.params.id);

  if (!provider) {
    res.status(404);
    throw new Error("Payment provider not found");
  }

  res.json({
    message: "Payment provider permanently deleted",
  });
});

// @desc Get active payment providers (client)
// @route GET /api/payment-providers/client
// @access Public
const getClientPaymentProviders = asyncHandler(async (req, res) => {
  const providers = await PaymentProvider.find(
    { isActive: true },
    { _id: 1, provider: 1 }
  ).lean();

  res.json(providers);
});

module.exports = {
  createPaymentProvider,
  getPaymentProviders,
  updatePaymentProvider,
  disablePaymentProvider,
  deletePaymentProviderPermanent,
  getClientPaymentProviders,
};
