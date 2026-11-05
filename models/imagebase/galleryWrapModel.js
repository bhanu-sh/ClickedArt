const mongoose = require("mongoose");

const galleryWrapSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    image: {
      type: String,
    },
    material: {
      type: String,
      required: true,
    },
    thickness: {
      type: Number,
      required: true,
      default: 20,
    },
    initialBasePrice: {
      type: Number,
      required: false,
      default: function () {
        return this.basePricePerSquareInch || 0;
      },
    },
    basePricePerSquareInch: {
      type: Number,
      required: true,
    },
    photographerDiscount: {
      type: Number,
      required: false,
      default: 0,
    },
    userDiscount: {
      type: Number,
      required: false,
      default: 0,
    },
    extraPrice: {
      type: Number,
      required: false,
      default: 0,
    },
    hasExtraPrice: {
      type: Boolean,
      default: false,
    },
    customDimensions: [
      {
        width: { type: Number, required: true },
        height: { type: Number, required: true },
        initialPrice: {
          type: Number,
          required: false,
          default: function () {
            return this.price || 0;
          },
        },
        price: { type: Number, required: true },
        extraPrice: {
          type: Number,
          required: false,
          default: 0,
        },
      },
    ],
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GalleryWrap", galleryWrapSchema);

