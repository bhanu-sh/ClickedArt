const express = require("express");
const {
  createProduct,
  getAllProductsAdmin,
  getShopProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  togglePublishProduct,
  getShopOrders,
} = require("../controller/productController");
const { isAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

// Public route for frontend shop (MUST be before /:id)
router.get("/shop", getShopProducts);

// Shop Orders (must precede /:id)
router.get("/orders", isAdmin, getShopOrders);

// Admin routes for product management
router.post("/", isAdmin, createProduct);
router.get("/", isAdmin, getAllProductsAdmin);

// Single product (Public / Details)
router.get("/:id", getProductById);

// Admin update, delete, and publish toggle
router.put("/:id", isAdmin, updateProduct);
router.delete("/:id", isAdmin, deleteProduct);
router.patch("/:id/publish", isAdmin, togglePublishProduct);

module.exports = router;
