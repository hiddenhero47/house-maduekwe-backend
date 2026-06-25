const { ShopItem } = require("../models/shopItemModel");
const { ORDER_STATUS, Order } = require("../models/orderModel");
const mongoose = require("mongoose");
const { randomUUID } = require("crypto");

const reverseStockFromRollback = async ({ rollbackInfo, session }) => {
  if (!rollbackInfo || rollbackInfo.length === 0) return;

  for (const entry of rollbackInfo) {
    const { quantity, shopItem, attributes, groupedVariant } = entry;
    // -----------------------------
    // 1️⃣ RESTORE MAIN STOCK
    // -----------------------------
    await ShopItem.updateOne(
      { _id: shopItem },
      { $inc: { quantity } },
      { session },
    );

    // -----------------------------
    // 2️⃣ RESTORE ATTRIBUTES
    // -----------------------------
    if (Array.isArray(attributes) && attributes.length > 0) {
      await ShopItem.updateOne(
        { _id: shopItem },
        {
          $inc: {
            "attributes.$[attr].quantity": quantity,
          },
        },
        {
          arrayFilters: [
            {
              "attr.Attribute": { $in: attributes },
            },
          ],
          session,
        },
      );
    }

    // -----------------------------
    // 3️⃣ RESTORE GROUPED VARIANT
    // -----------------------------
    if (groupedVariant?.primaryId && groupedVariant?.optionId) {
      await ShopItem.updateOne(
        { _id: shopItem },
        {
          $inc: {
            "groupedVariants.$[group].options.$[opt].quantity": quantity,
          },
        },
        {
          arrayFilters: [
            {
              "group.primaryAttribute": groupedVariant.primaryId,
            },
            {
              "opt.attribute": groupedVariant.optionId,
            },
          ],
          session,
        },
      );
    }
  }
};

const cancelExpiredOrders = async ({ filter, updatedBy }) => {
  const session = await mongoose.startSession();

  let lockAcquired = false;

  const lockId = randomUUID();

  // Lock matching orders first
  const lockedCount = await lockOrders({
    filter,
    lockId,
  });

  if (!lockedCount) {
    return 0;
  }

  lockAcquired = lockedCount > 0;

  try {
    session.startTransaction();

    const orders = await Order.find({
      lockedBy: lockId,
    }).session(session);

    let cancelledCount = 0;

    for (const order of orders) {
      if (order.rollbackInfo?.length) {
        await reverseStockFromRollback({
          rollbackInfo: order.rollbackInfo,
          session,
        });

        order.rollbackInfo = null;
      }

      if (order.paymentId) {
        await Payment.updateOne(
          { _id: order.paymentId },
          {
            status: PAYMENT_STATUS.CANCELLED,
          },
          { session },
        );
      }

      order.status = ORDER_STATUS.CANCELLED;

      order.isLocked = false;
      order.lockedAt = null;
      order.lockedBy = null;

      if (updatedBy) {
        order.updatedBy = updatedBy;
      }

      await order.save({ session });

      cancelledCount++;
    }

    await session.commitTransaction();

    return cancelledCount;
  } catch (error) {
    await session.abortTransaction();

    if (lockAcquired) {
      await unlockOrders({
        filter: {},
        lockId,
      });
    }

    throw error;
  } finally {
    session.endSession();
  }
};

const LOCK_TIMEOUT_MS = 30 * 60 * 1000;

const lockOrder = async ({ orderId, lockId }) => {
  return await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: ORDER_STATUS.PENDING,
      $or: [
        { isLocked: false },
        {
          isLocked: true,
          lockedAt: {
            $lte: new Date(Date.now() - LOCK_TIMEOUT_MS),
          },
        },
      ],
    },
    {
      $set: {
        isLocked: true,
        lockedAt: new Date(),
        lockedBy: lockId,
      },
    },
    {
      new: true,
    },
  );
};

const lockOrders = async ({ filter, lockId }) => {
  const now = new Date();

  const result = await Order.updateMany(
    {
      ...filter,
      $or: [
        { isLocked: false },
        {
          isLocked: true,
          lockedAt: {
            $lte: new Date(Date.now() - LOCK_TIMEOUT_MS),
          },
        },
      ],
    },
    {
      $set: {
        isLocked: true,
        lockedAt: now,
        lockedBy: lockId,
      },
    },
  );

  return result.modifiedCount;
};

const unlockOrders = async ({ filter, lockId }) => {
  return Order.updateMany(
    {
      ...filter,
      lockedBy: lockId,
    },
    {
      $set: {
        isLocked: false,
      },
      $unset: {
        lockedAt: 1,
        lockedBy: 1,
      },
    },
  );
};

module.exports = {
  reverseStockFromRollback,
  cancelExpiredOrders,
  lockOrder,
  lockOrders,
  unlockOrders,
};
