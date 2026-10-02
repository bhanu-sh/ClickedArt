const mongoose = require("mongoose");

const storeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Store name is required"],
      trim: true,
    },
    storeCode: {
      type: String,
      required: [true, "Store code is required"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Store email is required"],
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: [true, "Store phone is required"],
      trim: true,
    },
    address: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
      country: { type: String, default: "India" },
    },
    operatingHours: {
      type: String,
      default: "9:00 AM - 9:00 PM (Mon - Sat)",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    settings: {
      currency: { type: String, default: "INR" },
      currencySymbol: { type: String, default: "₹" },
      taxRate: { type: Number, default: 18 },
      lowStockThreshold: { type: Number, default: 5 },
      receiptNotes: {
        type: String,
        default: "Thank you for shopping with ClickedArt Store!",
      },
    },
  },
  {
    timestamps: true,
  }
);

const Store = mongoose.model("Store", storeSchema);

module.exports = Store;
