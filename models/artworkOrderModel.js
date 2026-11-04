const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    userInfo: {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "userInfo.userType",
        required: true,
      },
      userType: {
        type: String,
        enum: ["User", "Photographer"],
        required: true,
      },
    },
    orderItems: [
      {
        imageInfo: {
          image: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Artwork",
          },
          photographer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Photographer",
          },
          resolution: {
            type: String,
            enum: ["original", "thumbnail"],
          },
          price: {
            type: Number,
          },
          initialPrice: {
            type: Number,
          },
          discount: {
            type: Number,
          },
        },
        frameInfo: {
          frame: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Frame",
          },
          price: {
            type: Number,
          },
          size: {
            width: { type: Number },
            height: { type: Number },
          },
          initialPrice: {
            type: Number,
          },
          discount: {
            type: Number,
          },
        },
        paperInfo: {
          paper: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Paper",
          },
          price: {
            type: Number,
          },
          size: {
            width: { type: Number },
            height: { type: Number },
          },
          initialPrice: {
            type: Number,
          },
          discount: {
            type: Number,
          },
        },
        mountInfo: {
          mount: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Mount",
          },
          name: {
            type: String,
          },
          color: {
            name: { type: String },
            hex: { type: String },
          },
          thickness: {
            type: Number,
          },
          price: {
            type: Number,
          },
        },
        printType: { type: String },
        finishingOption: { type: String },
        store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
        storeName: { type: String },
        subTotal: {
          type: Number,
          required: true,
        },
        initialSubTotal: {
          type: Number,
        },
        finalPrice: {
          type: Number,
        },
        sgst: {
          type: Number,
        },
        cgst: {
          type: Number,
        },
        totalGST: {
          type: Number,
        },
      },
    ],
    gst: {
      type: String,
      required: false,
    },
    orderStatus: {
      type: String,
      enum: ["pending", "completed", "cancelled", "failed"],
      default: "pending",
    },
    printStatus: {
      type: String,
      enum: [
        "no-print",
        "processing",
        "printing",
        "packed",
        "shipped",
        "delivered",
        "returned",
      ],
      default: "no-print",
    },
    isPaid: {
      type: Boolean,
      default: true,
    },
    paymentMethod: {
      type: String,
    },
    invoiceId: {
      type: String,
    },
    invoiceNumber: {
      type: String,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    finalAmount: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
    },
    shippingAddress: {
      address: { type: String },
      country: { type: String },
      city: { type: String },
      landmark: { type: String },
      area: { type: String },
      mobile: { type: Number },
      email: { type: String },
      pincode: { type: String },
      state: { type: String },
    },
    waybill: {
      type: String,
      required: false,
    },
    readyToShip: {
      type: Boolean,
      default: false,
    },
    readyToShipTimeStamp: {
      type: Date,
    },
    pickupId: {
      type: Number,
    },
    deliveryCharge: {
      type: Boolean,
    },
    deliveryChargeAmount: {
      type: Number,
    },
    platformFees: {
      type: Boolean,
    },
    platformFeesAmount: {
      type: Number,
    },
    gstCharge: {
      type: Boolean,
    },
    gstChargeAmount: {
      type: Number,
    },
    sgstAmount: {
      type: Number,
    },
    cgstAmount: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ArtworkOrder", orderSchema);

// gstPriceForThatItem = sgst + cgst
