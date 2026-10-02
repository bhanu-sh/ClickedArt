const mongoose = require("mongoose");

const storeProductSchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    artwork: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Artwork",
      required: false,
    },
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    sku: {
      type: String,
      required: [true, "SKU is required"],
      uppercase: true,
      trim: true,
    },
    category: {
      type: String,
      default: "General",
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    costPrice: {
      type: Number,
      default: 0,
      min: [0, "Cost price cannot be negative"],
    },
    basePrice: {
      type: Number,
      default: 0,
      min: [0, "Base price cannot be negative"],
    },
    sellingPrice: {
      type: Number,
      required: [true, "Selling price is required"],
      min: [0, "Selling price cannot be negative"],
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, "Discount cannot be negative"],
      max: [100, "Discount cannot exceed 100%"],
    },
    stockQuantity: {
      type: Number,
      default: 0,
      min: [0, "Stock quantity cannot be negative"],
    },
    reservedStock: {
      type: Number,
      default: 0,
      min: [0, "Reserved stock cannot be negative"],
    },
    minStockLevel: {
      type: Number,
      default: 5,
      min: [0, "Minimum stock level cannot be negative"],
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    image: {
      type: String,
      default: "",
    },
    keywords: {
      type: [String],
      default: [],
    },
    lastPriceUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StoreUser",
    },
    lastPriceUpdatedAt: {
      type: Date,
    },
    lastStockUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StoreUser",
    },
    lastStockUpdatedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure SKU is unique per store
storeProductSchema.index({ store: 1, sku: 1 }, { unique: true });

// Virtual for available stock
storeProductSchema.virtual("availableStock").get(function () {
  return Math.max(0, (this.stockQuantity || 0) - (this.reservedStock || 0));
});

// Virtual for final selling price after discount
storeProductSchema.virtual("finalPrice").get(function () {
  const discountAmount = ((this.sellingPrice || 0) * (this.discount || 0)) / 100;
  return Math.max(0, Math.round((this.sellingPrice || 0) - discountAmount));
});

storeProductSchema.set("toJSON", { virtuals: true });
storeProductSchema.set("toObject", { virtuals: true });

const StoreProduct = mongoose.model("StoreProduct", storeProductSchema);

module.exports = StoreProduct;
