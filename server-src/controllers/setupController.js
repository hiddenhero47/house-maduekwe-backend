const { ensureAdminExists } = require("../helpers/ensureAdmin");
const {
  ensureStripePaymentProvider,
  ensureUSExportFee,
  ensureShippingSettings,
} = require("../helpers/appSetup");
const Cart = require("../models/cartModel");
const asyncHandler = require("express-async-handler");
const { User } = require("../models/userModel");
const crypto = require("crypto");
const { Payment, PAYMENT_STATUS } = require("../models/paymentModel");
const { Order, ORDER_STATUS } = require("../models/orderModel");
const { Address } = require("../models/addressModel");
const { ShopItem } = require("../models/shopItemModel");
const { ExportFee } = require("../models/exportFeeModel");

// @desc    Start up app
// @route   POST /api/setup/get-started
// @access  Private (protect this route!)
const runSetupScripts = async (req, res) => {
  const logs = [];

  // Add setup tasks here
  logs.push(await ensureAdminExists());
  logs.push(await ensureStripePaymentProvider());
  logs.push(await ensureUSExportFee());
  logs.push(await ensureShippingSettings());
  // later: logs.push(await anotherSetupTask());

  res.json({
    success: true,
    timestamp: new Date(),
    results: logs,
  });
};

// @desc    Clear carts
// @route   DELETE /api/setup/clear-cart
// @access  Private/Admin
const clearCart = asyncHandler(async (req, res) => {
  const { userIds } = req.body;

  // If userIds are passed → clear only those users
  if (Array.isArray(userIds) && userIds.length > 0) {
    await Cart.updateMany(
      { user: { $in: userIds } },
      { $set: { itemList: [] } },
    );

    return res.json({
      message: "Selected users carts cleared",
    });
  }

  // If no userIds passed → clear all carts
  await Cart.updateMany({}, { $set: { itemList: [] } });

  res.json({
    message: "All carts cleared",
  });
});

const normalizeAddresses = asyncHandler(async (req, res) => {
  const result = await Address.updateMany(
    {
      stateLine: { $exists: true },
    },
    [
      {
        $set: {
          addressLine2: "$stateLine",
        },
      },
      {
        $unset: "stateLine",
      },
    ],
  );

  res.json({
    success: true,
    message: "Addresses migrated successfully",
    updated: result.modifiedCount,
  });
});

// @desc    Backfill old data for the productTax/weight/defaultVat schema changes
// @route   POST /api/setup/migrate-tax-vat-fields
// @access  Private/Admin (time-window guarded, see setupRoutes)
// Rough placeholder — the catalog is predominantly shirts, so this is an
// average shirt weight, NOT a measured value. Per-product accuracy (e.g.
// using the heaviest size variant) is a follow-up, not done here.
const DEFAULT_PLACEHOLDER_WEIGHT = { value: 0.2, unit: "kg" };

const migrateTaxAndVatFields = asyncHandler(async (req, res) => {
  // 1️⃣ ExportFee.defaultVat is now required — backfill any country created before
  //    it existed. Defaults to 0; this is a placeholder, NOT a real VAT rate.
  const exportFeeResult = await ExportFee.updateMany(
    { defaultVat: { $exists: false } },
    { $set: { defaultVat: 0 } },
  );

  // 2️⃣ ShopItem.productTax replaces the old universal "vat" field. Backfill it to 0
  //    (most products won't have a special tax), then drop the orphaned "vat" field
  //    so it doesn't linger under a misleading name. Old vat values are intentionally
  //    NOT copied into productTax — that field used to mean general VAT, not a
  //    per-product special tax, so carrying the value over would misrepresent intent.
  const shopItemTaxResult = await ShopItem.updateMany(
    { productTax: { $exists: false } },
    { $set: { productTax: 0 } },
  );

  const shopItemVatCleanupResult = await ShopItem.updateMany(
    { vat: { $exists: true } },
    { $unset: { vat: "" } },
  );

  // 3️⃣ Order.totalProductTax is new — backfill orders placed before it existed.
  //    Mongoose's schema default only applies when a document is hydrated/saved
  //    through Mongoose; raw aggregation reads (e.g. the stats API) need the field
  //    to actually exist in the stored document.
  const orderResult = await Order.updateMany(
    { totalProductTax: { $exists: false } },
    { $set: { totalProductTax: 0 } },
  );

  // 4️⃣ ShopItem.weight is needed for real shipping-provider quotes/labels.
  //    Backfill any product missing it (fully or partially) with a rough
  //    average-shirt placeholder — see DEFAULT_PLACEHOLDER_WEIGHT above.
  const shopItemWeightResult = await ShopItem.updateMany(
    {
      $or: [
        { weight: { $exists: false } },
        { "weight.value": { $exists: false } },
      ],
    },
    { $set: { weight: DEFAULT_PLACEHOLDER_WEIGHT } },
  );

  res.json({
    success: true,
    message:
      "Migration complete. ⚠️ ExportFee.defaultVat was backfilled to 0 as a placeholder — review and set the real VAT rate per country before relying on it. ⚠️ ShopItem.weight was backfilled with a rough average-shirt placeholder (0.2kg) — review per product before relying on it for real shipping quotes.",
    results: {
      exportFeesDefaultVatBackfilled: exportFeeResult.modifiedCount,
      shopItemsProductTaxBackfilled: shopItemTaxResult.modifiedCount,
      shopItemsOldVatFieldRemoved: shopItemVatCleanupResult.modifiedCount,
      ordersTotalProductTaxBackfilled: orderResult.modifiedCount,
      shopItemsWeightBackfilled: shopItemWeightResult.modifiedCount,
    },
  });
});

// @desc    Clear orders and payments
// @route   DELETE /api/setup/clear-orders-payments
// @access  Private/Admin
const clearOrdersAndPayments = asyncHandler(async (req, res) => {
  const { orderIds, paymentIds } = req.body;

  // Clear specific records
  if (
    (Array.isArray(orderIds) && orderIds.length > 0) ||
    (Array.isArray(paymentIds) && paymentIds.length > 0)
  ) {
    if (Array.isArray(orderIds) && orderIds.length > 0) {
      await Order.deleteMany({
        _id: { $in: orderIds },
      });
    }

    if (Array.isArray(paymentIds) && paymentIds.length > 0) {
      await Payment.deleteMany({
        _id: { $in: paymentIds },
      });
    }

    return res.json({
      message: "Selected orders and payments cleared",
    });
  }

  // No ids passed -> clear everything
  await Promise.all([Order.deleteMany({}), Payment.deleteMany({})]);

  res.json({
    message: "All orders and payments cleared",
  });
});

module.exports = {
  runSetupScripts,
  clearCart,
  clearOrdersAndPayments,
  normalizeAddresses,
  migrateTaxAndVatFields,
};
