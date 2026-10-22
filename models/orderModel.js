const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    userInfo: {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "userInfo.userType",
        required: false,
      },
      userType: {
        type: String,
        enum: ["User", "Photographer"],
        required: false,
      },
    },
    orderItems: [
      {
        imageInfo: {
          image: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "orderItems.imageInfo.imageModel",
          },
          imageModel: {
            type: String,
            enum: ["ImageVault", "Artwork"],
            default: "ImageVault",
          },
          photographer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Photographer",
          },
          resolution: {
            type: String,
            enum: ["original", "medium", "small"],
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
        subTotal: {
          type: Number,
          required: false,
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
        // Store item compatibility fields
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "StoreProduct",
        },
        name: { type: String },
        sku: { type: String },
        image: { type: String },
        quantity: { type: Number, default: 1 },
        unitPrice: { type: Number },
        discount: { type: Number },
        total: { type: Number },
        printType: { type: String },
        paper: { type: String },
        size: { type: String },
        frame: { type: String },
        mount: { type: String },
        floaterFrame: { type: String },
      },
    ],
    gst: {
      type: String,
      required: false,
    },
    orderStatus: {
      type: String,
      enum: [
        "pending",
        "processing",
        "ready_for_pickup",
        "completed",
        "cancelled",
        "failed",
      ],
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
    orderNumber: {
      type: String,
      index: true,
    },
    orderSource: {
      type: String,
      enum: ["ONLINE", "STORE", "SHOP", "online", "store", "shop"],
      default: "ONLINE",
      uppercase: true,
      index: true,
    },
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      index: true,
    },
    customer: {
      name: { type: String, default: "Walk-in Customer" },
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
      address: {
        street: { type: String, default: "" },
        city: { type: String, default: "" },
        state: { type: String, default: "" },
        pincode: { type: String, default: "" },
        country: { type: String, default: "India" },
      },
      gst: { type: String, default: "" },
    },
    items: [],
    subtotal: {
      type: Number,
    },
    coupon: {
      type: mongoose.Schema.Types.Mixed,
    },
    priceAdjustment: {
      type: Number,
      default: 0,
    },
    discountTotal: {
      type: Number,
      default: 0,
    },
    taxableAmount: {
      type: Number,
      default: 0,
    },
    taxTotal: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StoreUser",
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    finalAmount: {
      type: Number,
      required: false,
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

module.exports = mongoose.model("Order", orderSchema);

// gstPriceForThatItem = sgst + cgst
