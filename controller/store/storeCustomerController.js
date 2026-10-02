const asyncHandler = require("express-async-handler");
const Order = require("../../models/orderModel");
const User = require("../../models/userModel");
const Photographer = require("../../models/photographerModel");
const UserType = require("../../models/typeModel");
const bcrypt = require("bcrypt");
const validator = require("validator");
const crypto = require("crypto");
const { sendStoreUserWelcomeEmail } = require("../../middleware/handleEmail");

// @desc    Get aggregated store customer list
// @route   GET /api/store/customers
// @access  Store User
const getStoreCustomers = asyncHandler(async (req, res) => {
  const storeId = req.storeId;
  const { search, page = 1, limit = 20 } = req.query;

  const matchQuery = {
    orderSource: { $in: ["STORE", "store"] },
    ...(storeId ? { store: storeId } : {}),
  };

  if (search && search.trim() !== "") {
    const regex = new RegExp(search.trim(), "i");
    matchQuery.$or = [
      { "customer.name": regex },
      { "customer.email": regex },
      { "customer.phone": regex },
      { "customer.address.city": regex },
    ];
  }

  // Aggregate orders grouped by customer email
  const aggregateResult = await Order.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: "$customer.email",
        name: { $first: "$customer.name" },
        phone: { $first: "$customer.phone" },
        city: { $first: "$customer.address.city" },
        totalOrders: { $sum: 1 },
        totalSpent: {
          $sum: {
            $cond: [{ $ne: ["$orderStatus", "cancelled"] }, "$totalAmount", 0],
          },
        },
        lastOrderDate: { $max: "$createdAt" },
        lastOrderNumber: { $first: "$orderNumber" },
      },
    },
    { $sort: { lastOrderDate: -1 } },
  ]);

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const total = aggregateResult.length;
  const startIndex = (pageNum - 1) * limitNum;
  const paginatedCustomers = aggregateResult.slice(
    startIndex,
    startIndex + limitNum
  );

  res.status(200).json({
    status: true,
    customers: paginatedCustomers.map((c) => ({
      email: c._id,
      name: c.name,
      phone: c.phone,
      city: c.city || "N/A",
      totalOrders: c.totalOrders,
      totalSpent: Math.round(c.totalSpent),
      lastOrderDate: c.lastOrderDate,
      lastOrderNumber: c.lastOrderNumber,
    })),
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  });
});

// @desc    Get customer purchase history within this store
// @route   GET /api/store/customers/history
// @access  Store User
const getStoreCustomerHistory = asyncHandler(async (req, res) => {
  const storeId = req.storeId;
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({
      status: false,
      message: "Customer email is required",
    });
  }

  const orders = await Order.find({
    orderSource: { $in: ["STORE", "store"] },
    ...(storeId ? { store: storeId } : {}),
    "customer.email": email.toLowerCase().trim(),
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!orders || orders.length === 0) {
    return res.status(404).json({
      status: false,
      message: "No order history found for this customer at your store",
    });
  }

  const customerInfo = orders[0].customer;
  const totalSpent = orders
    .filter((o) => o.orderStatus !== "cancelled")
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  res.status(200).json({
    status: true,
    customer: {
      name: customerInfo?.name,
      email: customerInfo?.email,
      phone: customerInfo?.phone,
      address: customerInfo?.address,
      totalOrders: orders.length,
      totalSpent: Math.round(totalSpent),
    },
    orders,
  });
});

// @desc    Search User and Photographer models for POS user lookup
// @route   GET /api/store/customers/search-user
// @access  Store User
const searchUsersForStore = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.status(400).json({ status: false, message: "Search query is required" });
  }

  const query = q.trim();
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "i");
  const numericQuery = Number(query.replace(/\D/g, ""));

  const orConditions = [
    { firstName: regex },
    { lastName: regex },
    { email: regex },
  ];
  if (!isNaN(numericQuery) && String(numericQuery).length >= 6) {
    orConditions.push({ mobile: numericQuery });
  }

  const [users, photographers] = await Promise.all([
    User.find({ $or: orConditions })
      .select("_id firstName lastName email mobile accountType")
      .limit(10)
      .lean(),
    Photographer.find({ $or: orConditions })
      .select("_id firstName lastName email mobile")
      .limit(10)
      .lean(),
  ]);

  const results = [
    ...users.map((u) => ({
      _id: u._id,
      name: `${u.firstName} ${u.lastName || ""}`.trim(),
      firstName: u.firstName,
      lastName: u.lastName || "",
      email: u.email,
      mobile: u.mobile,
      userType: "User",
      accountType: u.accountType,
    })),
    ...photographers.map((p) => ({
      _id: p._id,
      name: `${p.firstName} ${p.lastName || ""}`.trim(),
      firstName: p.firstName,
      lastName: p.lastName || "",
      email: p.email,
      mobile: p.mobile,
      userType: "Photographer",
      accountType: "photographer",
    })),
  ];

  res.status(200).json({ status: true, results });
});

// @desc    Create or find a User for walk-in POS sale with automatic credentials & welcome email
// @route   POST /api/store/customers/create-user
// @access  Store User
const createUserForStore = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, mobile } = req.body;

  // 1. Validate inputs
  const cleanFirstName = firstName ? String(firstName).trim() : "";
  if (!cleanFirstName) {
    return res.status(400).json({
      success: false,
      status: false,
      message: "First name is required",
    });
  }

  const cleanEmail = email ? String(email).trim().toLowerCase() : "";
  if (!cleanEmail || !validator.isEmail(cleanEmail)) {
    return res.status(400).json({
      success: false,
      status: false,
      message: "A valid email address is required",
    });
  }

  const rawMobile =
    mobile !== undefined && mobile !== null
      ? String(mobile).replace(/\D/g, "")
      : "";
  if (!rawMobile || rawMobile.length !== 10) {
    return res.status(400).json({
      success: false,
      status: false,
      message: "A valid 10-digit mobile number is required",
    });
  }
  const cleanMobile = Number(rawMobile);
  const cleanLastName = lastName ? String(lastName).trim() : "";

  // 2. Check if customer already exists in database
  const existingUser = await User.findOne({ email: cleanEmail });
  if (existingUser) {
    return res.status(200).json({
      success: true,
      status: true,
      isNewUser: false,
      message: "Customer already exists and selected for this order",
      user: {
        _id: existingUser._id,
        name: `${existingUser.firstName} ${existingUser.lastName || ""}`.trim(),
        firstName: existingUser.firstName,
        lastName: existingUser.lastName || "",
        email: existingUser.email,
        mobile: existingUser.mobile,
        userType: "User",
        accountType: existingUser.accountType || "regular",
      },
    });
  }

  // 3. Generate a cryptographically secure temporary password (e.g., CA@9f2b8a4c)
  const tempPassword = "CA@" + crypto.randomBytes(4).toString("hex");

  // 4. Create new customer user account in the existing User model
  // Mongoose pre('save') hook hashes this.password with bcrypt (10 rounds).
  // Passing plain tempPassword ensures single hash in DB, never storing plain text.
  const newUser = new User({
    firstName: cleanFirstName,
    lastName: cleanLastName,
    email: cleanEmail,
    password: tempPassword,
    mobile: cleanMobile,
    accountType: "regular",
    type: "User",
    isActive: true, // Marked active so customer can immediately sign in at /signin
    mustChangePassword: true,
  });

  await newUser.save();

  // 5. Create UserType mapping (matches website signup)
  try {
    await UserType.create({
      user: newUser._id,
      username: newUser.username || undefined,
      type: "User",
    });
  } catch (typeErr) {
    console.error(
      "Warning: Failed to create UserType for store customer:",
      typeErr.message
    );
  }

  // 6. Send automatic welcome email containing temporary credentials
  let emailSent = false;
  try {
    await sendStoreUserWelcomeEmail({
      name: `${newUser.firstName} ${newUser.lastName || ""}`.trim(),
      email: newUser.email,
      tempPassword,
      loginUrl: process.env.CLIENT_URL || "https://www.clickedart.com/signin",
    });
    emailSent = true;
  } catch (emailErr) {
    console.error(
      "Warning: Store customer welcome email failed:",
      emailErr.message
    );
    // Graceful fallback: do not fail POS transaction if SMTP is unavailable
  }

  // 7. Return newly created user to POS
  res.status(201).json({
    success: true,
    status: true,
    isNewUser: true,
    message: emailSent
      ? "Customer account created and welcome email sent"
      : "Customer account created successfully",
    user: {
      _id: newUser._id,
      name: `${newUser.firstName} ${newUser.lastName || ""}`.trim(),
      firstName: newUser.firstName,
      lastName: newUser.lastName || "",
      email: newUser.email,
      mobile: newUser.mobile,
      userType: "User",
      accountType: newUser.accountType,
    },
  });
});

module.exports = {
  getStoreCustomers,
  getStoreCustomerHistory,
  searchUsersForStore,
  createUserForStore,
};
