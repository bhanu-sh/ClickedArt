const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const StoreUser = require("../models/storeUserModel");
const Store = require("../models/storeModel");

const verifyStoreToken = asyncHandler(async (req, res, next) => {
  const token = req.header("x-store-token") || req.header("x-auth-token");

  if (!token) {
    return res.status(401).json({
      status: false,
      message: "Access Denied: Store token is required",
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(
      token,
      process.env.SECRET_KEY || "clickedart_secret_jwt_key"
    );
  } catch (err) {
    return res.status(401).json({
      status: false,
      message: "Session expired or invalid token. Please log in again.",
    });
  }

  if (
    decoded &&
    (decoded.type === "Admin" ||
      ["Admin", "finance", "seo", "print"].includes(decoded.type))
  ) {
    const reqStoreId = req.header("x-store-id") || req.query.storeId;
    let store = null;
    if (reqStoreId && reqStoreId !== "all") {
      store = await Store.findById(reqStoreId);
    }
    req.isAdmin = true;
    req.storeUser = {
      _id: decoded.id,
      name: decoded.name || "Admin",
      role: "StoreManager",
    };
    if (store) {
      req.store = store;
      req.storeId = store._id;
    } else {
      const defaultStore = await Store.findOne({ status: "active" });
      req.store = defaultStore;
      req.storeId = reqStoreId && reqStoreId !== "all" ? store?._id : null;
    }
    return next();
  }

  if (!decoded || decoded.type !== "StoreUser" || !decoded.id) {
    return res.status(403).json({
      status: false,
      message: "Forbidden: Not an authorized store user account",
    });
  }

  const user = await StoreUser.findById(decoded.id).select("-password");
  if (!user || user.status !== "active") {
    return res.status(403).json({
      status: false,
      message: "Your store account is inactive or no longer exists.",
    });
  }

  const store = await Store.findById(user.store);
  if (!store || store.status !== "active") {
    return res.status(403).json({
      status: false,
      message: "This store is inactive or suspended. Please contact Admin.",
    });
  }

  // Attach strictly verified tenant information to request
  req.storeUser = user;
  req.store = store;
  req.storeId = store._id;

  next();
});

const requireStoreManager = asyncHandler(async (req, res, next) => {
  if (!req.storeUser || req.storeUser.role !== "StoreManager") {
    return res.status(403).json({
      status: false,
      message: "Permission Denied: Store Manager privileges required",
    });
  }
  next();
});

const requireStoreStaffOrManager = asyncHandler(async (req, res, next) => {
  if (
    !req.storeUser ||
    (req.storeUser.role !== "StoreManager" && req.storeUser.role !== "StoreStaff")
  ) {
    return res.status(403).json({
      status: false,
      message: "Permission Denied: Unauthorized store user",
    });
  }
  next();
});

module.exports = {
  verifyStoreToken,
  requireStoreManager,
  requireStoreStaffOrManager,
};
