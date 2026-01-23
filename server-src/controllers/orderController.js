const mongoose = require("mongoose");
const Cart = require("../models/cartModel"); // adjust path
const { Address } = require("../models/addressModel");
const { ShopItem } = require("../models/shopItemModel"); // assuming you have this
const { PaymentProvider } = require("../models/paymentProviderModel");
const { ExportFee } = require("../models/exportFeeModel");

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

  return {
    user,
    items,
    address,
    paymentProvider,
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
      (s) =>
        s.state.toLowerCase().trim() ===
        state.toLowerCase().trim()
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
