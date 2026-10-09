const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const Invoice = require("../models/invoiceModel.js");
const Order = require("../models/orderModel.js");
const CustomImageOrder = require("../models/customOrderModel.js");
const User = require("../models/userModel.js");
const Photographer = require("../models/photographerModel.js");
const Subscription = require("../models/subscriptionModel.js");
const Referral = require("../models/referralModel.js");
const StoreOrder = Order;

const getRevenueOverview = asyncHandler(async (req, res) => {
  const { categoryType = "Prints" } = req.query;

  const onlineMatch = {
    orderStatus: "completed",
    isPaid: true,
    orderSource: { $nin: ["STORE", "store"] },
  };
  if (req.user && req.user.type === "StoreUser") {
    onlineMatch._id = new mongoose.Types.ObjectId("000000000000000000000000"); 
  }

  const totalRevenue = await Order.aggregate([
    { $match: onlineMatch },
    { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
  ]);

  const storeOrderMatch = {
    orderStatus: { $ne: "cancelled" },
    orderSource: { $in: ["STORE", "store"] },
  };
  if (req.user && req.user.type === "StoreUser") {
    let sId = req.user.storeId;
    if (sId && typeof sId === "object" && sId._id) sId = sId._id;
    storeOrderMatch.store = new mongoose.Types.ObjectId(sId);
  }

  const storeTotalRevenue = await Order.aggregate([
    { $match: storeOrderMatch },
    { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
  ]);
  const storeTotalAmount =
    storeTotalRevenue.length > 0 ? storeTotalRevenue[0].totalRevenue : 0;
  const onlineTotalAmount =
    totalRevenue.length > 0 ? totalRevenue[0].totalRevenue : 0;

  const baseMatch = {
    orderStatus: "completed",
    isPaid: true,
  };
  if (req.user && req.user.type === "StoreUser") {
    let sId = req.user.storeId;
    if (sId && typeof sId === "object" && sId._id) sId = sId._id;
    baseMatch.store = new mongoose.Types.ObjectId(sId);
  }

  const revenueByFiscalYear = await Order.aggregate([
    { $match: onlineMatch },
    {
      $addFields: {
        fiscalYear: {
          $cond: [
            { $lt: [{ $month: "$createdAt" }, 4] },
            { $subtract: [{ $year: "$createdAt" }, 1] },
            { $year: "$createdAt" },
          ],
        },
      },
    },
    {
      $group: {
        _id: { fiscalYear: "$fiscalYear" },
        fiscalYearRevenue: { $sum: "$totalAmount" },
      },
    },
    {
      $sort: { "_id.fiscalYear": 1 },
    },
  ]);

  const storeRevenueByFiscalYear = await StoreOrder.aggregate([
    { $match: storeOrderMatch },
    {
      $addFields: {
        fiscalYear: {
          $cond: [
            { $lt: [{ $month: "$createdAt" }, 4] },
            { $subtract: [{ $year: "$createdAt" }, 1] },
            { $year: "$createdAt" },
          ],
        },
      },
    },
    {
      $group: {
        _id: { fiscalYear: "$fiscalYear" },
        fiscalYearRevenue: { $sum: "$totalAmount" },
      },
    },
  ]);

  const fyMap = {};
  revenueByFiscalYear.forEach((item) => {
    fyMap[item._id.fiscalYear] =
      (fyMap[item._id.fiscalYear] || 0) + item.fiscalYearRevenue;
  });
  storeRevenueByFiscalYear.forEach((item) => {
    fyMap[item._id.fiscalYear] =
      (fyMap[item._id.fiscalYear] || 0) + item.fiscalYearRevenue;
  });
  const revenueByFiscalYearData = Object.keys(fyMap)
    .sort((a, b) => Number(a) - Number(b))
    .map((year) => ({
      year: Number(year),
      yearlyRevenue: fyMap[year],
    }));

  const revenueByMonth = await Order.aggregate([
    { $match: onlineMatch },
    {
      $group: {
        _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        monthlyRevenue: { $sum: "$totalAmount" },
      },
    },
  ]);

  const storeRevenueByMonth = await StoreOrder.aggregate([
    { $match: storeOrderMatch },
    {
      $group: {
        _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        monthlyRevenue: { $sum: "$totalAmount" },
      },
    },
  ]);

  const monthMap = {};
  revenueByMonth.forEach((item) => {
    const key = `${item._id.year}-${item._id.month}`;
    monthMap[key] = {
      year: item._id.year,
      month: item._id.month,
      monthlyRevenue: (monthMap[key]?.monthlyRevenue || 0) + item.monthlyRevenue,
    };
  });
  storeRevenueByMonth.forEach((item) => {
    const key = `${item._id.year}-${item._id.month}`;
    monthMap[key] = {
      year: item._id.year,
      month: item._id.month,
      monthlyRevenue: (monthMap[key]?.monthlyRevenue || 0) + item.monthlyRevenue,
    };
  });
  const revenueByMonthData = Object.values(monthMap).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const revenueByCategory = await Order.aggregate([
    { $match: onlineMatch },
    { $unwind: "$orderItems" },
    {
      $match: {
        $or: [
          { "orderItems.subTotal": { $exists: true, $ne: null } },
          { "orderItems.imageInfo.price": { $exists: true, $ne: null } },
        ],
      },
    },
    {
      $group: {
        _id: null,
        revenue: {
          $sum: {
            $cond: [
              { $eq: [categoryType, "Prints"] },
              { $ifNull: ["$orderItems.subTotal", 0] },
              { $ifNull: ["$orderItems.imageInfo.price", 0] },
            ],
          },
        },
      },
    },
  ]);

  let printStoreRevenue = 0;
  if (categoryType === "Prints") {
    printStoreRevenue = storeTotalAmount;
  }
  const revenueByCategoryAmount =
    (revenueByCategory.length > 0 ? revenueByCategory[0].revenue : 0) +
    printStoreRevenue;

  let basicPlanRevenue = 0;
  let intermediatePlanRevenue = 0;
  let advancedPlanRevenue = 0;

  const subscriptions = await Subscription.find({}).populate("planId");
  const GST_RATE = 18;
  for (let subs of subscriptions) {
    if (subs.planId.name === "Basic") {
      const baseAmount = (subs?.price * 100) / (100 + GST_RATE);
      basicPlanRevenue += baseAmount;
    } else if (subs.planId.name === "Intermediate") {
      const baseAmount = (subs?.price * 100) / (100 + GST_RATE);
      intermediatePlanRevenue += baseAmount;
    } else if (subs.planId.name === "Premium") {
      const baseAmount = (subs?.price * 100) / (100 + GST_RATE);
      advancedPlanRevenue += baseAmount;
    }
  }

  res.status(200).send({
    totalRevenue: onlineTotalAmount + storeTotalAmount,
    onlineRevenue: onlineTotalAmount,
    storeRevenue: storeTotalAmount,
    revenueByFiscalYear: revenueByFiscalYearData,
    revenueByMonth: revenueByMonthData,
    revenueByCategory: revenueByCategoryAmount,
    basicPlanRevenue,
    intermediatePlanRevenue,
    advancedPlanRevenue,
  });
});

const revenueByCategory = asyncHandler(async (req, res) => {
  const { categoryType = "Prints", startDate, endDate } = req.query;

  if (
    !startDate ||
    !endDate ||
    isNaN(new Date(startDate)) ||
    isNaN(new Date(endDate))
  ) {
    return res
      .status(400)
      .send({ message: "Invalid startDate or endDate provided" });
  }

  const startOfDay = new Date(new Date(startDate).setHours(0, 0, 0, 0));
  const endOfDay = new Date(new Date(endDate).setHours(23, 59, 59, 999));

  const revenueByCategory = await Order.aggregate([
    {
      $match: {
        orderStatus: "completed",
        isPaid: true,
        createdAt: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      },
    },
    { $unwind: "$orderItems" },
    {
      $match: {
        $or: [
          { "orderItems.subTotal": { $exists: true, $ne: null } },
          { "orderItems.imageInfo.price": { $exists: true, $ne: null } },
        ],
      },
    },
    {
      $group: {
        _id: null,
        revenue: {
          $sum: {
            $cond: [
              { $eq: [categoryType, "Prints"] },
              { $ifNull: ["$orderItems.subTotal", 0] },
              { $ifNull: ["$orderItems.imageInfo.price", 0] },
            ],
          },
        },
      },
    },
  ]);

  let totalRevenue = await Order.aggregate([
    {
      $match: {
        orderStatus: "completed",
        isPaid: true,
        createdAt: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      },
    },
    { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
  ]);

  totalRevenue =
    totalRevenue && totalRevenue.length > 0 ? totalRevenue[0]?.totalRevenue : 0;

  res.status(200).send({
    categoryType,
    startDate: startOfDay.toISOString(),
    endDate: endOfDay.toISOString(),
    revenue: revenueByCategory[0]?.revenue || 0,
    totalRevenue,
  });
});

const getSalesDataMetrics = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const startOfDay = startDate
    ? new Date(new Date(startDate).setHours(0, 0, 0, 0))
    : undefined;
  const endOfDay = endDate
    ? new Date(new Date(endDate).setHours(23, 59, 59, 999))
    : undefined;

  const matchStage = {
    orderStatus: "completed",
    isPaid: true,
    orderSource: { $nin: ["STORE", "store"] },
    printStatus: "no-print",
  };
  if (req.user && req.user.type === "StoreUser") {
    matchStage._id = new mongoose.Types.ObjectId("000000000000000000000000");
  }

  if (startOfDay) matchStage.createdAt = { $gte: startOfDay };
  if (endOfDay) {
    matchStage.createdAt = matchStage.createdAt
      ? { ...matchStage.createdAt, $lte: endOfDay }
      : { $lte: endOfDay };
  }

  const totalDownloads = await Order.aggregate([
    { $match: matchStage },
    { $unwind: "$orderItems" },
    {
      $match: {
        "orderItems.imageInfo.price": { $exists: true },
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
      },
    },
  ]);

  const matchStageForPrint = {
    orderStatus: "completed",
    isPaid: true,
    orderSource: { $nin: ["STORE", "store"] },
    printStatus: {
      $nin: ["no-print", "cancelled"],
    },
  };
  if (req.user && req.user.type === "StoreUser") {
    matchStageForPrint._id = new mongoose.Types.ObjectId("000000000000000000000000");
  }

  const matchStageForCustomPrint = {
    orderStatus: "completed",
    isPaid: true,
    orderSource: { $nin: ["STORE", "store"] },
    printStatus: { $ne: "no-print" },
  };
  if (req.user && req.user.type === "StoreUser") {
    matchStageForCustomPrint._id = new mongoose.Types.ObjectId("000000000000000000000000");
  }

  const totalPrints = await Order.aggregate([
    { $match: matchStageForPrint },
    { $unwind: "$orderItems" },
    {
      $match: {
        "orderItems.subTotal": { $exists: true, $ne: 0 },
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
      },
    },
  ]);

  const totalCustomPrints = await CustomImageOrder.aggregate([
    { $match: matchStageForCustomPrint },
    { $unwind: "$orderItems" },
    {
      $match: {
        "orderItems.subTotal": { $exists: true, $ne: 0 },
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
      },
    },
  ]);

  const analyticsMatch = { 
    printStatus: { $ne: "no-print" },
    orderSource: { $nin: ["STORE", "store"] }
  };
  if (req.user && req.user.type === "StoreUser") {
    analyticsMatch._id = new mongoose.Types.ObjectId("000000000000000000000000");
  }

  const analytics = await Order.aggregate([
    {
      $match: analyticsMatch,
    },
    {
      $group: {
        _id: "$printStatus",
        count: { $sum: 1 },
      },
    },
  ]);

  const result = {
    processing: 0,
    printing: 0,
    packed: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
    returned: 0,
  };

  analytics.forEach((item) => {
    result[item._id] = item.count;
  });

  const storeMatchStage = {
    orderStatus: { $ne: "cancelled" },
    orderSource: { $in: ["STORE", "store"] },
  };
  if (req.user && req.user.type === "StoreUser") {
    let sId = req.user.storeId;
    if (sId && typeof sId === "object" && sId._id) sId = sId._id;
    storeMatchStage.store = new mongoose.Types.ObjectId(sId);
  }
  if (startOfDay) storeMatchStage.createdAt = { $gte: startOfDay };
  if (endOfDay) {
    storeMatchStage.createdAt = storeMatchStage.createdAt
      ? { ...storeMatchStage.createdAt, $lte: endOfDay }
      : { $lte: endOfDay };
  }

  const storeAnalytics = await StoreOrder.aggregate([
    {
      $match: {
        ...storeMatchStage,
        printStatus: { $ne: "no-print" }
      }
    },
    {
      $group: {
        _id: "$printStatus",
        count: { $sum: 1 },
      },
    },
  ]);

  storeAnalytics.forEach((item) => {
    result[item._id] = (result[item._id] || 0) + item.count;
  });



  const storePrints = await StoreOrder.aggregate([
    { $match: storeMatchStage },
    { $unwind: "$items" },
    {
      $group: {
        _id: null,
        count: { $sum: { $ifNull: ["$items.quantity", 1] } },
      },
    },
  ]);
  const storePrintsCount = storePrints[0]?.count || 0;

  const storeAovData = await StoreOrder.aggregate([
    { $match: storeMatchStage },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$totalAmount" },
        orderCount: { $sum: 1 },
      },
    },
  ]);

  const averageOrderStage = {
    orderStatus: "completed",
    isPaid: true,
    orderSource: { $nin: ["STORE", "store"] },
  };
  if (req.user && req.user.type === "StoreUser") {
    averageOrderStage._id = new mongoose.Types.ObjectId("000000000000000000000000");
  }
  if (startOfDay) averageOrderStage.createdAt = { $gte: startOfDay };
  if (endOfDay) {
    averageOrderStage.createdAt = averageOrderStage.createdAt
      ? { ...averageOrderStage.createdAt, $lte: endOfDay }
      : { $lte: endOfDay };
  }

  const onlineOrderCount = (await Order.countDocuments(averageOrderStage)) || 0;
  const onlineTotalRev = (await Order.aggregate([
    { $match: averageOrderStage },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]))[0]?.total || 0;

  const storeOrderCount = storeAovData[0]?.orderCount || 0;
  const storeTotalRev = storeAovData[0]?.totalRevenue || 0;

  const totalCombinedOrders = onlineOrderCount + storeOrderCount;
  const totalCombinedRevenue = onlineTotalRev + storeTotalRev;
  const combinedAov =
    totalCombinedOrders > 0 ? totalCombinedRevenue / totalCombinedOrders : 0;

  res.status(200).send({
    totalDownloads: totalDownloads[0]?.count || 0,
    totalPrints: (totalPrints[0]?.count || 0) + storePrintsCount,
    totalCustomPrints: totalCustomPrints[0]?.count || 0,
    averageOrderValue: combinedAov,
    onlinePrints: totalPrints[0]?.count || 0,
    storePrints: storePrintsCount,
    storeOrdersCount: storeOrderCount,
    printData: result,
  });
});

const getCustomerInsights = asyncHandler(async (req, res) => {
  const activeBuyers = await Order.aggregate([
    { $match: { orderStatus: "completed", isPaid: true } },
    { $group: { _id: "$userInfo.user" } },
    { $count: "activeBuyers" },
  ]);

  const activePhotographers = await Order.aggregate([
    { $match: { orderStatus: "completed", isPaid: true } },
    { $unwind: "$orderItems" },
    { $group: { _id: "$orderItems.imageInfo.photographer" } },
    { $count: "activePhotographers" },
  ]);

  const repeatPurchaseRateData = await Order.aggregate([
    { $match: { orderStatus: "completed", isPaid: true } },
    { $group: { _id: "$userInfo.user", orderCount: { $sum: 1 } } },
    { $match: { orderCount: { $gt: 1 } } },
  ]);

  const totalBuyersCount = await Order.aggregate([
    { $match: { orderStatus: "completed", isPaid: true } },
    { $group: { _id: "$userInfo.user" } },
    { $count: "totalBuyers" },
  ]);

  const repeatPurchaseRate = totalBuyersCount[0]?.totalBuyers
    ? ((repeatPurchaseRateData.length || 0) /
        totalBuyersCount[0]?.totalBuyers) *
      100
    : 0;
  const clvData = await Order.aggregate([
    { $match: { orderStatus: "completed", isPaid: true } },
    { $group: { _id: "$userInfo.user", totalSpent: { $sum: "$totalAmount" } } },
    { $group: { _id: null, avgCLV: { $avg: "$totalSpent" } } },
  ]);

  const customerLifetimeValue = clvData[0]?.avgCLV || 0;

  res.status(200).send({
    activeBuyers: activeBuyers[0]?.activeBuyers || 0,
    activePhotographers: activePhotographers[0]?.activePhotographers || 0,
    repeatPurchaseRate: repeatPurchaseRate.toFixed(2),
    customerLifetimeValue: customerLifetimeValue.toFixed(2),
  });
});

const getPhotographerEarnings = asyncHandler(async (req, res) => {
  const startOfYear = new Date(new Date().getFullYear(), 0, 1);
  const startOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  );
  const startOfDay = new Date().setHours(0, 0, 0, 0);
  const endOfDay = new Date().setHours(23, 59, 59, 999);

  const calculatePayouts = async (paymentStatus, startDate, endDate = null) => {
    const matchStage = { paymentStatus };
    if (startDate) matchStage.createdAt = { $gte: startDate };
    if (endDate) matchStage.createdAt.$lte = endDate;

    const result = await Invoice.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$totalAmountPayable" },
        },
      },
    ]);
    return result[0]?.totalAmount || 0;
  };

  const payoutsThisYear = await calculatePayouts("paid", startOfYear);
  const payoutsThisMonth = await calculatePayouts("paid", startOfMonth);
  const payoutsToday = await calculatePayouts("paid", startOfDay, endOfDay);

  const pendingThisYear = await calculatePayouts("pending", startOfYear);
  const pendingThisMonth = await calculatePayouts("pending", startOfMonth);
  const pendingToday = await calculatePayouts("pending", startOfDay, endOfDay);

  res.status(200).send({
    payouts: {
      thisYear: payoutsThisYear,
      thisMonth: payoutsThisMonth,
      today: payoutsToday,
    },
    pending: {
      thisYear: pendingThisYear,
      thisMonth: pendingThisMonth,
      today: pendingToday,
    },
  });
});

const getSubsAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  if (
    !startDate ||
    !endDate ||
    isNaN(new Date(startDate)) ||
    isNaN(new Date(endDate))
  ) {
    return res
      .status(400)
      .send({ message: "Invalid startDate or endDate provided" });
  }

  const startOfDay = new Date(new Date(startDate).setHours(0, 0, 0, 0));
  const endOfDay = new Date(new Date(endDate).setHours(23, 59, 59, 999));

  let basicPlanRevenue = 0;
  let intermediatePlanRevenue = 0;
  let advancedPlanRevenue = 0;

  const subscriptions = await Subscription.find({
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  }).populate("planId");

  for (let subs of subscriptions) {
    if (subs.planId.name === "Basic") {
      const baseAmount = (subs?.price * 100) / 118;
      basicPlanRevenue += baseAmount;
    } else if (subs.planId.name === "Intermediate") {
      const baseAmount = (subs?.price * 100) / 118;
      intermediatePlanRevenue += baseAmount;
    } else if (subs.planId.name === "Premium") {
      const baseAmount = (subs?.price * 100) / 118;
      advancedPlanRevenue += baseAmount;
    }
  }

  res.status(200).send({
    basicPlanRevenue,
    intermediatePlanRevenue,
    advancedPlanRevenue,
  });
});

const getReferralDetailsBySalesUser = asyncHandler(async (req, res) => {
  const { referralCode, startDate, endDate } = req.query;

  const referralcode = await Referral.findOne({ code: referralCode }).populate(
    "salesuser"
  );

  if (!referralcode) {
    return res.status(400).send({ message: "No Referrals Found" });
  }

  const startGenDate = new Date(startDate);
  const endGenDate = new Date(endDate);
  endGenDate.setHours(23, 59, 59, 999);

  const photographers = await Photographer.find({
    referralcode: referralcode.code,
    active: true,
    createdAt: { $gte: new Date(startGenDate), $lte: new Date(endGenDate) },
  });

  res.status(200).send({ photographers });
});

const getReferralDetailsByDate = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const referrals = await Referral.findOne({ isSalesUser: true }).populate(
    "salesuser"
  );

  const referralCodes = referrals.map((referral) => referral.code);

  const startGenDate = new Date(startDate);
  const endGenDate = new Date(endDate);
  endGenDate.setHours(23, 59, 59, 999);

  const photographers = await Photographer.find({
    referralcode: { $in: referralCodes },
    createdAt: { $gte: new Date(startGenDate), $lte: new Date(endGenDate) },
  });

  res.status(200).send({ photographers });
});

const getAllDigitalOrders = asyncHandler(async (req, res) => {
  const { pageNumber = 1, pageSize = 20 } = req.query;

  const [orders, totalDocuments] = await Promise.all([
    Order.find({ printStatus: "no-print" })
      .populate({
        path: "orderItems",
        populate: [
          {
            path: "imageInfo.image",
            populate: {
              path: "photographer",
            },
          },
          {
            path: "frameInfo.frame",
          },
          {
            path: "paperInfo.paper",
          },
          {
            path: "imageInfo.photographer",
          },
        ],
      })
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize),
    Order.countDocuments({ printStatus: "no-print" }),
  ]);

  const pageCount = Math.ceil(totalDocuments / pageSize);
  res.status(200).send({ orders, pageCount });
});

const getAllPrintOrders = asyncHandler(async (req, res) => {
  const { pageNumber = 1, pageSize = 20, source } = req.query;

  const query = { printStatus: { $ne: "no-print" } };
  
  if (req.user && req.user.type === "StoreUser") {
    let sId = req.user.storeId;
    if (sId && typeof sId === "object" && sId._id) sId = sId._id;
    query.store = new mongoose.Types.ObjectId(sId);
    query.orderSource = { $in: ["STORE", "store"] };
  } else {
    if (source && source.toUpperCase() === "ONLINE") {
      query.orderSource = { $nin: ["STORE", "store"] };
    } else if (source && source.toUpperCase() === "STORE") {
      query.orderSource = { $in: ["STORE", "store"] };
    } else if (source && source !== "all") {
      query.orderSource = source.toUpperCase();
    }
  }

  const [orders, totalDocuments] = await Promise.all([
    Order.find(query)
      .populate({
        path: "orderItems",
        populate: [
          {
            path: "imageInfo.image",
            populate: {
              path: "photographer",
            },
          },
          {
            path: "frameInfo.frame",
          },
          {
            path: "paperInfo.paper",
          },
          {
            path: "imageInfo.photographer",
          },
        ],
      })
      .populate("userInfo.user")
      .populate("store", "name storeCode city state")
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize),
    Order.countDocuments(query),
  ]);

  const pageCount = Math.ceil(totalDocuments / pageSize);
  res.status(200).send({ orders, pageCount });
});

module.exports = {
  getRevenueOverview,
  getCustomerInsights,
  getPhotographerEarnings,
  revenueByCategory,
  getSalesDataMetrics,
  getSubsAnalytics,
  getReferralDetailsBySalesUser,
  getReferralDetailsByDate,
  getAllDigitalOrders,
  getAllPrintOrders,
};
