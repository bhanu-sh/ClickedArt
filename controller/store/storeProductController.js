const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const StoreProduct = require("../../models/storeProductModel");
const Artwork = require("../../models/artworkModel");
const ImageVault = require("../../models/imagebase/imageVaultModel");
const Category = require("../../models/categoryModel");
const ArtworkCategory = require("../../models/artworkCategoryModel");

// @desc    Get store products with search, filters, pagination, and two tabs: "photos" | "artworks"
// @route   GET /api/store/products
// @access  Store User
const getStoreProducts = asyncHandler(async (req, res) => {
  const storeId = req.storeId;
  const isManager = req.storeUser?.role === "StoreManager";

  const {
    type = "photos", // "photos" | "artworks"
    search,
    category,
    page = 1,
    limit = 24,
  } = req.query;

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 24;
  const skip = (pageNum - 1) * limitNum;

  // Base active catalog items filter
  const baseActiveFilter = {
    isActive: { $ne: false },
    notForSale: { $ne: true },
  };

  // Get total counts for both tabs
  const [totalPhotosCount, totalArtworksCount] = await Promise.all([
    ImageVault.countDocuments(baseActiveFilter),
    Artwork.countDocuments(baseActiveFilter),
  ]);

  let products = [];
  let total = 0;
  let categories = [];

  if (type === "artworks") {
    const artworkQuery = { ...baseActiveFilter };

    if (search && search.trim() !== "") {
      const regex = new RegExp(search.trim(), "i");
      artworkQuery.$or = [{ title: regex }, { description: regex }, { keywords: regex }];
    }

    if (category && category !== "all") {
      const matchedCats = await ArtworkCategory.find({
        name: new RegExp(category.trim(), "i"),
      }).select("_id");
      if (matchedCats.length > 0) {
        artworkQuery.category = { $in: matchedCats.map((c) => c._id) };
      }
    }

    total = await Artwork.countDocuments(artworkQuery);

    const rawArtworks = await Artwork.find(artworkQuery)
      .populate("photographer", "firstName lastName name username")
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Check if store has any customized StoreProduct records for these artworks
    const artworkIds = rawArtworks.map((a) => a._id);
    const storeOverrides = await StoreProduct.find({
      store: storeId,
      $or: [{ artwork: { $in: artworkIds } }, { _id: { $in: artworkIds } }],
    }).lean();

    const overrideMap = new Map();
    storeOverrides.forEach((so) => {
      if (so.artwork) overrideMap.set(so.artwork.toString(), so);
      overrideMap.set(so._id.toString(), so);
    });

    products = rawArtworks.map((item) => {
      const override = overrideMap.get(item._id.toString());
      const baseP = override?.sellingPrice || item.price?.original || 2000;
      const photographerName = item.photographer
        ? `${item.photographer.firstName || ""} ${item.photographer.lastName || ""}`.trim() ||
          item.photographer.name ||
          "Artist"
        : "Artist";

      const catName = Array.isArray(item.category)
        ? item.category.map((c) => c?.name).filter(Boolean).join(", ")
        : item.category?.name || "Fine Art";

      return {
        _id: item._id,
        storeProductId: override?._id || null,
        name: override?.name || item.title || "Untitled Artwork",
        sku: override?.sku || `ART-${item._id.toString().slice(-6).toUpperCase()}`,
        category: override?.category || catName,
        description: override?.description || item.description || "",
        image: item.imageLinks?.thumbnail || item.imageLinks?.original || override?.image || "",
        sellingPrice: baseP,
        basePrice: override?.basePrice || baseP,
        discount: override?.discount || 10,
        stockQuantity: override?.stockQuantity || 15,
        minStockLevel: override?.minStockLevel || 2,
        status: override?.status || "active",
        photographer: photographerName,
        itemType: "artwork",
      };
    });

    try {
      const allCats = await ArtworkCategory.find({}).select("name").lean();
      categories = allCats.map((c) => c.name).filter(Boolean);
    } catch {}
  } else {
    // type === "photos" (default)
    const photoQuery = { ...baseActiveFilter };

    if (search && search.trim() !== "") {
      const regex = new RegExp(search.trim(), "i");
      photoQuery.$or = [{ title: regex }, { description: regex }, { keywords: regex }];
    }

    if (category && category !== "all") {
      const matchedCats = await Category.find({
        name: new RegExp(category.trim(), "i"),
      }).select("_id");
      if (matchedCats.length > 0) {
        photoQuery.category = { $in: matchedCats.map((c) => c._id) };
      }
    }

    total = await ImageVault.countDocuments(photoQuery);

    const rawPhotos = await ImageVault.find(photoQuery)
      .populate("photographer", "firstName lastName name username")
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const photoIds = rawPhotos.map((p) => p._id);
    const storeOverrides = await StoreProduct.find({
      store: storeId,
      $or: [{ artwork: { $in: photoIds } }, { _id: { $in: photoIds } }],
    }).lean();

    const overrideMap = new Map();
    storeOverrides.forEach((so) => {
      if (so.artwork) overrideMap.set(so.artwork.toString(), so);
      overrideMap.set(so._id.toString(), so);
    });

    products = rawPhotos.map((item) => {
      const override = overrideMap.get(item._id.toString());
      const baseP =
        override?.sellingPrice || item.price?.original || item.price?.medium || 2000;
      const photographerName = item.photographer
        ? `${item.photographer.firstName || ""} ${item.photographer.lastName || ""}`.trim() ||
          item.photographer.name ||
          "Photographer"
        : "Photographer";

      const catName = Array.isArray(item.category)
        ? item.category.map((c) => c?.name).filter(Boolean).join(", ")
        : item.category?.name || "Photography";

      return {
        _id: item._id,
        storeProductId: override?._id || null,
        name: override?.name || item.title || "Untitled Photo",
        sku: override?.sku || `PHOTO-${item._id.toString().slice(-6).toUpperCase()}`,
        category: override?.category || catName,
        description: override?.description || item.description || "",
        image: item.imageLinks?.thumbnail || item.imageLinks?.original || override?.image || "",
        sellingPrice: baseP,
        basePrice: override?.basePrice || baseP,
        discount: override?.discount || 10,
        stockQuantity: override?.stockQuantity || 20,
        minStockLevel: override?.minStockLevel || 2,
        status: override?.status || "active",
        photographer: photographerName,
        itemType: "photo",
      };
    });

    try {
      const allCats = await Category.find({}).select("name").lean();
      categories = allCats.map((c) => c.name).filter(Boolean);
    } catch {}
  }

  res.status(200).json({
    status: true,
    products,
    categories: Array.from(new Set(categories)).sort(),
    counts: {
      photos: totalPhotosCount,
      artworks: totalArtworksCount,
    },
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  });
});

// @desc    Get single product by ID (handles StoreProduct, Artwork, and ImageVault)
// @route   GET /api/store/products/:id
// @access  Store User
const getStoreProductById = asyncHandler(async (req, res) => {
  const storeId = req.storeId;
  const isManager = req.storeUser?.role === "StoreManager";
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      status: false,
      message: "Invalid product ID",
    });
  }

  let product = null;

  // 1. Try finding by StoreProduct ID
  product = await StoreProduct.findOne({ _id: id, store: storeId })
    .populate({
      path: "artwork",
      select: "title imageLinks photographer category price description keywords location cameraDetails resolutions",
      populate: [
        { path: "photographer", select: "firstName lastName name username" },
        { path: "category", select: "name" },
      ],
    })
    .lean();

  // 2. If not found, check if a StoreProduct exists referencing this artwork/photo
  if (!product) {
    product = await StoreProduct.findOne({ artwork: id, store: storeId })
      .populate({
        path: "artwork",
        select: "title imageLinks photographer category price description keywords location cameraDetails resolutions",
        populate: [
          { path: "photographer", select: "firstName lastName name username" },
          { path: "category", select: "name" },
        ],
      })
      .lean();
  }

  // 3. If not found in StoreProduct, try finding in Artwork (Fine Art)
  if (!product) {
    const artwork = await Artwork.findById(id)
      .populate("photographer", "firstName lastName name username")
      .populate("category", "name")
      .lean();

    if (artwork) {
      const photographerName = artwork.photographer
        ? `${artwork.photographer.firstName || ""} ${artwork.photographer.lastName || ""}`.trim() ||
          artwork.photographer.name ||
          "Artist"
        : "Artist";

      const categoryName = Array.isArray(artwork.category)
        ? artwork.category.map((c) => c?.name).filter(Boolean).join(", ")
        : artwork.category?.name || "Fine Art";

      const baseP = artwork.price?.original || 2000;

      product = {
        _id: artwork._id,
        store: storeId,
        artwork: artwork,
        name: artwork.title || "Untitled Artwork",
        sku: `ART-${artwork._id.toString().slice(-6).toUpperCase()}`,
        category: categoryName,
        description: artwork.description || "",
        image: artwork.imageLinks?.thumbnail || artwork.imageLinks?.original || "",
        sellingPrice: baseP,
        basePrice: baseP,
        costPrice: Math.round(baseP * 0.5),
        discount: 10,
        stockQuantity: 99,
        minStockLevel: 2,
        status: "active",
        itemType: "artwork",
        photographer: photographerName,
      };
    }
  }

  // 4. If not found, try finding in ImageVault (Photo)
  if (!product) {
    const photo = await ImageVault.findById(id)
      .populate("photographer", "firstName lastName name username")
      .populate("category", "name")
      .lean();

    if (photo) {
      const photographerName = photo.photographer
        ? `${photo.photographer.firstName || ""} ${photo.photographer.lastName || ""}`.trim() ||
          photo.photographer.name ||
          "Photographer"
        : "Photographer";

      const categoryName = Array.isArray(photo.category)
        ? photo.category.map((c) => c?.name).filter(Boolean).join(", ")
        : photo.category?.name || "Photography";

      const baseP = photo.price?.original || photo.price?.medium || 2000;

      product = {
        _id: photo._id,
        store: storeId,
        artwork: photo,
        name: photo.title || "Untitled Photo",
        sku: `PHOTO-${photo._id.toString().slice(-6).toUpperCase()}`,
        category: categoryName,
        description: photo.description || "",
        image: photo.imageLinks?.thumbnail || photo.imageLinks?.original || "",
        sellingPrice: baseP,
        basePrice: baseP,
        costPrice: Math.round(baseP * 0.5),
        discount: 10,
        stockQuantity: 99,
        minStockLevel: 2,
        status: "active",
        itemType: "photo",
        photographer: photographerName,
      };
    }
  }

  if (!product) {
    return res.status(404).json({
      status: false,
      message: "Product not found",
    });
  }

  if (!isManager && product.costPrice !== undefined) {
    delete product.costPrice;
  }

  res.status(200).json({
    status: true,
    product,
  });
});

// @desc    Get available real artworks and photos that can be added as store products
// @route   GET /api/store/products/available-artworks
// @access  Store User
const getAvailableArtworksForStore = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 24 } = req.query;
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 24;

  const query = { isActive: true };
  if (search && search.trim()) {
    const regex = new RegExp(search.trim(), "i");
    query.$or = [{ title: regex }, { description: regex }];
  }

  const [totalArtworks, totalPhotos] = await Promise.all([
    Artwork.countDocuments(query),
    ImageVault.countDocuments(query),
  ]);
  const total = totalArtworks + totalPhotos;

  const [artworks, photos] = await Promise.all([
    Artwork.find(query)
      .populate("photographer", "firstName lastName name")
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .lean(),
    ImageVault.find(query)
      .populate("photographer", "firstName lastName name")
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .lean(),
  ]);

  const formatItem = (item, defaultCat) => ({
    _id: item._id,
    title: item.title || "Untitled Artwork",
    image: item.imageLinks?.thumbnail || item.imageLinks?.original || "",
    category: Array.isArray(item.category)
      ? item.category.map((c) => c?.name).filter(Boolean).join(", ")
      : item.category?.name || defaultCat,
    photographer: item.photographer
      ? `${item.photographer.firstName || ""} ${item.photographer.lastName || ""}`.trim() || item.photographer.name || "Artist"
      : "Artist",
    suggestedPrice: item.price?.original || item.price || 0,
    description: item.description || "",
  });

  const combined = [
    ...artworks.map((a) => formatItem(a, "Fine Art")),
    ...photos.map((p) => formatItem(p, "Photography")),
  ].slice(0, limitNum);

  res.status(200).json({
    status: true,
    artworks: combined,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  });
});

// @desc    Create new product in store
// @route   POST /api/store/products
// @access  Store Manager
const createStoreProduct = asyncHandler(async (req, res) => {
  const storeId = req.storeId;
  const {
    artwork,
    name,
    sku,
    category,
    description,
    costPrice = 0,
    basePrice = 0,
    sellingPrice,
    discount = 0,
    stockQuantity = 0,
    minStockLevel = 5,
    status = "active",
    image = "",
  } = req.body;

  if (!name || !sku || sellingPrice === undefined || sellingPrice === null) {
    return res.status(400).json({
      status: false,
      message: "Name, SKU, and Selling Price are required",
    });
  }

  if (sellingPrice < 0 || costPrice < 0 || stockQuantity < 0) {
    return res.status(400).json({
      status: false,
      message: "Prices and stock quantities cannot be negative",
    });
  }

  const existing = await StoreProduct.findOne({
    store: storeId,
    sku: sku.toUpperCase().trim(),
  });
  if (existing) {
    return res.status(400).json({
      status: false,
      message: `Product with SKU "${sku.toUpperCase()}" already exists in this store`,
    });
  }

  const product = await StoreProduct.create({
    store: storeId,
    artwork: artwork || undefined,
    name: name.trim(),
    sku: sku.toUpperCase().trim(),
    category: category ? category.trim() : "General",
    description: description ? description.trim() : "",
    costPrice: Number(costPrice) || 0,
    basePrice: Number(basePrice) || Number(sellingPrice),
    sellingPrice: Number(sellingPrice),
    discount: Number(discount) || 0,
    stockQuantity: Number(stockQuantity) || 0,
    minStockLevel: Number(minStockLevel) || 5,
    status,
    image,
    lastPriceUpdatedBy: req.storeUser._id,
    lastPriceUpdatedAt: new Date(),
    lastStockUpdatedBy: req.storeUser._id,
    lastStockUpdatedAt: new Date(),
  });


  res.status(201).json({
    status: true,
    message: "Product created successfully",
    product,
  });
});

// @desc    Update store product details
// @route   PUT /api/store/products/:id
// @access  Store User (Manager or authorized Staff)
const updateStoreProduct = asyncHandler(async (req, res) => {
  const storeId = req.storeId;
  const isManager = req.storeUser.role === "StoreManager";
  const { id } = req.params;

  const product = await StoreProduct.findOne({ _id: id, store: storeId });
  if (!product) {
    return res.status(404).json({
      status: false,
      message: "Product not found in this store",
    });
  }

  const previousSnapshot = {
    name: product.name,
    sellingPrice: product.sellingPrice,
    stockQuantity: product.stockQuantity,
    status: product.status,
  };

  const {
    name,
    category,
    description,
    costPrice,
    basePrice,
    sellingPrice,
    discount,
    minStockLevel,
    status,
    image,
    keywords,
  } = req.body;

  if (name) product.name = name.trim();
  if (category) product.category = category.trim();
  if (description !== undefined) product.description = description.trim();
  if (image !== undefined) product.image = image;
  if (keywords !== undefined && Array.isArray(keywords)) product.keywords = keywords;
  if (minStockLevel !== undefined) product.minStockLevel = Math.max(0, Number(minStockLevel));
  if (status !== undefined) product.status = status;

  await product.save();


  res.status(200).json({
    status: true,
    message: "Product updated successfully",
    product,
  });
});

// @desc    Toggle product active status
// @route   PATCH /api/store/products/:id/status
// @access  Store Manager
const toggleStoreProductStatus = asyncHandler(async (req, res) => {
  const storeId = req.storeId;
  const { id } = req.params;

  const product = await StoreProduct.findOne({ _id: id, store: storeId });
  if (!product) {
    return res.status(404).json({ status: false, message: "Product not found" });
  }

  const previousStatus = product.status;
  product.status = product.status === "active" ? "inactive" : "active";
  await product.save();


  res.status(200).json({
    status: true,
    message: `Product marked as ${product.status}`,
    product,
  });
});

module.exports = {
  getStoreProducts,
  getStoreProductById,
  getAvailableArtworksForStore,
  createStoreProduct,
  updateStoreProduct,
  toggleStoreProductStatus,
};
