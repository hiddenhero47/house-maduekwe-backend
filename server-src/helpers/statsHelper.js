const { Order, ORDER_STATUS } = require("../models/orderModel");

// Orders that represent a completed sale (payment succeeded, not cancelled/returned)
const SALE_STATUSES = [
  ORDER_STATUS.PAID,
  ORDER_STATUS.PROCESSING,
  ORDER_STATUS.SHIPPED,
  ORDER_STATUS.DELIVERED,
];

// Matches how checkoutController computes amountToPay:
// totalAmount + totalVat + totalProductTax + shippingFee
// $ifNull guards documents from before a field existed — aggregation pipelines
// read raw stored data and skip Mongoose schema defaults, so a missing field
// would otherwise make the whole $add resolve to null.
const revenueExpr = {
  $add: [
    { $ifNull: ["$totalAmount", 0] },
    { $ifNull: ["$totalVat", 0] },
    { $ifNull: ["$totalProductTax", 0] },
    { $ifNull: ["$shippingFee", 0] },
  ],
};

const startOfUTCDay = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const addUTCDays = (date, days) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

const startOfUTCWeek = (date) => {
  const d = startOfUTCDay(date);
  const day = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? 6 : day - 1;
  return addUTCDays(d, -diffToMonday);
};

const startOfUTCMonth = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const formatDateLabel = (date) => date.toISOString().slice(0, 10); // YYYY-MM-DD

const formatMonthLabel = (date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; // YYYY-MM

const buildDayBuckets = (count, now = new Date()) => {
  const todayStart = startOfUTCDay(now);
  const buckets = [];

  for (let i = count - 1; i >= 0; i--) {
    const start = addUTCDays(todayStart, -i);
    const end = addUTCDays(start, 1);
    buckets.push({ start, end, label: formatDateLabel(start) });
  }

  return buckets;
};

const buildWeekBuckets = (count, now = new Date()) => {
  const currentWeekStart = startOfUTCWeek(now);
  const buckets = [];

  for (let i = count - 1; i >= 0; i--) {
    const start = addUTCDays(currentWeekStart, -7 * i);
    const end = addUTCDays(start, 7);
    buckets.push({ start, end, label: formatDateLabel(start) }); // label = Monday of that week
  }

  return buckets;
};

const buildMonthBuckets = (count, now = new Date()) => {
  const currentMonthStart = startOfUTCMonth(now);
  const buckets = [];

  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(
      Date.UTC(currentMonthStart.getUTCFullYear(), currentMonthStart.getUTCMonth() - i, 1),
    );
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    buckets.push({ start, end, label: formatMonthLabel(start) });
  }

  return buckets;
};

// Runs one $bucket aggregation over Order.createdAt and zero-fills empty buckets
const getBucketedSales = async ({ buckets, statuses }) => {
  const rangeStart = buckets[0].start;
  const rangeEnd = buckets[buckets.length - 1].end;

  const results = await Order.aggregate([
    {
      $match: {
        status: { $in: statuses },
        createdAt: { $gte: rangeStart, $lt: rangeEnd },
      },
    },
    {
      $bucket: {
        groupBy: "$createdAt",
        boundaries: [...buckets.map((b) => b.start), rangeEnd],
        default: "other",
        output: {
          revenue: { $sum: revenueExpr },
          orders: { $sum: 1 },
        },
      },
    },
  ]);

  const byStart = new Map(
    results
      .filter((r) => r._id !== "other")
      .map((r) => [new Date(r._id).getTime(), r]),
  );

  return buckets.map((b) => {
    const match = byStart.get(b.start.getTime());
    return {
      label: b.label,
      startDate: b.start,
      endDate: b.end,
      revenue: match ? Number(match.revenue.toFixed(2)) : 0,
      orders: match ? match.orders : 0,
    };
  });
};

// Same startDate/endDate query parsing convention used in orderController
const buildDateRangeFilter = (query) => {
  const { startDate, endDate } = query;
  const filter = {};

  if (startDate || endDate) {
    filter.createdAt = {};

    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start)) filter.createdAt.$gte = start;
    }

    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end)) {
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (Object.keys(filter.createdAt).length === 0) {
      delete filter.createdAt;
    }
  }

  return filter;
};

module.exports = {
  SALE_STATUSES,
  revenueExpr,
  startOfUTCDay,
  startOfUTCMonth,
  buildDayBuckets,
  buildWeekBuckets,
  buildMonthBuckets,
  getBucketedSales,
  buildDateRangeFilter,
};
