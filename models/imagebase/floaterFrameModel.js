const mongoose = require("mongoose");

const floaterFrameSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    color: {
      type: String,
      default: "",
    },
    colorCode: {
      type: String,
      default: "#18181b",
    },
    image: [
      {
        type: String,
      },
    ],
    material: {
      type: String,
      required: true,
      default: "Wood",
    },
    style: {
      type: String,
      required: true,
      default: "Floater",
    },
    thickness: {
      type: Number,
      required: true,
      default: 1.5,
    },
    initialBasePrice: {
      type: Number,
      required: true,
    },
    basePricePerLinearInch: {
      type: Number,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    photographerDiscount: {
      type: Number,
      default: 0,
    },
    userDiscount: {
      type: Number,
      default: 0,
    },
    photographerFinalPrice: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FloaterFrame", floaterFrameSchema);
