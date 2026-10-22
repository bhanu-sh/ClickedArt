const express = require("express");
const router = express.Router();
const { isAdmin } = require("../middleware/authMiddleware");
const {
  createShopCategory,
  getAllShopCategories,
  getShopCategoryById,
  updateShopCategory,
  deleteShopCategory,
} = require("../controller/shopCategoryController");

// Public
router.get("/get", getAllShopCategories);
router.get("/get-by-id", getShopCategoryById);

// Admin only
router.post("/create", isAdmin, createShopCategory);
router.post("/update", isAdmin, updateShopCategory);
router.delete("/delete", isAdmin, deleteShopCategory);

module.exports = router;
