const asyncHandler = require("express-async-handler");
const { Order, ORDER_STATUS, CHECKOUT_TYPES } = require("../models/orderModel");
const { Payment, PAYMENT_STATUS } = require("../models/paymentModel");
const {
  SALE_STATUSES,
  revenueExpr,
  startOfUTCMonth,
  buildDayBuckets,
  buildWeekBuckets,
  buildMonthBuckets,
  getBucketedSales,
  buildDateRangeFilter,
} = require("../helpers/statsHelper");

// @desc Revenue + order count bucketed over time (day: 7d, week: 5w, month: 12m)
// @route GET /api/stats/sales-timeseries?period=day|week|month
// @access Private (Admin)
const getSalesTimeseries = asyncHandler(async (req, res) => {
  const period = req.query.period || "day";

  const bucketBuilders = {
    day: () => buildDayBuckets(7),
    week: () => buildWeekBuckets(5),
    month: () => buildMonthBuckets(12),
  };

  if (!bucketBuilders[period]) {
    res.status(400);
    throw new Error("Invalid period. Use day, week or month");
  }

  const buckets = bucketBuilders[period]();

  const data = await getBucketedSales({ buckets, statuses: SALE_STATUSES });

  res.status(200).json({ period, data });
});

// @desc Order counts + revenue per status, plus a paid-but-unshipped count
// @route GET /api/stats/order-status-breakdown
// @access Private (Admin)
const getOrderStatusBreakdown = asyncHandler(async (req, res) => {
  const filter = buildDateRangeFilter(req.query);

  const results = await Order.aggregate([
    { $match: filter },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        revenue: { $sum: revenueExpr },
      },
    },
  ]);

  const byStatus = new Map(results.map((r) => [r._id, r]));

  const data = Object.values(ORDER_STATUS).map((status) => ({
    status,
    count: byStatus.get(status)?.count || 0,
    revenue: Number((byStatus.get(status)?.revenue || 0).toFixed(2)),
  }));

  const awaitingShipment =
    (byStatus.get(ORDER_STATUS.PAID)?.count || 0) +
    (byStatus.get(ORDER_STATUS.PROCESSING)?.count || 0);

  res.status(200).json({ data, awaitingShipment });
});

// @desc Guest checkout vs user checkout, by count and revenue
// @route GET /api/stats/checkout-type-breakdown
// @access Private (Admin)
const getCheckoutTypeBreakdown = asyncHandler(async (req, res) => {
  const filter = {
    status: { $in: SALE_STATUSES },
    ...buildDateRangeFilter(req.query),
  };

  const results = await Order.aggregate([
    { $match: filter },
    {
      $group: {
        _id: "$checkoutType",
        count: { $sum: 1 },
        revenue: { $sum: revenueExpr },
      },
    },
  ]);

  const byType = new Map(results.map((r) => [r._id, r]));

  const data = Object.values(CHECKOUT_TYPES).map((checkoutType) => ({
    checkoutType,
    count: byType.get(checkoutType)?.count || 0,
    revenue: Number((byType.get(checkoutType)?.revenue || 0).toFixed(2)),
  }));

  res.status(200).json({ data });
});

// @desc Top selling items for a given month, ranked by quantity sold
// @route GET /api/stats/top-selling-items?month=YYYY-MM&limit=10
// @access Private (Admin)
const getTopSellingItems = asyncHandler(async (req, res) => {
  const { month, limit } = req.query;

  let monthStart;

  if (month) {
    const match = /^(\d{4})-(\d{2})$/.exec(month);

    if (!match) {
      res.status(400);
      throw new Error("Invalid month format. Use YYYY-MM");
    }

    const [, year, mon] = match;
    monthStart = new Date(Date.UTC(Number(year), Number(mon) - 1, 1));
  } else {
    monthStart = startOfUTCMonth(new Date());
  }

  const monthEnd = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
  );

  const parsedLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

  const data = await Order.aggregate([
    {
      $match: {
        status: { $in: SALE_STATUSES },
        createdAt: { $gte: monthStart, $lt: monthEnd },
      },
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.shopItem._id",
        name: { $first: "$items.shopItem.name" },
        image: { $first: { $arrayElemAt: ["$items.shopItem.imageCatalog", 0] } },
        currency: { $first: "$items.shopItem.currency" },
        quantitySold: { $sum: "$items.quantity" },
        revenue: {
          $sum: { $multiply: ["$items.shopItem.price", "$items.quantity"] },
        },
      },
    },
    { $sort: { quantitySold: -1 } },
    { $limit: parsedLimit },
  ]);

  res.status(200).json({
    month: `${monthStart.getUTCFullYear()}-${String(
      monthStart.getUTCMonth() + 1,
    ).padStart(2, "0")}`,
    data,
    note: "revenue = price × quantity; excludes attribute upcharges and VAT",
  });
});

// @desc Payment success/failed/etc breakdown, plus revenue by provider
// @route GET /api/stats/payment-summary
// @access Private (Admin)
const getPaymentSummary = asyncHandler(async (req, res) => {
  const filter = buildDateRangeFilter(req.query);

  const [statusResults, providerResults] = await Promise.all([
    Payment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          amount: { $sum: "$amountToPay" },
        },
      },
    ]),

    Payment.aggregate([
      { $match: { ...filter, status: PAYMENT_STATUS.SUCCESS } },
      {
        $group: {
          _id: "$provider",
          count: { $sum: 1 },
          revenue: { $sum: "$amountToPay" },
        },
      },
    ]),
  ]);

  const byStatus = new Map(statusResults.map((r) => [r._id, r]));

  const statusBreakdown = Object.values(PAYMENT_STATUS).map((status) => ({
    status,
    count: byStatus.get(status)?.count || 0,
    amount: Number((byStatus.get(status)?.amount || 0).toFixed(2)),
  }));

  const revenueByProvider = providerResults.map((r) => ({
    provider: r._id || "unknown",
    count: r.count,
    revenue: Number(r.revenue.toFixed(2)),
  }));

  res.status(200).json({ statusBreakdown, revenueByProvider });
});

// @desc Dashboard KPI tiles: revenue, order counts, average order value, awaiting shipment
// @route GET /api/stats/overview
// @access Private (Admin)
const getOverview = asyncHandler(async (req, res) => {
  const monthStart = startOfUTCMonth(new Date());

  const [allTime, thisMonth, awaitingShipment] = await Promise.all([
    Order.aggregate([
      { $match: { status: { $in: SALE_STATUSES } } },
      {
        $group: {
          _id: null,
          revenue: { $sum: revenueExpr },
          orders: { $sum: 1 },
        },
      },
    ]),

    Order.aggregate([
      {
        $match: {
          status: { $in: SALE_STATUSES },
          createdAt: { $gte: monthStart },
        },
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: revenueExpr },
          orders: { $sum: 1 },
        },
      },
    ]),

    Order.countDocuments({
      status: { $in: [ORDER_STATUS.PAID, ORDER_STATUS.PROCESSING] },
    }),
  ]);

  const allTimeStats = allTime[0] || { revenue: 0, orders: 0 };
  const thisMonthStats = thisMonth[0] || { revenue: 0, orders: 0 };

  res.status(200).json({
    allTime: {
      revenue: Number(allTimeStats.revenue.toFixed(2)),
      orders: allTimeStats.orders,
      averageOrderValue: allTimeStats.orders
        ? Number((allTimeStats.revenue / allTimeStats.orders).toFixed(2))
        : 0,
    },
    thisMonth: {
      revenue: Number(thisMonthStats.revenue.toFixed(2)),
      orders: thisMonthStats.orders,
      averageOrderValue: thisMonthStats.orders
        ? Number((thisMonthStats.revenue / thisMonthStats.orders).toFixed(2))
        : 0,
    },
    awaitingShipment,
  });
});

module.exports = {
  getSalesTimeseries,
  getOrderStatusBreakdown,
  getCheckoutTypeBreakdown,
  getTopSellingItems,
  getPaymentSummary,
  getOverview,
};
