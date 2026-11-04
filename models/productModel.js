const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, "Product price is required"],
      min: [0, "Product price cannot be negative"],
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, "Discount cannot be negative"],
      max: [100, "Discount cannot exceed 100%"],
    },
    discountedPrice: {
      type: Number,
      default: null,
      min: [0, "Discounted price cannot be negative"],
    },
    description: {
      type: String,
      required: [true, "Product description is required"],
      trim: true,
    },
    images: {
      type: [String],
      default: [],
    },
    mainImage: {
      type: String,
      default: "",
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShopCategory",
      default: null,
    },
    stock: {
      type: Number,
      default: 0,
      min: [0, "Stock cannot be negative"],
    },
  },
  {
    timestamps: true,
  }
);

// Fallback mainImage to first image before saving if mainImage is empty
productSchema.pre("save", function (next) {
  if (!this.mainImage && this.images && this.images.length > 0) {
    this.mainImage = this.images[0];
  }
  next();
});

const Product = mongoose.model("Product", productSchema);

module.exports = Product;
