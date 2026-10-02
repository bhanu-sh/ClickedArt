const express = require("express");
const router = express.Router();

const {
  verifyStoreToken,
  requireStoreManager,
} = require("../middleware/storeAuthMiddleware");

const {
  loginStoreUser,
  getStoreProfile,
  changePassword,
} = require("../controller/store/storeAuthController");

const {
  getStoreDashboardMetrics,
} = require("../controller/store/storeDashboardController");

const {
  getStoreOrders,
  getOrderById: getStoreOrderById,
  updateOrderStatus: updateStoreOrderStatus,
  createOrder: createStoreOrder,
  validateStoreCoupon,
} = require("../controller/orderController");

const {
  getStoreProducts,
  getStoreProductById,
  getAvailableArtworksForStore,
  createStoreProduct,
  updateStoreProduct,
  toggleStoreProductStatus,
} = require("../controller/store/storeProductController");

const {
  getStoreCustomers,
  getStoreCustomerHistory,
  searchUsersForStore,
  createUserForStore,
} = require("../controller/store/storeCustomerController");


const {
  getStoreSalesReport,
  getStoreProductReport,
  getStoreRevenueReport,
} = require("../controller/store/storeReportController");

const {
  getStoreSettings,
  updateStoreSettings,
} = require("../controller/store/storeSettingsController");

// --- PUBLIC ROUTES ---
router.post("/auth/login", loginStoreUser);

// --- AUTHENTICATED STORE USER ROUTES ---
router.get("/auth/profile", verifyStoreToken, getStoreProfile);
router.post("/auth/change-password", verifyStoreToken, changePassword);

// Dashboard
router.get("/dashboard/metrics", verifyStoreToken, getStoreDashboardMetrics);

// Orders
router.get("/orders", verifyStoreToken, getStoreOrders);
router.get("/orders/validate-coupon", verifyStoreToken, validateStoreCoupon);
router.get("/orders/:id", verifyStoreToken, getStoreOrderById);
router.post("/orders", verifyStoreToken, createStoreOrder);
router.put("/orders/:id/status", verifyStoreToken, updateStoreOrderStatus);

// Products
router.get("/products", verifyStoreToken, getStoreProducts);
router.get("/products/available-artworks", verifyStoreToken, getAvailableArtworksForStore);
router.get("/products/:id", verifyStoreToken, getStoreProductById);
router.post("/products", verifyStoreToken, requireStoreManager, createStoreProduct);
router.put("/products/:id", verifyStoreToken, updateStoreProduct);
router.patch("/products/:id/status", verifyStoreToken, requireStoreManager, toggleStoreProductStatus);

// Customers
router.get("/customers", verifyStoreToken, getStoreCustomers);
router.get("/customers/history", verifyStoreToken, getStoreCustomerHistory);
router.get("/customers/search-user", verifyStoreToken, searchUsersForStore);
router.post("/customers/create-user", verifyStoreToken, createUserForStore);
router.post("/customers/create-from-store", verifyStoreToken, createUserForStore);


// Reports (Manager only)
router.get("/reports/sales", verifyStoreToken, requireStoreManager, getStoreSalesReport);
router.get("/reports/products", verifyStoreToken, requireStoreManager, getStoreProductReport);
router.get("/reports/revenue", verifyStoreToken, requireStoreManager, getStoreRevenueReport);

// Settings
router.get("/settings", verifyStoreToken, getStoreSettings);
router.put("/settings", verifyStoreToken, requireStoreManager, updateStoreSettings);

module.exports = router;
