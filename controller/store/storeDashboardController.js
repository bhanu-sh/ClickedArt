const asyncHandler = require("express-async-handler");
const Order = require("../../models/orderModel");
const StoreProduct = require("../../models/storeProductModel");

// @desc    Get comprehensive store dashboard metrics
// @route   GET /api/store/dashboard/metrics
// @access  Store User
const getStoreDashboardMetrics = asyncHandler(async (req, res) => {
  const storeId = req.storeId;
  const storeQuery = {
    orderSource: { $in: ["STORE", "store"] },
    ...(storeId ? { store: storeId } : {}),
  };

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  // 1. Today's orders & sales
  const todayOrders = await Order.find({
    ...storeQuery,
    createdAt: { $gte: startOfToday, $lte: endOfToday },
    orderStatus: { $ne: "cancelled" },
  });

  const todaySales = todayOrders.reduce(
    (sum, order) => sum + (order.totalAmount || 0),
    0
  );
  const ordersTodayCount = todayOrders.length;

  // 2. All-time sales & order status counts
  const allOrders = await Order.find(storeQuery);
  const totalSales = allOrders
    .filter((o) => o.orderStatus !== "cancelled")
    .reduce((sum, order) => sum + (order.totalAmount || 0), 0);

  const pendingOrdersCount = allOrders.filter(
    (o) => o.orderStatus === "pending" || o.orderStatus === "processing"
  ).length;

  const completedOrdersCount = allOrders.filter(
    (o) => o.orderStatus === "completed"
  ).length;

  // 3. Products & stock metrics
  const allProducts = await StoreProduct.find({ store: storeId, status: "active" });
  const productsAvailableCount = allProducts.filter((p) => p.stockQuantity > 0).length;

  const lowStockProducts = allProducts.filter(
    (p) => p.stockQuantity <= (p.minStockLevel || 5)
  );
  const lowStockCount = lowStockProducts.length;

  // 4. Distinct customer count for this store
  const distinctEmails = await Order.distinct("customer.email", storeQuery);
  const totalCustomers = distinctEmails.length;

  // 5. Recent 5 orders
  const recentOrders = await Order.find(storeQuery)
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  // 6. 7-Day sales trend for chart
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const pastWeekOrders = await Order.find({
    ...storeQuery,
    createdAt: { $gte: sevenDaysAgo },
    orderStatus: { $ne: "cancelled" },
  });

  const salesTrend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" });

    const dayOrders = pastWeekOrders.filter(
      (o) => o.createdAt.toISOString().split("T")[0] === dateStr
    );
    const dayRevenue = dayOrders.reduce(
      (sum, o) => sum + (o.totalAmount || 0),
      0
    );

    salesTrend.push({
      date: dateStr,
      day: dayLabel,
      revenue: dayRevenue,
      orders: dayOrders.length,
    });
  }

  // 7. Critical low-stock items for alert
  const topLowStockItems = lowStockProducts.slice(0, 5).map((p) => ({
    id: p._id,
    name: p.name,
    sku: p.sku,
    stockQuantity: p.stockQuantity,
    minStockLevel: p.minStockLevel,
    sellingPrice: p.sellingPrice,
  }));

  res.status(200).json({
    status: true,
    data: {
      metrics: {
        todaySales,
        ordersTodayCount,
        totalSales,
        pendingOrdersCount,
        completedOrdersCount,
        productsAvailableCount,
        lowStockCount,
        totalCustomers,
      },
      salesTrend,
      recentOrders,
      topLowStockItems,
    },
  });
});

module.exports = {
  getStoreDashboardMetrics,
};
