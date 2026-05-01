const mongoose = require("mongoose");
const Cart = require("../models/cartModel");
const { ShopItem, STATUS } = require("../models/shopItemModel");
const { Address } = require("../models/addressModel");
const { ExportFee } = require("../models/exportFeeModel");
const asyncHandler = require("express-async-handler");
const { ORDER_STATUS, Order } = require("../models/orderModel");
const { PAYMENT_STATUS, Payment } = require("../models/paymentModel");
const checkoutValidationSchema = require("../validations/checkoutValidation");

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
      currency: summary.order.currency,
      status: ORDER_STATUS.PENDING,
    },

    payment: {
      user: summary.user._id,
      userEmail: summary.user.email,
      amountToPay: summary.payment.amountToPay,
      currency: summary.payment.currency,
      status: PAYMENT_STATUS.PENDING,
    },

    stock: summary.stock,
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

    // 🚨 FINAL STOCK ENFORCEMENT (inside transaction)
    const stockIssues = summary.stock
      .map((s, index) => ({ ...s, index }))
      .filter((s) => !s.isAvailable);

    if (stockIssues.length > 0) {
      const error = new Error("Stock validation failed");
      error.type = "STOCK_ERROR";
      error.details = stockIssues;
      throw error;
    }

    const { user, address, order, payment } = summary;

    for (const item of summary.order.items) {
      const groupedResult = validateGroupedVariants(item);

      const primaryId = groupedResult?.primaryId;
      const optionId = groupedResult?.optionId;

      // -----------------------------
      // 1️⃣ MAIN PRODUCT STOCK
      // -----------------------------
      const result = await ShopItem.updateOne(
        {
          _id: item.shopItem._id,
          quantity: { $gte: item.quantity },
        },
        {
          $inc: { quantity: -item.quantity },
        },
        { session },
      );

      if (result.modifiedCount === 0) {
        throw new Error(
          `Stock mismatch during checkout for ${item.shopItem.name}. Please refresh and try again.`,
        );
      }

      // -----------------------------
      // 2️⃣ ATTRIBUTE STOCK (NON-GROUPED ONLY)
      // -----------------------------
      if (!primaryId && Array.isArray(item.selectedAttributes)) {
        const attrIds = item.selectedAttributes
          .map((a) =>
            typeof a.Attribute === "object" ? a.Attribute._id : a.Attribute,
          )
          .filter(Boolean);

        const attrResult = await ShopItem.updateOne(
          {
            _id: item.shopItem._id,
            // 🔥 ensure at least ONE attribute matches BEFORE update
            "attributes.Attribute": { $in: attrIds },
          },
          {
            $inc: {
              "attributes.$[attr].quantity": -item.quantity,
            },
          },
          {
            arrayFilters: [
              {
                "attr.Attribute": { $in: attrIds },
                "attr.quantity": { $gte: item.quantity },
              },
            ],
            session,
          },
        );

        if (attrResult.modifiedCount === 0) {
          throw new Error(
            `Stock mismatch during checkout for ${item.shopItem.name}. Please refresh and try again.`,
          );
        }
      }

      // -----------------------------
      // 3️⃣ GROUPED VARIANTS STOCK (MAIN LOGIC)
      // -----------------------------
      if (primaryId && optionId) {
        const gvResult = await ShopItem.updateOne(
          { _id: item.shopItem._id },
          {
            $inc: {
              "groupedVariants.$[group].options.$[opt].quantity":
                -item.quantity,
            },
          },
          {
            arrayFilters: [
              {
                "group.primaryAttribute": primaryId,
              },
              {
                "opt.attribute": optionId,
                "opt.quantity": { $gte: item.quantity },
              },
            ],
            session,
          },
        );

        if (gvResult.modifiedCount === 0) {
          throw new Error(
            `Stock mismatch during checkout for ${item.shopItem.name}. Please refresh and try again.`,
          );
        }
      }
    }

    // 🧾 Create Order
    const createdOrder = await Order.create(
      [
        {
          user: user._id,
          userEmail: user.email,
          items: order.items,
          address,
          totalAmount: order.totalAmount,
          totalVat: order.totalVat,
          shippingFee: order.shippingFee,
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
          userEmail: user.email,
          amountToPay: payment.amountToPay,
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
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error; // asyncHandler takes it from here
  } finally {
    session.endSession();
  }
});

const getAttrKey = (a) => {
  if (!a?.Attribute) return null;

  return typeof a.Attribute === "object"
    ? a.Attribute._id?.toString()
    : a.Attribute?.toString();
};

// Checkout Functions
const getCheckoutData = async (req) => {
  const { itemList, selectedAddress } = req.body;
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
    .populate({
      path: "itemList.shopItem",
      populate: [
        { path: "category", select: "name" },
        {
          path: "attributes.Attribute",
          select: "name value type display",
        },
      ],
    })
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

  const currency = items[0].shopItem.currency;

  const hasMixedCurrency = items.some((i) => i.shopItem.currency !== currency);

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

const getAvailable = (map, key, fallback) => {
  if (!map.has(key)) {
    map.set(key, fallback);
  }
  return map.get(key);
};

const validateGroupedVariants = (item) => {
  const shopItem = item.shopItem;

  if (!shopItem?.groupedVariants?.length) return null;
  if (!Array.isArray(item.selectedAttributes)) return null;

  const selectedIds = item.selectedAttributes.map(getAttrKey).filter(Boolean);

  const primarySet = new Set(
    shopItem.groupedVariants.map((g) => g.primaryAttribute?.toString()),
  );

  const primary = selectedIds.find((id) => primarySet.has(id));
  if (!primary) return null;

  const group = shopItem.groupedVariants.find(
    (g) => g.primaryAttribute?.toString() === primary,
  );

  if (!group) return null;

  const option = group.options.find((opt) =>
    selectedIds.includes(opt.attribute?.toString()),
  );

  if (!option) {
    return {
      isAvailable: false,
      message: "Incomplete variant selection",
    };
  }

  return {
    isAvailable: item.quantity <= option.quantity,
    availableQty: option.quantity,
    requestedQty: item.quantity,
    primaryId: group.primaryAttribute.toString(),
    optionId: option.attribute.toString(),
    message:
      item.quantity <= option.quantity
        ? null
        : `Only ${option.quantity} available for selected variant`,
  };
};

const validateStockStateful = (items) => {
  const memory = {
    product: new Map(),
    attributes: new Map(),
    variants: new Map(),
  };

  const results = [];

  for (const item of items) {
    const shopItem = item.shopItem;
    const id = shopItem?._id?.toString();

    if (!id) {
      results.push({
        isAvailable: false,
        message: "Invalid shop item",
        productId: shopItem._id,
      });
      continue;
    }

    // STATUS CHECK
    if (shopItem.status !== STATUS.AVAILABLE) {
      results.push({
        isAvailable: false,
        message: `${shopItem.name} is not available`,
        productId: shopItem._id,
      });
      continue;
    }

    let availableQty = memory.product.get(id) ?? shopItem.quantity;

    // -----------------------------
    // GROUPED VARIANTS FIRST
    // -----------------------------
    const grouped = validateGroupedVariants(item);

    if (grouped && grouped.isAvailable === false) {
      results.push({
        isAvailable: false,
        message: grouped.message,
        productId: shopItem._id,
      });
      continue;
    }

    let variantKey = null;

    if (
      grouped?.primaryId &&
      grouped?.optionId &&
      grouped?.availableQty != null
    ) {
      variantKey = `${id}:${grouped.primaryId}:${grouped.optionId}`;

      const current = memory.variants.get(variantKey) ?? grouped.availableQty;

      availableQty = Math.min(availableQty, current);
    }

    // -----------------------------
    // ATTRIBUTE STOCK (ONLY IF NO VARIANT)
    // -----------------------------
    if (!grouped?.primaryId && Array.isArray(item.selectedAttributes)) {
      for (const attr of item.selectedAttributes) {
        const key = getAttrKey(attr);
        if (!key) continue;

        const shopAttr = shopItem.attributes?.find(
          (a) => getAttrKey(a) === key,
        );

        if (shopAttr?.quantity != null) {
          const current = memory.attributes.get(key) ?? shopAttr.quantity;

          availableQty = Math.min(availableQty, current);
        }
      }
    }

    // -----------------------------
    // FINAL CHECK
    // -----------------------------
    if (item.quantity > availableQty) {
      results.push({
        isAvailable: false,
        message: `Only ${availableQty} left for ${shopItem.name}`,
        productId: shopItem._id,
      });
      continue;
    }

    // -----------------------------
    // COMMIT MEMORY (ONLY AFTER PASS)
    // -----------------------------
    memory.product.set(id, availableQty - item.quantity);

    if (variantKey) {
      const current = memory.variants.get(variantKey) ?? grouped.availableQty;

      memory.variants.set(variantKey, current - item.quantity);
    }

    if (!grouped?.primaryId && Array.isArray(item.selectedAttributes)) {
      for (const attr of item.selectedAttributes) {
        const key = getAttrKey(attr);
        if (!key) continue;

        const shopAttr = shopItem.attributes?.find(
          (a) => getAttrKey(a) === key,
        );

        if (shopAttr?.quantity != null) {
          const current = memory.attributes.get(key) ?? shopAttr.quantity;

          memory.attributes.set(key, current - item.quantity);
        }
      }
    }

    results.push({
      isAvailable: true,
      message: null,
      productId: shopItem._id,
    });
  }

  return results;
};

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const checkoutItemsTotals = (items) => {
  let totalAmount = 0;
  let totalVat = 0;

  const breakdown = [];

  for (const item of items) {
    const shopItem = item.shopItem;

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
      shopItem: shopItem._id,
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

const buildCheckoutSummary = async (req) => {
  const { user, items, address, currency } = await getCheckoutData(req);

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

  const amountToPay = roundMoney(totalAmount + totalVat + shippingFee);

  const stock = validateStockStateful(items);
  // 📦 Order item snapshot (schema-compliant)
  const orderItems = items.map((item) => ({
    shopItem: {
      ...item.shopItem,
    },
    quantity: item.quantity,
    selectedAttributes: item.selectedAttributes || [],
  }));

  return {
    user,
    address,
    stock,

    order: {
      items: orderItems,
      totalAmount,
      totalVat,
      shippingFee,
      currency,
    },

    payment: {
      amountToPay,
      currency: currency,
    },
  };
};

module.exports = {
  confirmCheckout,
  checkout,
  validateGroupedVariants,
  validateStockStateful,
};
