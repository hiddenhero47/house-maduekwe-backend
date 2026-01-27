const mongoose = require("mongoose");
const Cart = require("../models/cartModel");
const { Address } = require("../models/addressModel");
const { ShopItem } = require("../models/shopItemModel");
const { PaymentProvider } = require("../models/paymentProviderModel");
const { ExportFee } = require("../models/exportFeeModel");
const asyncHandler = require("express-async-handler");
const { ORDER_STATUS, Order } = require("../models/orderModel");
const { PAYMENT_STATUS, Payment } = require("../models/paymentModel");
const {
  checkoutValidationSchema,
} = require("../validations/checkoutValidation");

// @desc Confirmation & agreement on orders
// @route POST /api/orders/confirm-checkout
// @access Private
const confirmCheckout = asyncHandler(async (req, res) => {
  await checkoutValidationSchema.validate(req.body, {
    abortEarly: false,
  });
  const summary = await buildCheckoutSummary(req);

  res.status(200).json({
    order: {
      items: summary.order.items,
      address: summary.address,
      totalAmount: summary.order.totalAmount,
      totalVat: summary.order.totalVat,
      shippingFee: summary.order.shippingFee,
      transactionFee: summary.order.transactionFee,
      currency: summary.order.currency,
      status: ORDER_STATUS.PENDING,
    },

    payment: {
      provider: summary.payment.provider,
      amountToPay: summary.payment.amountToPay,
      transactionFee: summary.payment.transactionFee,
      currency: summary.payment.currency,
      transaction: summary.payment.transaction,
      status: PAYMENT_STATUS.PENDING,
    },
  });
});

// @desc Checkout orders
// @route POST /api/orders/checkout
// @access Private
const checkout = asyncHandler(async (req, res) => {
  await checkoutValidationSchema.validate(req.body, {
    abortEarly: false,
  });
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const summary = await buildCheckoutSummary(req);

    const { user, address, order, payment } = summary;

    // 🧾 Create Order
    const createdOrder = await Order.create(
      [
        {
          user: user._id,
          items: order.items,
          address,
          totalAmount: order.totalAmount,
          totalVat: order.totalVat,
          shippingFee: order.shippingFee,
          transactionFee: order.transactionFee,
          status: ORDER_STATUS.PENDING,
          shippedBy: "Internal",
        },
      ],
      { session },
    );

    // 💳 Create Payment
    const createdPayment = await Payment.create(
      [
        {
          orderId: createdOrder[0]._id,
          user: user._id,
          provider: payment.provider,
          amountToPay: payment.amountToPay,
          transactionFee: payment.transactionFee,
          transaction: {
            currency: payment.currency,
            amount: payment.amountToPay,
            userEmail: user.email,
          },
          currency: payment.currency,
          status: PAYMENT_STATUS.PENDING,
        },
      ],
      { session },
    );

    // 🔗 Link payment → order
    createdOrder[0].paymentId = createdPayment[0]._id;
    await createdOrder[0].save({ session });

    // 🧹 Clear cart items
    await Cart.updateOne(
      { user: user._id },
      {
        $pull: {
          itemList: {
            _id: { $in: req.body.itemList },
          },
        },
      },
      { session },
    );

    await session.commitTransaction();

    // 🔁 Provider payload
    res.status(201).json({
      order: createdOrder[0],
      payment: createdPayment[0],

      transaction: {
        amount: payment.amountToPay,
        currency: payment.currency,
        userEmail: user.email,
        reference: createdPayment[0]._id,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error; // asyncHandler takes it from here
  } finally {
    session.endSession();
  }
});

// Checkout Functions
const getCheckoutData = async (req) => {
  const { itemList, selectedAddress, paymentMethod } = req.body;
  const user = req.user;

  let address = null;
  let items = null;
  let paymentProvider = null;

  if (!user) {
    throw new Error("User not authenticated");
  }

  if (!Array.isArray(itemList) || itemList.length === 0) {
    throw new Error("Item list is required");
  }

  // 🛒 Get cart + items
  const cart = await Cart.findOne({ user: user._id })
    .populate("itemList.shopItemId")
    .lean();

  if (!cart || !Array.isArray(cart.itemList)) {
    throw new Error("Cart not found");
  }

  items = cart.itemList.filter((item) =>
    itemList.includes(item._id.toString()),
  );

  if (!items.length) {
    throw new Error("Selected items not found in cart");
  }

  // 📍 Get address
  if (selectedAddress) {
    address = await Address.findOne({
      _id: selectedAddress,
      user: user._id,
    }).lean();

    if (!address) {
      throw new Error("Address not found");
    }
  }

  // 💳 Get payment provider
  if (paymentMethod) {
    paymentProvider = await PaymentProvider.findOne({
      _id: paymentMethod,
      isActive: true,
    }).lean();

    if (!paymentProvider) {
      throw new Error("Payment provider not available");
    }
  }

  const currency = items[0].shopItemId.currency;

  const hasMixedCurrency = items.some(
    (i) => i.shopItemId.currency !== currency,
  );

  if (hasMixedCurrency) {
    throw new Error("Mixed currencies are not allowed");
  }

  return {
    user,
    items,
    address,
    paymentProvider,
    currency: currency,
  };
};

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const checkoutItemsTotals = (items) => {
  let totalAmount = 0;
  let totalVat = 0;

  const breakdown = [];

  for (const item of items) {
    const shopItem = item.shopItemId;

    if (!shopItem) {
      throw new Error("Invalid shop item in cart");
    }

    const quantity = item.quantity;

    let unitPrice = shopItem.price;
    let attributeExtra = 0;

    // Handle selected attributes
    if (Array.isArray(item.selectedAttributes)) {
      for (const selectedAttrId of item.selectedAttributes) {
        const attr = shopItem.attributes?.find(
          (a) => a._id.toString() === selectedAttrId.toString(),
        );

        if (attr?.additionalAmount) {
          attributeExtra += attr.additionalAmount;
        }
      }
    }

    unitPrice = roundMoney(unitPrice + attributeExtra);

    const itemTotal = roundMoney(unitPrice * quantity);
    const itemVat = roundMoney((itemTotal * shopItem.vat) / 100);

    totalAmount += itemTotal;
    totalVat += itemVat;

    breakdown.push({
      shopItemId: shopItem._id,
      name: shopItem.name,
      unitPrice,
      quantity,
      attributeExtra,
      itemTotal,
      itemVat,
      currency: shopItem.currency,
    });
  }

  return {
    totalAmount: roundMoney(totalAmount),
    totalVat: roundMoney(totalVat),
    breakdown,
  };
};

const resolveShippingFee = async ({ country, state }) => {
  if (!country) {
    throw new Error("Shipping country is required");
  }

  const exportFee = await ExportFee.findOne({
    country: country.toLowerCase(),
    isActive: true,
  }).lean();

  if (!exportFee) {
    throw new Error("Shipping is not available for this country");
  }

  let shippingFee = exportFee.defaultAmount;

  if (state && Array.isArray(exportFee.states)) {
    const matchedState = exportFee.states.find(
      (s) => s.state.toLowerCase().trim() === state.toLowerCase().trim(),
    );

    if (matchedState) {
      shippingFee = matchedState.amount;
    }
  }

  return {
    shippingFee,
    shippingCountry: exportFee.country,
    shippingState: state || null,
  };
};

const calculateTransactionFee = (paymentProvider, amount) => {
  if (!paymentProvider) {
    throw new Error("Payment provider is required");
  }

  if (typeof amount !== "number" || amount < 0) {
    throw new Error("Invalid transaction amount");
  }

  const percentageFee = paymentProvider.percentageFee || 0;
  const flatFee = paymentProvider.flatFee || 0;

  // % fee
  const percentageAmount = roundMoney((amount * percentageFee) / 100);

  // total transaction fee
  const transactionFee = roundMoney(percentageAmount + flatFee);

  return {
    transactionFee,
    breakdown: {
      percentageFee,
      percentageAmount,
      flatFee,
      total: transactionFee,
    },
  };
};

const buildCheckoutSummary = async (req) => {
  const { user, items, address, paymentProvider, currency } =
    await getCheckoutData(req);

  // 🧾 Items totals
  const { totalAmount, totalVat } = checkoutItemsTotals(items);

  // 🚚 Shipping
  let shippingFee = 0;
  if (address) {
    const shipping = await resolveShippingFee({
      country: address.country,
      state: address.state,
    });
    shippingFee = shipping.shippingFee;
  }

  const subTotal = roundMoney(totalAmount + totalVat + shippingFee);

  // 💳 Transaction fee
  const transactionCalc = calculateTransactionFee(paymentProvider, subTotal);

  const amountToPay = roundMoney(subTotal + transactionCalc.transactionFee);

  // 📦 Order item snapshot (schema-compliant)
  const orderItems = items.map((item) => ({
    shopItem: {
      ...item.shopItemId,
    },
    quantity: item.quantity,
    selectedAttributes: item.selectedAttributes || [],
  }));

  return {
    user,
    address,
    paymentProvider,

    order: {
      items: orderItems,
      totalAmount,
      totalVat,
      shippingFee,
      transactionFee: transactionCalc.transactionFee,
      currency: currency,
    },

    payment: {
      amountToPay,
      transactionFee: transactionCalc.transactionFee,
      transaction: transactionCalc,
      currency: currency,
      provider: {
        _id: paymentProvider._id,
        name: paymentProvider.provider,
      },
    },
  };
};

module.exports = {
  confirmCheckout,
  checkout,
};
