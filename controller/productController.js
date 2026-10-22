const Product = require("../models/productModel");
require("../models/shopCategoryModel");
const mongoose = require("mongoose");

// @desc    Create a new product (Admin)
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res) => {
  try {
    const { name, price, description, images, mainImage, isPublished, category } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ success: false, message: "Product name is required" });
    }

    if (price === undefined || price === null || isNaN(price) || Number(price) < 0) {
      return res.status(400).json({ success: false, message: "A valid positive price is required" });
    }

    if (!description || description.trim() === "") {
      return res.status(400).json({ success: false, message: "Product description is required" });
    }

    const imageList = Array.isArray(images)
      ? images.filter((img) => typeof img === "string" && img.trim() !== "")
      : [];

    const primaryImage =
      mainImage && mainImage.trim() !== ""
        ? mainImage.trim()
        : imageList.length > 0
        ? imageList[0]
        : "";

    const newProduct = new Product({
      name: name.trim(),
      price: Number(price),
      description: description.trim(),
      images: imageList,
      mainImage: primaryImage,
      isPublished: typeof isPublished === "boolean" ? isPublished : true,
      category: category && mongoose.Types.ObjectId.isValid(category) ? category : null,
    });

    const savedProduct = await newProduct.save();

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: savedProduct,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error while creating product",
    });
  }
};

// @desc    Get all products for Admin management
// @route   GET /api/products
// @access  Private/Admin
const getAllProductsAdmin = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.search && req.query.search.trim() !== "") {
      const searchRegex = new RegExp(req.query.search.trim(), "i");
      filter.$or = [{ name: searchRegex }, { description: searchRegex }];
    }

    if (req.query.isPublished !== undefined && req.query.isPublished !== "all") {
      filter.isPublished = req.query.isPublished === "true" || req.query.isPublished === true;
    }

    if (req.query.category && req.query.category !== "all" && req.query.category.trim() !== "") {
      filter.category = req.query.category.trim();
    }

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate("category", "name coverImage")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      products,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      currentPage: page,
    });
  } catch (error) {
    console.error("Error fetching admin products:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching products",
    });
  }
};

// @desc    Get published products for Public Shop
// @route   GET /api/products/shop
// @access  Public
const getShopProducts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 24);
    const skip = (page - 1) * limit;

    // Public shop returns only published products
    const filter = { isPublished: true };

    if (req.query.category && req.query.category !== "all" && req.query.category.trim() !== "") {
      filter.category = req.query.category.trim();
    }

    if (req.query.search && req.query.search.trim() !== "") {
      const searchRegex = new RegExp(req.query.search.trim(), "i");
      filter.$or = [{ name: searchRegex }, { description: searchRegex }];
    }

    let sortOptions = { createdAt: -1 }; // newest first by default
    if (req.query.sort === "price_asc") {
      sortOptions = { price: 1, createdAt: -1 };
    } else if (req.query.sort === "price_desc") {
      sortOptions = { price: -1, createdAt: -1 };
    } else if (req.query.sort === "name_asc") {
      sortOptions = { name: 1 };
    }

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate("category", "name coverImage")
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      products,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      currentPage: page,
    });
  } catch (error) {
    console.error("Error fetching shop products:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching shop products",
    });
  }
};

// @desc    Get single product by ID
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID format" });
    }

    const product = await Product.findById(id).populate("category", "name coverImage");

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    return res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Error fetching product by ID:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching product",
    });
  }
};

// @desc    Update product details (Admin)
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID format" });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const { name, price, description, images, mainImage, isPublished, category } = req.body;

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim() === "") {
        return res.status(400).json({ success: false, message: "Product name cannot be empty" });
      }
      product.name = name.trim();
    }

    if (price !== undefined) {
      if (isNaN(price) || Number(price) < 0) {
        return res.status(400).json({ success: false, message: "Price must be a valid positive number" });
      }
      product.price = Number(price);
    }

    if (description !== undefined) {
      if (typeof description !== "string" || description.trim() === "") {
        return res.status(400).json({ success: false, message: "Description cannot be empty" });
      }
      product.description = description.trim();
    }

    if (images !== undefined) {
      product.images = Array.isArray(images)
        ? images.filter((img) => typeof img === "string" && img.trim() !== "")
        : [];
    }

    if (mainImage !== undefined) {
      product.mainImage = typeof mainImage === "string" ? mainImage.trim() : "";
    }

    // Ensure mainImage is set to first image if current mainImage is empty or removed
    if (!product.mainImage && product.images.length > 0) {
      product.mainImage = product.images[0];
    }

    if (isPublished !== undefined) {
      product.isPublished = Boolean(isPublished);
    }

    if (category !== undefined) {
      product.category = category && mongoose.Types.ObjectId.isValid(category) ? category : null;
    }

    const updatedProduct = await product.save();
    await updatedProduct.populate("category", "name coverImage");

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error while updating product",
    });
  }
};

// @desc    Delete a product (Admin)
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID format" });
    }

    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error while deleting product",
    });
  }
};

// @desc    Toggle product published state (Admin)
// @route   PATCH /api/products/:id/publish
// @access  Private/Admin
const togglePublishProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID format" });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    if (req.body.isPublished !== undefined) {
      product.isPublished = Boolean(req.body.isPublished);
    } else {
      product.isPublished = !product.isPublished;
    }

    await product.save();

    return res.status(200).json({
      success: true,
      message: `Product ${product.isPublished ? "published" : "unpublished"} successfully`,
      product,
    });
  } catch (error) {
    console.error("Error toggling product publish status:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error while changing status",
    });
  }
};


// @desc    Get all Shop Orders (Products, Books, Merchandise)
// @route   GET /api/products/orders
// @access  Private/Admin
const getShopOrders = async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query = {
      $or: [
        { orderSource: { $in: ["SHOP", "shop"] } },
        { "orderItems.product": { $exists: true, $ne: null } },
        { "orderItems.itemType": "product" },
        { "items.product": { $exists: true, $ne: null } },
      ],
    };

    if (search && search.trim()) {
      const q = search.trim();
      query.$and = [
        {
          $or: [
            { orderNumber: { $regex: q, $options: "i" } },
            { invoiceNumber: { $regex: q, $options: "i" } },
            { "customer.name": { $regex: q, $options: "i" } },
            { "customer.phone": { $regex: q, $options: "i" } },
            { "orderItems.name": { $regex: q, $options: "i" } },
          ],
        },
      ];
    }

    const Order = require("../models/orderModel");
    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("userInfo.user")
        .populate("orderItems.product")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Order.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      orders,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)) || 1,
    });
  } catch (error) {
    console.error("Error fetching shop orders:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch shop orders",
    });
  }
};

module.exports = {
  createProduct,
  getAllProductsAdmin,
  getShopProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  togglePublishProduct,
  getShopOrders,
};
