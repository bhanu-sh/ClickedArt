const asyncHandler = require("express-async-handler");
const ShopCategory = require("../models/shopCategoryModel");
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { S3Client } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: process.env.AWS_BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

// @desc    Create a new shop category
// @route   POST /api/shop-category/create
// @access  Admin
const createShopCategory = asyncHandler(async (req, res) => {
  const { name, description, coverImage } = req.body;

  const exists = await ShopCategory.findOne({ name });
  if (exists) {
    return res.status(400).json({ message: "Category with this name already exists" });
  }

  const category = await ShopCategory.create({ name, description, coverImage });
  res.status(201).json({ category });
});

// @desc    Get all shop categories (paginated)
// @route   GET /api/shop-category/get
// @access  Public
const getAllShopCategories = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === "true";
  } else if (req.query.activeOnly === "true") {
    filter.isActive = true;
  }

  if (req.query.all === "true") {
    const categories = await ShopCategory.find(filter).sort({ name: 1 });
    return res.status(200).json({
      categories,
      total: categories.length,
      pageCount: 1,
    });
  }

  const page = parseInt(req.query.pageNumber) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const total = await ShopCategory.countDocuments(filter);
  const categories = await ShopCategory.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({
    categories,
    pageCount: Math.ceil(total / limit) || 1,
    total,
  });
});

// @desc    Get shop category by ID
// @route   GET /api/shop-category/get-by-id
// @access  Public
const getShopCategoryById = asyncHandler(async (req, res) => {
  const { id } = req.query;
  const category = await ShopCategory.findById(id);
  if (!category) {
    return res.status(404).json({ message: "Category not found" });
  }
  res.status(200).json({ category });
});

// @desc    Update a shop category
// @route   POST /api/shop-category/update
// @access  Admin
const updateShopCategory = asyncHandler(async (req, res) => {
  const { id, name, description, coverImage, isActive } = req.body;

  const category = await ShopCategory.findById(id);
  if (!category) {
    return res.status(404).json({ message: "Category not found" });
  }

  category.name = name ?? category.name;
  category.description = description ?? category.description;
  category.coverImage = coverImage ?? category.coverImage;
  if (isActive !== undefined) category.isActive = isActive;

  await category.save();
  res.status(200).json({ category });
});

// @desc    Delete a shop category
// @route   DELETE /api/shop-category/delete
// @access  Admin
const deleteShopCategory = asyncHandler(async (req, res) => {
  const { id } = req.query;

  const category = await ShopCategory.findById(id);
  if (!category) {
    return res.status(404).json({ message: "Category not found" });
  }

  // Delete image from S3 if present
  if (category.coverImage) {
    try {
      const fileName = category.coverImage.split("//")[1].split("/")[1];
      await s3.send(
        new DeleteObjectCommand({
          Bucket: process.env.AWS_BUCKET,
          Key: fileName,
        })
      );
    } catch (err) {
      console.error("S3 delete error:", err.message);
    }
  }

  await category.deleteOne();
  res.status(200).json({ message: "Category deleted successfully" });
});

module.exports = {
  createShopCategory,
  getAllShopCategories,
  getShopCategoryById,
  updateShopCategory,
  deleteShopCategory,
};
