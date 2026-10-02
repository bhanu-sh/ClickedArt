const asyncHandler = require("express-async-handler");
const Order = require("../../models/orderModel");
const StoreProduct = require("../../models/storeProductModel");

// Helper to parse date filter
const getDateRangeFilter = (startDate, endDate, defaultDays = 30) => {
  const query = {};
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      query.createdAt.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  } else {
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - defaultDays);
    defaultStart.setHours(0, 0, 0, 0);
    query.createdAt = { $gte: defaultStart };
  }
  return query;
};

// @desc    Get store sales report with daily/weekly aggregates
// @route   GET /api/store/reports/sales
// @access  Store Manager
const getStoreSalesReport = asyncHandler(async (req, res) => {
  const storeId = req.storeId;
  const { startDate, endDate } = req.query;

  const dateFilter = getDateRangeFilter(startDate, endDate, 30);
  const matchFilter = {
    orderSource: { $in: ["STORE", "store"] },
    ...(storeId ? { store: storeId } : {}),
    orderStatus: { $ne: "cancelled" },
    ...dateFilter,
  };

  const orders = await Order.find(matchFilter).sort({ createdAt: 1 }).lean();

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  // Group by date (daily)
  const dailyMap = {};
  orders.forEach((o) => {
    const d = o.createdAt.toISOString().split("T")[0];
    if (!dailyMap[d]) {
      dailyMap[d] = { date: d, orders: 0, revenue: 0 };
    }
    dailyMap[d].orders += 1;
    dailyMap[d].revenue += o.totalAmount || 0;
  });

  const dailyBreakdown = Object.values(dailyMap).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  res.status(200).json({
    status: true,
    data: {
      summary: {
        totalOrders,
        totalRevenue: Math.round(totalRevenue),
        averageOrderValue,
      },
      dailyBreakdown,
    },
  });
});

// @desc    Get store product performance report
// @route   GET /api/store/reports/products
// @access  Store Manager
const getStoreProductReport = asyncHandler(async (req, res) => {
  const storeId = req.storeId;
  const { startDate, endDate } = req.query;

  const matchFilter = {
    orderSource: { $in: ["STORE", "store"] },
    ...(storeId ? { store: storeId } : {}),
    orderStatus: { $ne: "cancelled" },
    ...dateFilter,
  };

  const orders = await Order.find(matchFilter).lean();

  // Aggregate items sold
  const productPerformanceMap = {};
  orders.forEach((order) => {
    (order.items || []).forEach((item) => {
      const key = item.sku || item.name;
      if (!productPerformanceMap[key]) {
        productPerformanceMap[key] = {
          name: item.name,
          sku: item.sku,
          unitsSold: 0,
          totalRevenue: 0,
        };
      }
      productPerformanceMap[key].unitsSold += item.quantity || 1;
      productPerformanceMap[key].totalRevenue += item.total || 0;
    });
  });

  const bestSellers = Object.values(productPerformanceMap)
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 15);

  // Low stock and out of stock items
  const products = await StoreProduct.find({ store: storeId, status: "active" }).lean();
  const lowStock = products.filter(
    (p) => p.stockQuantity > 0 && p.stockQuantity <= (p.minStockLevel || 5)
  );
  const outOfStock = products.filter((p) => (p.stockQuantity || 0) <= 0);

  res.status(200).json({
    status: true,
    data: {
      bestSellers,
      lowStock: lowStock.map((p) => ({
        name: p.name,
        sku: p.sku,
        stockQuantity: p.stockQuantity,
        minStockLevel: p.minStockLevel,
      })),
      outOfStock: outOfStock.map((p) => ({
        name: p.name,
        sku: p.sku,
      })),
    },
  });
});

// @desc    Get store revenue report
// @route   GET /api/store/reports/revenue
// @access  Store Manager
const getStoreRevenueReport = asyncHandler(async (req, res) => {
  const storeId = req.storeId;
  const { startDate, endDate } = req.query;

  const dateFilter = getDateRangeFilter(startDate, endDate, 30);
  const matchFilter = {
    orderSource: { $in: ["STORE", "store"] },
    ...(storeId ? { store: storeId } : {}),
    orderStatus: { $ne: "cancelled" },
    ...dateFilter,
  };

  const orders = await Order.find(matchFilter).lean();

  let grossSales = 0;
  let totalDiscounts = 0;
  let totalTax = 0;
  let netSales = 0;

  orders.forEach((o) => {
    grossSales += o.subtotal || o.totalAmount || 0;
    totalDiscounts += o.discountTotal || 0;
    totalTax += o.taxTotal || 0;
    netSales += o.totalAmount || 0;
  });

  res.status(200).json({
    status: true,
    data: {
      grossSales: Math.round(grossSales),
      discounts: Math.round(totalDiscounts),
      taxes: Math.round(totalTax),
      netSales: Math.round(netSales),
      transactionsCount: orders.length,
    },
  });
});

module.exports = {
  getStoreSalesReport,
  getStoreProductReport,
  getStoreRevenueReport,
};
