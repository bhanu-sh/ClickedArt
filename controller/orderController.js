const mongoose = require("mongoose");
const Order = require("../models/orderModel");
const Photographer = require("../models/photographerModel");
const LayoutContent = require("../models/layoutContentModel");
const Store = require("../models/storeModel");
const UserType = require("../models/typeModel");
const asyncHandler = require("express-async-handler");
const ImageVault = require("../models/imagebase/imageVaultModel");
const GST = require("../models/gstModel");
const Coupon = require("../models/couponModel");
const ReferralBalance = require("../models/referralBalanceModel");
const User = require("../models/userModel.js");
const Referral = require("../models/referralModel.js");
const Paper = require("../models/imagebase/paperModel");
const Frame = require("../models/imagebase/frameModel.js");
const Mount = require("../models/imagebase/mountModel");
const { getAvailableMounts } = require("../utils/mountValidator");
const Razorpay = require("razorpay");
const Monetization = require("../models/monetizationModel.js");
const ImageAnalytics = require("../models/imagebase/imageAnalyticsModel.js");
const { sendOrderThankYouMail } = require("../middleware/handleEmail.js");
const BuyerCounter = require("../models/buyerCounterModel.js");
const moment = require("moment");
const {
  registerDeliveryFromOrder,
} = require("../controller/deliveryController.js");
const {
  sendNotificationToUser,
} = require("../middleware/notificationUtils.js");
const { default: axios } = require("axios");
const validator = require("validator");
const bcrypt = require("bcrypt");

const getCounter = async (financialYear) => {
  const counterDoc = await BuyerCounter.findOne({ financialYear }).sort({
    createdAt: -1,
  });
  if (!counterDoc) {
    await BuyerCounter.create({ financialYear, counter: 0 });
    return 1;
  }
  return counterDoc.counter + 1;
};

const incrementCounter = async (financialYear) => {
  await BuyerCounter.findOneAndUpdate(
    { financialYear },
    { $inc: { counter: 1 } },
    { new: true }
  );
  return;
};

const deleteOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.query;

  if (!orderId) {
    res.status(400);
    throw new Error("Order Id is required to delete");
  }

  await Order.findByIdAndDelete(orderId);
  res.status(200).send({ message: "Order deleted" });
});

const createOrder = asyncHandler(async (req, res) => {
  const incomingSource = (
    req.body.orderSource ||
    (req.body.userInfo && !req.body.userId ? "STORE" : "ONLINE")
  ).toUpperCase();

  // If order source is STORE, store it in the exact same structure as an online order
  // The only difference is orderSource:"store"
  if (incomingSource === "STORE") {
    const {
      userInfo: storeUserInfo,
      orderItems: storeOrderItems,
      paymentMethod = "cash",
      shippingAddress: storeShippingAddress,
      discount: storeDiscount,
      finalAmount: storeFinalAmount,
      totalAmount: storeTotalAmount,
      invoiceId: storeInvoiceId,
      gst: storeGst,
      printStatus: storePrintStatus,
      taxableAmount: reqTaxableAmount,
      cgst: reqCgst,
      sgst: reqSgst,
    } = req.body;

    if (!storeOrderItems || !Array.isArray(storeOrderItems) || storeOrderItems.length === 0) {
      return res.status(400).json({ status: false, message: "Order must contain at least one item" });
    }

    // Resolve the user from userInfo
    let resolvedUserId = storeUserInfo?.user;
    let resolvedUserType = storeUserInfo?.userType || "User";

    if (!resolvedUserId) {
      return res.status(400).json({ status: false, message: "userInfo.user is required for store orders" });
    }

    // Validate the user actually exists in the correct model
    let userDoc = null;
    if (resolvedUserType === "Photographer") {
      userDoc = await Photographer.findById(resolvedUserId);
    } else {
      userDoc = await User.findById(resolvedUserId);
    }
    if (!userDoc) {
      return res.status(400).json({ status: false, message: "User not found" });
    }

    const layoutContent = await LayoutContent.findOne({});
    const isGstActive = layoutContent?.charges?.gst || false;

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const financialYear =
      currentMonth < 3
        ? `${currentYear - 1}-${currentYear.toString().slice(-2)}`
        : `${currentYear}-${(currentYear + 1).toString().slice(-2)}`;

    let invoiceNumber = req.body.invoiceNumber;
    if (!invoiceNumber) {
      try {
        const nextCounter = await getCounter(financialYear);
        invoiceNumber = `CAB/${financialYear}/${nextCounter.toString().padStart(4, "0")}`;
        await incrementCounter(financialYear);
      } catch (cntErr) {
        const randomSeq = Math.floor(1000 + Math.random() * 9000);
        invoiceNumber = `CAB/${financialYear}/${randomSeq}`;
      }
    }

    const invoiceId = storeInvoiceId || invoiceNumber;

    // Build order items with GST
    const updatedItems = storeOrderItems.map((item) => {
      const finalPrice = item.finalPrice || 0;
      const sgstItem = isGstActive ? finalPrice * 0.09 : 0;
      const cgstItem = isGstActive ? finalPrice * 0.09 : 0;
      const totalGSTItem = sgstItem + cgstItem;
      return {
        ...item,
        sgst: sgstItem,
        cgst: cgstItem,
        totalGST: totalGSTItem,
      };
    });

    const hasPaper = updatedItems.some((item) => item.paperInfo && item.paperInfo.paper);

    let totalAmount = storeTotalAmount;
    if (totalAmount == null) {
      totalAmount = updatedItems.reduce((sum, it) => sum + (it.finalPrice || 0), 0);
    }

    const totalSgst = updatedItems.reduce((sum, it) => sum + (it.sgst || 0), 0);
    const totalCgst = updatedItems.reduce((sum, it) => sum + (it.cgst || 0), 0);
    const totalGSTAmount = totalSgst + totalCgst;

    const computedFinalAmount = storeFinalAmount != null
      ? storeFinalAmount
      : Number((totalAmount + totalGSTAmount).toFixed(2));

    const resolvedStoreId =
      req.storeId ||
      req.store?._id ||
      req.body.store ||
      (await Store.findOne({ status: "active" }))?._id;
    const resolvedCreatedBy = req.storeUser?._id || req.body.createdBy;

    const newOrder = await Order.create({
      orderSource: "store",
      store: resolvedStoreId,
      createdBy: resolvedCreatedBy,
      orderNumber: req.body.orderNumber || invoiceNumber,
      userInfo: { user: resolvedUserId, userType: resolvedUserType },
      customer: {
        name:
          `${userDoc.firstName || ""} ${userDoc.lastName || ""}`.trim() ||
          userDoc.name ||
          "Store Customer",
        email: userDoc.email || "",
        phone: userDoc.mobile || userDoc.phone || "",
        address: {
          street: storeShippingAddress?.address || "Store Purchase",
          city: storeShippingAddress?.city || "",
          state: storeShippingAddress?.state || "",
          pincode: storeShippingAddress?.pincode || "",
          country: "India",
        },
        gst: storeGst || "",
      },
      orderItems: updatedItems,
      paymentMethod,
      shippingAddress: storeShippingAddress || {},
      discount: storeDiscount || 0,
      totalAmount,
      finalAmount: computedFinalAmount,
      orderStatus: req.body.orderStatus || "completed",
      invoiceId,
      isPaid: true,
      gst: storeGst || "",
      printStatus: storePrintStatus || (hasPaper ? "processing" : "delivered"),
      invoiceNumber,
      gstCharge: isGstActive,
      gstChargeAmount: Number(totalGSTAmount.toFixed(2)),
      sgstAmount: Number(totalSgst.toFixed(2)),
      cgstAmount: Number(totalCgst.toFixed(2)),
      deliveryCharge: false,
      platformFees: false,
      readyToShip: false,
    });

    return res.status(201).json({
      status: true,
      message: "Store order recorded successfully",
      order: newOrder,
    });
  }

  // --- ONLINE ORDER FLOW (UNCHANGED) ---

  const {
    userId,
    orderItems,
    paymentMethod,
    shippingAddress,
    discount,
    finalAmount,
    orderStatus,
    invoiceId,
    coupon,
    isPaid,
    gst,
    printStatus,
    link,
  } = req.body;

  const userType = await UserType.findOne({ user: userId }).select("type -_id");
  const type = userType?.type || null;

  const orderExist = await Order.findOne({ "userInfo.user": userId });

  const layoutContent = await LayoutContent.findOne({});
  const deliveryCharge = layoutContent?.charges?.delivery || false;
  const platformFees = layoutContent?.charges?.platform || false;
  const isGstActive = layoutContent?.charges?.gst || false;

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const financialYear =
    currentMonth < 3
      ? `${currentYear - 1}-${currentYear.toString().slice(-2)}`
      : `${currentYear}-${(currentYear + 1).toString().slice(-2)}`;

  const nextCounter = await getCounter(financialYear);
  let invoiceNumber = nextCounter.toString().padStart(4, "0");
  invoiceNumber = `CAB/${financialYear}/${invoiceNumber}`;

  const groupedOrders = orderItems.reduce((acc, item) => {
    const originalValue =
      item.initialSubTotal || item.imageInfo?.initialPrice || 0;
    const photographerId = item.imageInfo?.photographer;

    if (photographerId && originalValue >= 0) {
      if (!acc[photographerId]) acc[photographerId] = [];
      acc[photographerId].push(item);
    } else if (originalValue >= 0) {
      const printKey = `print-${acc.nextPrintId || 1}`;
      acc[printKey] = [item];
      acc.nextPrintId = (acc.nextPrintId || 1) + 1;
    }
    return acc;
  }, {});

  delete groupedOrders.nextPrintId;

  const orders = [];
  for (const [key, items] of Object.entries(groupedOrders)) {
    let totalAmount = 0;
    let discountForEachOrder = 0;

    const updatedItems = [];
    let totalDeliveryCharge = 0;
    for (let item of items) {
      let finalPrice = item.finalPrice || 0;
      let itemDiscount =
        (item.imageInfo?.discount || 0) +
        (item.frameInfo?.discount || 0) +
        (item.paperInfo?.discount || 0);

      // Apply Photographer discount from Paper model if userType is Photographer
      // if (type === "Photographer" && item.paperInfo?.paper) {
      //   const paper = await Paper.findById(item.paperInfo.paper).select(
      //     "photographerDiscount"
      //   );
      //   if (paper?.photographerDiscount) {
      //     const photographerDiscountAmount =
      //       (finalPrice * paper.photographerDiscount) / 100;
      //     itemDiscount += photographerDiscountAmount;
      //     finalPrice -= photographerDiscountAmount; // subtract before GST
      //   }
      // }

      const sgst = isGstActive ? finalPrice * 0.09 : 0;
      const cgst = isGstActive ? finalPrice * 0.09 : 0;
      const totalGST = sgst + cgst || 0;

      if (!item.paperInfo || !item.paperInfo.size) {
        totalDeliveryCharge += 0;
      } else if (deliveryCharge) {
        totalDeliveryCharge += await calculateDelhiveryCharge(
          item.paperInfo.size.width,
          item.paperInfo.size.height,
          !!item.frameInfo?.frame,
          shippingAddress.pincode
        );
      }

      let mountInfo = undefined;
      if (item.mountInfo && (item.mountInfo.mount || item.mountInfo.name)) {
        mountInfo = {
          name: item.mountInfo.name || "Mount",
          color: typeof item.mountInfo.color === 'object' && item.mountInfo.color.hex
            ? item.mountInfo.color
            : { name: item.mountInfo.color || "Default", hex: item.mountInfo.color || "#000000" },
          thickness: Number(item.mountInfo.thickness || 0),
          price: Number(item.mountInfo.price || 0),
        };
        if (item.mountInfo.mount && item.mountInfo.mount !== "null" && item.mountInfo.mount !== "") {
          mountInfo.mount = item.mountInfo.mount;
        }
      }

      updatedItems.push({
        ...item,
        mountInfo,
        sgst,
        cgst,
        totalGST,
      });

      totalAmount += finalPrice;
      discountForEachOrder += itemDiscount;
    }

    const hasPaper = updatedItems.some(
      (item) => item.paperInfo && item.paperInfo.paper
    );

    const totalSgst = updatedItems.reduce((sum, item) => sum + (item.sgst || 0), 0);
    const totalCgst = updatedItems.reduce((sum, item) => sum + (item.cgst || 0), 0);
    const totalGSTAmount = totalSgst + totalCgst;

    const order = new Order({
      orderSource: "ONLINE",
      userInfo: {
        user: userId,
        userType: type,
      },
      orderItems: updatedItems,
      paymentMethod,
      shippingAddress,
      discount: discountForEachOrder,
      totalAmount,
      orderStatus,
      invoiceId,
      finalAmount,
      isPaid,
      gst,
      printStatus: hasPaper ? "processing" : "no-print",
      invoiceNumber,
      gstCharge: isGstActive,
      gstChargeAmount: Number(totalGSTAmount.toFixed(2)),
      sgstAmount: Number(totalSgst.toFixed(2)),
      cgstAmount: Number(totalCgst.toFixed(2)),
      deliveryCharge: updatedItems.every((item) => item.subTotal > 0)
        ? deliveryCharge
        : false,
      platformFees,
      platformFeesAmount: platformFees
        ? Number(
          (
            (totalAmount +
              (deliveryCharge ? totalDeliveryCharge : 0) +
              (isGstActive ? (totalAmount + (totalDeliveryCharge || 0)) * 0.18 : 0)) *
            0.02
          ).toFixed(2)
        )
        : 0,
      deliveryChargeAmount: deliveryCharge ? totalDeliveryCharge : 0,
    });

    const savedOrder = await order.save();
    orders.push(savedOrder);
  }

  await incrementCounter(financialYear);

  if (coupon) {
    const couponData = await Coupon.findOne({ code: coupon });
    if (couponData) {
      couponData.usageCount += 1;
      couponData.users.push({ user: userId, userType: type });
      await couponData.save();
    }
  }

  const Model = type === "User" ? User : Photographer;
  const user = await Model.findOne({ _id: userId });

  if (user && user.referralcode && !orderExist) {
    const referral = await Referral.findOne({ code: user.referralcode });
    if (referral && referral.applicableTo === "user") {
      const commissionRate = referral.commissionRate;
      const price = (orders[0].finalAmount * 100) / (100 + 18);
      const balance = Math.round(price * (commissionRate / 100));

      await ReferralBalance.create({
        photographer: referral.photographer,
        amount: balance,
      });
    }
  }

  const customerName = `${user.firstName} ${user.lastName}`;
  const customerEmail = user.email;
  const orderDate = moment().format("dddd, MMMM Do YYYY");
  let itemNames = [];

  for (let item of orderItems) {
    if (item.imageInfo && item.imageInfo.image) {
      const image = await ImageVault.findById(item.imageInfo.image);
      if (image && image.title) itemNames.push(image.title);

      if (image && image._id) {
        const downloads = await Order.countDocuments({
          "orderItems.imageInfo.image": image._id,
        });

        await ImageAnalytics.findOneAndUpdate(
          { image: image._id },
          { downloads }
        );
      }
    }

    if (item.frameInfo && item.frameInfo.frame) {
      const frame = await Frame.findById(item.frameInfo.frame).select("name");
      if (frame && frame.name) itemNames.push(frame.name);
    }

    if (item.paperInfo && item.paperInfo.paper) {
      const paper = await Paper.findById(item.paperInfo.paper).select("name");
      if (paper && paper.name) itemNames.push(paper.name);
    }
  }

  const items = itemNames;
  const s3Links = orders.map((ord) => `https://clickedart.com/bill/${ord._id}`);

  await sendOrderThankYouMail(
    customerName,
    orderDate,
    items,
    customerEmail,
    s3Links
  );

  for (const ord of orders) {
    const order = await Order.findOne({ _id: ord._id }).populate(
      "userInfo.user"
    );

    if (!order) {
      console.error(`Order not found for ID: ${ord._id}`);
      continue;
    }

    if (order.printStatus === "no-print") continue;

    console.log("Fetched Order:", order);
    await registerDeliveryFromOrder(order);
  }

  res.status(201).send(orders);
});

const getAllOrders = asyncHandler(async (req, res) => {
  const { pageNumber = 1, pageSize = 20 } = req.query;

  const orders = await Order.find({})
    .populate({
      path: "orderItems",
      populate: [
        {
          path: "imageInfo.image",
          populate: {
            path: "photographer",
          },
        },
        {
          path: "frameInfo.frame",
        },
        {
          path: "paperInfo.paper",
        },
        {
          path: "imageInfo.photographer",
        },
        {
          path: "mountInfo.mount",
        },
      ],
    })
    .populate("userInfo.user")
    .sort({ createdAt: -1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize);

  if (!orders || orders.length === 0)
    return res.status(400).send({ message: "Order not found" });

  const totalDocuments = await Order.countDocuments({});
  const pageCount = Math.ceil(totalDocuments / pageSize);

  res.status(200).send({ orders, pageCount });
});

const getFailedOrders = asyncHandler(async (req, res) => {
  const { pageNumber = 1, pageSize = 20 } = req.query;

  const orders = await Order.find({ orderStatus: "failed" })
    .populate({
      path: "orderItems",
      populate: [
        {
          path: "imageInfo.image",
          populate: {
            path: "photographer",
          },
        },
        {
          path: "frameInfo.frame",
        },
        {
          path: "paperInfo.paper",
        },
        {
          path: "imageInfo.photographer",
        },
        {
          path: "mountInfo.mount",
        },
      ],
    })
    .populate("userInfo.user")
    .sort({ createdAt: -1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize);

  if (!orders || orders.length === 0)
    return res.status(400).send({ message: "Order not found" });

  const totalDocuments = await Order.countDocuments({ orderStatus: "failed" });
  const pageCount = Math.ceil(totalDocuments / pageSize);

  res.status(200).send({ orders, pageCount });
});

const getMyOrders = asyncHandler(async (req, res) => {
  const { userId, pageNumber = 1, pageSize = 20 } = req.query;
  const orders = await Order.find({ "userInfo.user": userId })
    .populate({
      path: "orderItems",
      populate: [
        {
          path: "imageInfo.image",
          select:
            "imageLinks.thumbnail photographer  resolutions title description story keywords category photographer license price location cameraDetails",
          populate: {
            path: "photographer",
          },
        },
        {
          path: "frameInfo.frame",
        },
        {
          path: "paperInfo.paper",
        },
        {
          path: "imageInfo.photographer",
        },
        {
          path: "mountInfo.mount",
        },
      ],
    })
    .populate("userInfo.user")
    .sort({ createdAt: -1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize);

  if (!orders || orders.length === 0) {
    res.status(400);
    throw new Error("Order not found");
  }

  const totalDocuments = await Order.countDocuments({
    "userInfo.user": userId,
  });
  const pageCount = Math.ceil(totalDocuments / pageSize);

  res.status(200).send({ orders, pageCount });
});

const getOrdersByPhotographer = asyncHandler(async (req, res) => {
  const { photographer, pageNumber = 1, pageSize = 20 } = req.query;

  const orders = await Order.find({
    "orderItems.imageInfo.photographer": photographer,
    orderStatus: "completed",
  })
    .populate({
      path: "orderItems",
      populate: [
        {
          path: "imageInfo.image",
          select:
            "imageLinks.thumbnail photographer  resolutions title description story keywords category photographer license price location cameraDetails",
          populate: {
            path: "photographer",
          },
        },
        {
          path: "frameInfo.frame",
        },
        {
          path: "paperInfo.paper",
        },
        {
          path: "imageInfo.photographer",
        },
        {
          path: "mountInfo.mount",
        },
      ],
    })
    .populate("userInfo.user")
    .sort({ createdAt: -1 })
    .skip((pageNumber - 1) * pageSize);

  if (!orders || orders.length === 0) {
    res.status(404);
    throw new Error("No Orders Found");
  }

  const totalDocuments = await Order.countDocuments({
    "orderItems.imageInfo.photographer": photographer,
  });
  const pageCount = Math.ceil(totalDocuments / pageSize);

  res.status(200).send({ orders, pageCount });
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const orderId = req.body.orderId || req.params.id;
  const orderStatus = req.body.orderStatus || req.body.newStatus;
  const { notes } = req.body;

  if (!orderStatus || !orderId) {
    res.status(400);
    throw new Error("Order Status and Order Id is required to update");
  }

  let order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  const validStatusTypes = new Set([
    "pending",
    "processing",
    "ready_for_pickup",
    "completed",
    "cancelled",
    "failed",
  ]);

  if (!validStatusTypes.has(orderStatus)) {
    res.status(400);
    throw new Error("Invalid order status");
  }

  order.orderStatus = orderStatus;
  if (notes) {
    order.notes = order.notes ? `${order.notes}\n${notes}` : notes;
  }

  if (orderStatus === "cancelled" || orderStatus === "pending") {
    order.isPaid = false;
  } else if (orderStatus === "completed" || orderStatus === "ready_for_pickup") {
    order.isPaid = true;
  }

  if (order.userInfo?.user) {
    await sendNotificationToUser({
      userId: order.userInfo.user,
      userType: order.userInfo.userType,
      title: `Order Status Updated`,
      body: `Your order is now: ${
        orderStatus?.slice(0, 1).toUpperCase() + orderStatus?.slice(1)
      }`,
      type: "order",
      data: {
        url: `${
          order.userInfo.userType === "User" ? "clickedart" : "clickedartartist"
        }://${order.printStatus === "no-print" ? "digitalorder" : "printorder"}/${
          order._id
        }`,
      },
    }).catch((e) => console.log("Notification error:", e.message));
  }

  await order.save();
  res.status(200).send({
    status: true,
    message: "Order status updated",
    order,
  });
});

const getOrderById = asyncHandler(async (req, res) => {
  const orderId = req.query.orderId || req.params.id;

  if (!orderId)
    return res.status(400).send({ message: "Order Id is required" });

  let order = await Order.findById(orderId)
    .populate({
      path: "orderItems",
      populate: [
        {
          path: "imageInfo.image",
          select:
            "imageLinks.thumbnail photographer resolutions title description story keywords category photographer license price location cameraDetails featuredArtwork notForSale",
          populate: {
            path: "photographer",
          },
        },
        {
          path: "frameInfo.frame",
        },
        {
          path: "paperInfo.paper",
        },
        {
          path: "imageInfo.photographer",
        },
        {
          path: "mountInfo.mount",
        },
      ],
    })
    .populate("userInfo.user")
    .populate("store", "name storeCode city state address email phone");

  if (!order) {
    return res.status(404).send({ status: false, message: "Order not found" });
  }

  const orderObj = order.toObject ? order.toObject() : JSON.parse(JSON.stringify(order));

  // 1. Ensure userInfo.user exists with firstName / lastName
  if (!orderObj.userInfo?.user?.firstName) {
    const rawName = (orderObj.customer?.name || orderObj.userInfo?.user?.name || "Walk-in Customer").trim();
    const parts = rawName.split(/\s+/);
    const firstName = parts[0] || "Walk-in";
    const lastName = parts.slice(1).join(" ") || "";
    orderObj.userInfo = {
      ...orderObj.userInfo,
      user: {
        ...(typeof orderObj.userInfo?.user === "object" ? orderObj.userInfo.user : {}),
        firstName: orderObj.userInfo?.user?.firstName || firstName,
        lastName: orderObj.userInfo?.user?.lastName || lastName,
        email: orderObj.userInfo?.user?.email || orderObj.customer?.email || "",
        mobile: orderObj.userInfo?.user?.mobile || orderObj.customer?.phone || "",
      },
      userType: orderObj.userInfo?.userType || "User",
    };
  }

  // 2. Ensure shippingAddress exists
  if (!orderObj.shippingAddress?.address) {
    const custAddr = orderObj.customer?.address || {};
    const isCustAddrObj = typeof custAddr === "object" && custAddr !== null && !Array.isArray(custAddr);
    const storeAddr = orderObj.store?.address || {};

    const street =
      (isCustAddrObj ? (custAddr.street || custAddr.address || custAddr.line1) : (typeof custAddr === "string" ? custAddr : "")) ||
      orderObj.customer?.street ||
      storeAddr.street ||
      (orderObj.store?.name ? `${orderObj.store.name}, ${orderObj.store.city || storeAddr.city || ""}` : "Store Purchase");

    const city =
      (isCustAddrObj ? custAddr.city : "") ||
      orderObj.customer?.city ||
      storeAddr.city ||
      orderObj.store?.city ||
      "";

    const state =
      (isCustAddrObj ? custAddr.state : "") ||
      orderObj.customer?.state ||
      storeAddr.state ||
      orderObj.store?.state ||
      "";

    const pincode =
      (isCustAddrObj ? custAddr.pincode : "") ||
      orderObj.customer?.pincode ||
      storeAddr.pincode ||
      "";

    const country =
      (isCustAddrObj ? custAddr.country : "") ||
      orderObj.customer?.country ||
      storeAddr.country ||
      "India";

    const mobile =
      orderObj.customer?.phone ? Number(String(orderObj.customer.phone).replace(/\D/g, "")) : undefined;

    orderObj.shippingAddress = {
      address: street,
      city,
      state,
      pincode: String(pincode || ""),
      country,
      mobile,
      email: orderObj.customer?.email || orderObj.store?.email || "",
      landmark: (isCustAddrObj ? custAddr.landmark : "") || "",
      area: (isCustAddrObj ? custAddr.area : "") || "",
    };
  }

  // 3. Ensure gst at root
  if (!orderObj.gst && orderObj.customer?.gst) {
    orderObj.gst = orderObj.customer.gst;
  }

  // 4. Ensure tax amounts
  if (orderObj.gstChargeAmount == null && (orderObj.taxTotal > 0 || orderObj.cgst > 0 || orderObj.sgst > 0)) {
    orderObj.gstChargeAmount = orderObj.taxTotal || ((orderObj.cgst || 0) + (orderObj.sgst || 0));
    orderObj.cgstAmount = orderObj.cgst || orderObj.gstChargeAmount / 2;
    orderObj.sgstAmount = orderObj.sgst || orderObj.gstChargeAmount / 2;
    orderObj.gstCharge = true;
  }

  // 5. Ensure totalAmount is taxableAmount when tax is separated
  if (orderObj.gstChargeAmount > 0 && orderObj.taxableAmount > 0 && orderObj.totalAmount === orderObj.finalAmount) {
    orderObj.totalAmount = orderObj.taxableAmount;
  }

  // 6. Ensure orderItems fields
  if (orderObj.orderItems && Array.isArray(orderObj.orderItems)) {
    orderObj.orderItems = orderObj.orderItems.map((item) => {
      const it = { ...item };
      const itemTaxable = it.finalPrice || it.unitPrice || 0;
      if (it.initialSubTotal == null || it.initialSubTotal === 0) {
        it.initialSubTotal = it.unitPrice || it.subtotal || (itemTaxable + (it.discount || 0)) || itemTaxable;
      }
      if (it.subTotal == null) {
        it.subTotal = itemTaxable;
      }
      if (it.finalPrice == null) {
        it.finalPrice = itemTaxable;
      }
      if (!it.cgst && orderObj.cgstAmount) {
        it.cgst = Math.round(itemTaxable * 0.09 * 100) / 100;
      }
      if (!it.sgst && orderObj.sgstAmount) {
        it.sgst = Math.round(itemTaxable * 0.09 * 100) / 100;
      }
      if (!it.totalGST && (it.cgst || it.sgst)) {
        it.totalGST = Math.round(((it.cgst || 0) + (it.sgst || 0)) * 100) / 100;
      }
      if (!it.imageInfo?.image?.title && it.name) {
        it.imageInfo = it.imageInfo || {};
        it.imageInfo.image = it.imageInfo.image || {};
        if (!it.imageInfo.image.title) {
          it.imageInfo.image.title = it.name;
        }
      }
      return it;
    });
  }

  // Persist background migration if order was stored with missing fields
  if (!order.shippingAddress?.address || !order.userInfo?.user) {
    Order.findByIdAndUpdate(orderId, {
      userInfo: orderObj.userInfo,
      shippingAddress: orderObj.shippingAddress,
      gst: orderObj.gst,
      gstCharge: orderObj.gstCharge,
      gstChargeAmount: orderObj.gstChargeAmount,
      cgstAmount: orderObj.cgstAmount,
      sgstAmount: orderObj.sgstAmount,
      totalAmount: orderObj.totalAmount,
      orderItems: orderObj.orderItems,
    }).catch((err) => console.warn("Background order migration error:", err.message));
  }

  res.status(200).send({ status: true, order: orderObj });
});

const getOrderByStatus = asyncHandler(async (req, res) => {
  const { status, pageNumber = 1, pageSize = 20 } = req.query;

  const validStatusTypes = new Set(["pending", "completed", "cancelled"]);

  if (!validStatusTypes.has(status?.toLowerCase())) {
    return res.status(400).json({ status: false, message: "Invalid Action" });
  }

  const orders = await Order.find({ orderStatus: status })
    .populate({
      path: "orderItems",
      populate: [
        {
          path: "imageInfo.image",
          populate: {
            path: "photographer",
          },
        },
        {
          path: "frameInfo.frame",
        },
        {
          path: "paperInfo.paper",
        },
        {
          path: "imageInfo.photographer",
        },
        {
          path: "mountInfo.mount",
        },
      ],
    })
    .populate("userInfo.user")
    .sort({ createdAt: -1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageNumber);

  if (!orders || orders.length === 0) {
    res.status(404);
    throw new Error("Order not found");
  }

  const totalDocuments = await Order.countDocuments({ orderStatus: status });
  const pageCount = Math.ceil(totalDocuments / pageSize);

  res.status(200).send({ orders, pageCount });
});

const payment = asyncHandler(async (req, res) => {
  const { total, userId } = req.body; // Access from req.body

  if (!total || !userId) {
    res.status(400).json({ message: "Total amount and user ID are required." });
    return;
  }

  const user =
    (await User.findById(userId)) || (await Photographer.findById(userId));

  if (!user) {
    res.status(404).json({ message: "User not found." });
    return;
  }

  const instance = new Razorpay({
    key_id: process.env.RAZOR_PAY_ID,
    key_secret: process.env.RAZOR_PAY_SECRET,
  });

  const result = await instance.orders.create({
    amount: Math.round(total * 100), // Convert amount to paise
    currency: "INR",
    receipt: `receipt_${userId}`,
    notes: {
      userId: user._id,
      key: process.env.RAZOR_PAY_ID,
    },
  });

  res.status(200).json({ result });
});

const calculateCartItemsPrice = async (
  items,
  couponCode,
  photographerId,
  isCustom = false,
  isCustomDiscount = false,
  deliveryPincode
) => {
  try {
    let subtotal = 0;
    let totalFinalPrice = 0;

    let totalPhotographerDiscount = 0;
    let rawCouponDiscount = 0;
    let totalDeliveryCharge = 0;

    const frameIds = items.filter((i) => i.frameId).map((i) => i.frameId);
    const paperIds = items.filter((i) => i.paperId).map((i) => i.paperId);
    const mountIds = items.filter((i) => i.mountId).map((i) => i.mountId);

    const frames = await Frame.find({ _id: { $in: frameIds } });
    const papers = await Paper.find({ _id: { $in: paperIds } });
    const mounts = await Mount.find({ _id: { $in: mountIds } });
    const layoutContent = await LayoutContent.findOne({});
    const coupon = await Coupon.findOne({ code: couponCode });

    const couponDiscountPercentage = coupon?.discountPercentage || 0;
    const maxDiscount = coupon?.maxDiscountAmount || 0;

    for (const item of items) {
      const { imageId, paperId, frameId, mountId, width, height, resolution } = item;
      const area = (width || 0) * (height || 0);

      if (!paperId && imageId && !isCustom) {
        const image = await ImageVault.findById(imageId);

        const imagePrice =
          resolution === "small"
            ? image.price.small
            : resolution === "medium"
              ? image.price.medium
              : image.price.original;

        subtotal += imagePrice;
        totalFinalPrice += imagePrice;

        rawCouponDiscount += imagePrice * (couponDiscountPercentage / 100);

        continue;
      }

      let paperInitialPrice = 0;
      let paperBasePrice = 0;
      let paperFinalPrice = 0;

      if (paperId) {
        const paper = papers.find((p) => p._id.toString() === paperId);
        if (!paper) continue;

        const customDim = paper.customDimensions.find(
          (d) => d.width === width && d.height === height
        );

        paperInitialPrice = area * paper.initialBasePrice;

        paperBasePrice = customDim
          ? customDim.price
          : area * paper.basePricePerSquareInch;

        // USER DISCOUNT (implicit)
        totalPhotographerDiscount += paperInitialPrice - paperBasePrice;

        paperFinalPrice = paperBasePrice;

        // PHOTOGRAPHER DISCOUNT
        if (photographerId && paper.photographerDiscount) {
          const discount = paperBasePrice * (paper.photographerDiscount / 100);

          paperFinalPrice -= discount;
          totalPhotographerDiscount += discount;
        }

        subtotal += paperInitialPrice;
      }

      let frameInitialPrice = 0;
      let frameBasePrice = 0;
      let frameFinalPrice = 0;

      if (frameId) {
        const frame = frames.find((f) => f._id.toString() === frameId);
        if (frame) {
          frameInitialPrice = area * frame.initialBasePrice;
          frameBasePrice = area * frame.basePricePerLinearInch;

          // USER DISCOUNT (implicit)
          totalPhotographerDiscount += frameInitialPrice - frameBasePrice;

          frameFinalPrice = frameBasePrice;

          // PHOTOGRAPHER DISCOUNT
          if (photographerId && frame.photographerDiscount) {
            const discount =
              frameBasePrice * (frame.photographerDiscount / 100);

            frameFinalPrice -= discount;
            totalPhotographerDiscount += discount;
          }

          subtotal += frameInitialPrice;
        }
      }

      let mountInitialPrice = 0;
      let mountBasePrice = 0;
      let mountFinalPrice = 0;

      if (mountId && frameId) {
        const mount = mounts.find((m) => m._id.toString() === mountId);
        if (mount) {
          const available = getAvailableMounts(width, height, mounts);
          if (!available.includes(String(mount.thickness))) {
            throw new Error(`Mount thickness ${mount.thickness} is not allowed for print dimensions ${width}x${height}`);
          }
          mountInitialPrice = area * mount.initialBasePrice;
          const mountUnitPrice = mount.basePricePerUnit || mount.basePricePerLinearInch || 0;
          mountBasePrice = area * mountUnitPrice;

          // USER DISCOUNT (implicit)
          totalPhotographerDiscount += mountInitialPrice - mountBasePrice;

          mountFinalPrice = mountBasePrice;

          // PHOTOGRAPHER DISCOUNT
          if (photographerId && mount.photographerDiscount) {
            const discount = mountBasePrice * (mount.photographerDiscount / 100);

            mountFinalPrice -= discount;
            totalPhotographerDiscount += discount;
          }

          subtotal += mountInitialPrice;
        }
      }

      totalFinalPrice += paperFinalPrice + frameFinalPrice + mountFinalPrice;

      rawCouponDiscount +=
        (paperFinalPrice + frameFinalPrice + mountFinalPrice) * (couponDiscountPercentage / 100);

      if (layoutContent?.charges?.delivery) {
        totalDeliveryCharge += await calculateDelhiveryCharge(
          width,
          height,
          !!frameId,
          deliveryPincode
        );
      }
    }

    const totalCouponDiscount = Math.min(rawCouponDiscount, maxDiscount);
    totalFinalPrice -= totalCouponDiscount;

    const netBeforeCharges =
      subtotal - totalPhotographerDiscount - totalCouponDiscount;

    if (netBeforeCharges >= 3000) {
      totalDeliveryCharge = 0;
    }

    totalFinalPrice += totalDeliveryCharge;

    const isGstActive = layoutContent?.charges?.gst || false;
    const gstCharge = isGstActive ? totalFinalPrice * 0.18 : 0;
    totalFinalPrice += gstCharge;

    if (layoutContent?.charges?.platform) {
      totalFinalPrice += totalFinalPrice * 0.02;
    }

    return Number(totalFinalPrice.toFixed(2));
  } catch (error) {
    console.error(error);
    throw new Error("Server error.");
  }
};

const paymentHandler = asyncHandler(async (req, res) => {
  try {
    const {
      userId,
      items,
      couponCode,
      photographerId,
      isCustom = false,
      isCustomDiscount = false,
      deliveryPincode,
    } = req.body;

    if (!userId || !items || items.length === 0) {
      res
        .status(400)
        .json({ message: "Total amount and user ID are required." });
      return;
    }

    const user =
      (await User.findById(userId)) || (await Photographer.findById(userId));

    if (!user) {
      return res.status(400).send({ message: "User not found" });
    }

    const total = await calculateCartItemsPrice(
      items,
      couponCode,
      photographerId,
      isCustom,
      isCustomDiscount,
      deliveryPincode
    );

    const instance = new Razorpay({
      key_id: process.env.RAZOR_PAY_ID,
      key_secret: process.env.RAZOR_PAY_SECRET,
    });

    const result = await instance.orders.create({
      amount: Math.round(total * 100), // Convert amount to paise
      currency: "INR",
      receipt: `receipt_${userId}`,
      notes: {
        userId: user._id,
        key: process.env.RAZOR_PAY_ID,
      },
    });

    return res.send({ result });
  } catch (e) {
    console.log(e);
    throw new Error("Server error");
  }
});

const getPendingOrders = asyncHandler(async (req, res) => {
  const { pageNumber = 1, pageSize = 20 } = req.query;

  const orders = await Order.find({ orderStatus: "pending" })
    .populate({
      path: "orderItems",
      populate: [
        {
          path: "imageInfo.image",
          populate: {
            path: "photographer",
          },
        },
        {
          path: "frameInfo.frame",
        },
        {
          path: "paperInfo.paper",
        },
        {
          path: "imageInfo.photographer",
        },
        {
          path: "mountInfo.mount",
        },
      ],
    })
    .populate("userInfo.user")
    .sort({ createdAt: -1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize);

  if (!orders || orders.length === 0)
    return res.status(400).send({ message: "Order not found" });

  const totalDocuments = await Order.countDocuments({ orderStatus: "pending" });
  const pageCount = Math.ceil(totalDocuments / pageSize);

  res.status(200).send({ orders, pageCount });
});

// const calculateCartPrice = async (req, res) => {
//   try {
//     const {
//       items,
//       couponCode,
//       photographerId,
//       isCustom = false,
//       isCustomDiscount = false,
//     } = req.body;

//     let totalImagePrice = 0;
//     let totalPaperPrice = 0;
//     let totalFramePrice = 0;
//     let totalFinalPrice = 0;
//     let maxDeliveryCharge = 0;
//     let totalPhotographerDiscount = 0;

//     const frameIds = items
//       ?.filter((item) => item.frameId)
//       .map((item) => item.frameId);
//     const paperIds = items
//       ?.filter((item) => item.paperId)
//       .map((item) => item.paperId);

//     const frames = await Frame.find({ _id: { $in: frameIds } });
//     const papers = await Paper.find({ _id: { $in: paperIds } });

//     const content = await LayoutContent.findOne();

//     for (let item of items) {
//       const { imageId, paperId, frameId, width, height, resolution } = item;

//       const image = await ImageVault.findById(imageId);
//       if (!image && !isCustom) continue;

//       const ownImage =
//         photographerId &&
//         (isCustom || image.photographer?.toString() === photographerId);

//       const imagePrice = isCustom
//         ? 0
//         : resolution === "small"
//         ? image.price.small
//         : resolution === "medium"
//         ? image.price.medium
//         : image.price.original;

//       let paperPrice = 0;
//       let framePrice = 0;
//       let discount = 0;

//       if (paperId) {
//         const paper = papers.find((p) => p._id.toString() === paperId);
//         if (paper) {
//           const customDimension = paper.customDimensions.find(
//             (dim) => dim.width === width && dim.height === height
//           );
//           const photographerDiscount = paper?.photographerDiscount || 0;
//           discount = ownImage || isCustomDiscount ? photographerDiscount : 0;

//           if (customDimension) {
//             paperPrice = customDimension.price;
//           } else {
//             const area = width * height;
//             paperPrice = area * paper.basePricePerSquareInch;
//           }

//           if (content?.charges?.delivery) {
//             const itemDeliveryCharge = width * height * 1; // â‚¹1 per sq.in.
//             maxDeliveryCharge = Math.max(maxDeliveryCharge, itemDeliveryCharge);
//           }
//         }
//       }

//       if (frameId) {
//         const frame = frames.find((f) => f._id.toString() === frameId);
//         if (frame) {
//           const frameArea = width * height;
//           framePrice = frameArea * frame.basePricePerLinearInch;
//         }
//       }

//       totalImagePrice += imagePrice;
//       totalPaperPrice += paperPrice;
//       totalFramePrice += framePrice;

//       totalFinalPrice += paperPrice
//         ? (paperPrice + framePrice) * (1 - discount / 100)
//         : imagePrice + paperPrice + framePrice;

//       totalPhotographerDiscount += discount * (paperPrice + framePrice) * 0.01;
//     }

//     const coupon = await Coupon.findOne({  code: couponCode })
//     const couponDiscount = coupon.discount

//     res.json({
//       totalImagePrice,
//       totalPaperPrice,
//       totalFramePrice,
//       couponDiscount,
//       totalFinalPrice: Number(totalFinalPrice.toFixed(2)),
//       totalPhotographerDiscount: Number(totalPhotographerDiscount.toFixed(2)),
//       totalDeliveryCharge: maxDeliveryCharge,
//       platformFeeAllowed: !!content?.charges?.platform,
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Server error." });
//   }
// };

// const calculateCartSecondPrice = async (req, res) => {
//   try {
//     const {
//       items,
//       couponCode,
//       photographerId,
//       isCustom = false,
//       isCustomDiscount = false,
//     } = req.body;

//     let totalImagePrice = 0;
//     let totalPaperPrice = 0;
//     let totalFramePrice = 0;
//     let totalFinalPrice = 0;
//     let maxDeliveryCharge = 0;
//     let totalPhotographerDiscount = 0;
//     let totalCouponDiscount = 0;

//     const frameIds = items
//       ?.filter((item) => item.frameId)
//       .map((item) => item.frameId);
//     const paperIds = items
//       ?.filter((item) => item.paperId)
//       .map((item) => item.paperId);

//     const frames = await Frame.find({ _id: { $in: frameIds } });
//     const papers = await Paper.find({ _id: { $in: paperIds } });

//     const content = await LayoutContent.findOne();

//     const coupon = await Coupon.findOne({  code: couponCode })
//     let couponDiscount
//     let maxDiscount
//     let couponDiscountPercentage
//     if(coupon) {
//         couponDiscountPercentage = coupon.discountPercentage
//         maxDiscount = coupon.maxDiscountAmount
//     }

//     for (let item of items) {
//       const { imageId, paperId, frameId, width, height, resolution } = item;

//       const image = await ImageVault.findById(imageId);
//       if (!image && !isCustom) continue;

//       // const ownImage =
//       //   photographerId &&
//       //   (isCustom || image.photographer?.toString() === photographerId);

//       const ownImage = paperId || imageId ? true : false

//       const imagePrice = isCustom
//         ? 0
//         : resolution === "small"
//         ? image.price.small
//         : resolution === "medium"
//         ? image.price.medium
//         : image.price.original;

//       let paperPrice = 0;
//       let framePrice = 0;
//       let discount = 0;

//       if (paperId) {
//         const paper = papers.find((p) => p._id.toString() === paperId);
//         if (paper) {
//           const customDimension = paper.customDimensions.find(
//             (dim) => dim.width === width && dim.height === height
//           );
//           const photographerDiscount = paper?.photographerDiscount || 0;
//           discount = ownImage || isCustomDiscount ? photographerDiscount : 0;

//           if (customDimension) {
//             paperPrice = customDimension.price;
//           } else {
//             const area = width * height;
//             paperPrice = area * paper.basePricePerSquareInch;
//           }

//           if (content?.charges?.delivery) {
//             const itemDeliveryCharge = width * height * 1; // â‚¹1 per sq.in.
//             maxDeliveryCharge = Math.max(maxDeliveryCharge, itemDeliveryCharge);
//           }
//         }
//       }

//       if (frameId) {
//         const frame = frames.find((f) => f._id.toString() === frameId);
//         if (frame) {
//           const frameArea = width * height;
//           framePrice = frameArea * frame.basePricePerLinearInch;
//         }
//       }

//       if(imagePrice && !paperPrice) {
//         const discountForThisImage = imagePrice * (couponDiscountPercentage / 100);
//         totalCouponDiscount += Math.min(discountForThisImage, maxDiscount || discountForThisImage);
//         imagePrice -= discountForThisImage;
//       }

//       if (paperPrice > 0) {
//         if(photographerId) {
//           const photographerDiscountAmount = discount * (paperPrice + framePrice) * 0.01;
//           totalPhotographerDiscount += photographerDiscountAmount;
//           paperPrice -= photographerDiscountAmount;
//         }
//         const discountForThisPaper = paperPrice * (couponDiscountPercentage / 100);
//         totalCouponDiscount += Math.min(discountForThisPaper, maxDiscount || discountForThisPaper);
//         paperPrice -= discountForThisPaper
//       }

//       totalImagePrice += imagePrice;
//       totalPaperPrice += paperPrice;
//       totalFramePrice += framePrice;

//       totalFinalPrice += paperPrice
//         ? (paperPrice + framePrice) * (1 - discount / 100)
//         : imagePrice + paperPrice + framePrice;

//     }

//     const layoutContent = await LayoutContent.findOne({  })
//     let gstCharge = totalFinalPrice * (18/100)
//     totalFinalPrice = gstCharge + totalFinalPrice

//     const { platform } = layoutContent.charges

//     if(platform) {
//       let platformFess = totalFinalPrice * 0.02
//       totalFinalPrice = totalFinalPrice + platformFess
//     }

//     // const result =  await paymentHandler(totalFinalPrice, userId)

//     // if(!result) {
//     //   return res.status(400).send({ message: "UserId is required" })
//     // }

//     res.json({
//       totalImagePrice,
//       totalPaperPrice,
//       totalFramePrice,
//       couponDiscount: totalCouponDiscount,
//       totalFinalPrice: Number(totalFinalPrice.toFixed(2)),
//       totalPhotographerDiscount: Number(totalPhotographerDiscount.toFixed(2)),
//       totalDeliveryCharge: maxDeliveryCharge,
//       platformFeeAllowed: !!content?.charges?.platform,
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Server error." });
//   }
// };

const inchToCm = 2.54;

async function calculateDelhiveryCharge(width, height, hasFrame, d_pin) {
  if (!d_pin || d_pin.toString().trim().length !== 6) {
    return 0;
  }
  let length_cm, height_cm, depth_cm;

  if (hasFrame) {
    length_cm = (width + 4) * inchToCm;
    height_cm = (height + 4) * inchToCm;
    depth_cm = 8; // cm fixed for framed print
  } else {
    const biggestSide = Math.max(width, height);
    length_cm = (biggestSide + 4) * inchToCm;
    height_cm = 10; // roll diameter increased to 10cm
    depth_cm = 10;
  }

  const volumetricWeight = (length_cm * height_cm * depth_cm) / 5000; // kg
  const cgm = Math.ceil(volumetricWeight * 1000); // grams

  const apiUrl = `https://track.delhivery.com/api/kinko/v1/invoice/charges/.json?md=S&ss=Delivered&d_pin=${d_pin}&o_pin=226028&cgm=${cgm}&pt=Pre-paid`;

  try {
    const response = await axios.get(apiUrl, {
      headers: {
        Authorization: `Token ${process.env.DEHLIVERYONE_LIVE_TOKEN}`,
      },
    });

    return response.data?.[0]?.total_amount || 0;
  } catch (err) {
    console.log("Delhivery error:", err?.response?.data || err);
    return 0;
  }
}

const calculateCartPrice = async (req, res) => {
  try {
    const {
      items,
      couponCode,
      photographerId,
      isCustom = false,
      deliveryPincode,
    } = req.body;

    let subtotal = 0;
    let totalFinalPrice = 0;

    let totalImagePrice = 0;
    let totalPaperPrice = 0;
    let totalFramePrice = 0;

    let totalPhotographerDiscount = 0;
    let rawCouponDiscount = 0;
    let totalDeliveryCharge = 0;
    let totalPlatformFee = 0;

    const frameIds = items.filter((i) => i.frameId).map((i) => i.frameId);
    const paperIds = items.filter((i) => i.paperId).map((i) => i.paperId);
    const mountIds = items.filter((i) => i.mountId).map((i) => i.mountId);

    const frames = await Frame.find({ _id: { $in: frameIds } });
    const papers = await Paper.find({ _id: { $in: paperIds } });
    const mounts = await Mount.find({ _id: { $in: mountIds } });
    const layoutContent = await LayoutContent.findOne({});
    const coupon = await Coupon.findOne({ code: couponCode });

    const couponDiscountPercentage = coupon?.discountPercentage || 0;
    const maxDiscount = coupon?.maxDiscountAmount || 0;

    for (const item of items) {
      const { imageId, paperId, frameId, mountId, width, height, resolution } = item;
      const area = (width || 0) * (height || 0);

      if (!paperId && imageId && !isCustom) {
        const image = await ImageVault.findById(imageId);

        const imagePrice =
          resolution === "small"
            ? image.price.small
            : resolution === "medium"
              ? image.price.medium
              : image.price.original;

        subtotal += imagePrice;
        totalFinalPrice += imagePrice;
        totalImagePrice += imagePrice;

        rawCouponDiscount += imagePrice * (couponDiscountPercentage / 100);

        continue;
      }
      let paperInitialPrice = 0;
      let paperBasePrice = 0;
      let paperFinalPrice = 0;

      if (paperId) {
        const paper = papers.find((p) => p._id.toString() === paperId);
        if (!paper) continue;

        const customDim = paper.customDimensions.find(
          (d) => d.width === width && d.height === height
        );
        paperInitialPrice = area * paper.initialBasePrice;

        paperBasePrice = customDim
          ? customDim.price
          : area * paper.basePricePerSquareInch;
        totalPhotographerDiscount += paperInitialPrice - paperBasePrice;

        paperFinalPrice = paperBasePrice;
        if (photographerId && paper.photographerDiscount) {
          const discount = paperBasePrice * (paper.photographerDiscount / 100);

          paperFinalPrice -= discount;
          totalPhotographerDiscount += discount;
        }

        subtotal += paperInitialPrice;
        totalPaperPrice += paperFinalPrice;
      }

      let frameInitialPrice = 0;
      let frameBasePrice = 0;
      let frameFinalPrice = 0;

      if (frameId) {
        const frame = frames.find((f) => f._id.toString() === frameId);
        if (frame) {
          frameInitialPrice = area * frame.initialBasePrice;

          frameBasePrice = area * frame.basePricePerLinearInch;

          totalPhotographerDiscount += frameInitialPrice - frameBasePrice;

          frameFinalPrice = frameBasePrice;

          if (photographerId && frame.photographerDiscount) {
            const discount =
              frameBasePrice * (frame.photographerDiscount / 100);

            frameFinalPrice -= discount;
            totalPhotographerDiscount += discount;
          }

          subtotal += frameInitialPrice;
          totalFramePrice += frameFinalPrice;
        }
      }

      let mountInitialPrice = 0;
      let mountBasePrice = 0;
      let mountFinalPrice = 0;

      if (mountId && frameId) {
        const mount = mounts.find((m) => m._id.toString() === mountId);
        if (mount) {
          const available = getAvailableMounts(width, height, mounts);
          if (!available.includes(String(mount.thickness))) {
            throw new Error(`Mount thickness ${mount.thickness} is not allowed for print dimensions ${width}x${height}`);
          }

          mountInitialPrice = area * mount.initialBasePrice;
          const mountUnitPrice = mount.basePricePerUnit || mount.basePricePerLinearInch || 0;
          mountBasePrice = area * mountUnitPrice;

          // USER DISCOUNT (implicit)
          totalPhotographerDiscount += mountInitialPrice - mountBasePrice;

          mountFinalPrice = mountBasePrice;

          // PHOTOGRAPHER DISCOUNT
          if (photographerId && mount.photographerDiscount) {
            const discount = mountBasePrice * (mount.photographerDiscount / 100);

            mountFinalPrice -= discount;
            totalPhotographerDiscount += discount;
          }

          subtotal += mountInitialPrice;
        }
      }

      totalFinalPrice += paperFinalPrice + frameFinalPrice + mountFinalPrice;

      rawCouponDiscount +=
        (paperFinalPrice + frameFinalPrice + mountFinalPrice) * (couponDiscountPercentage / 100);

      if (layoutContent?.charges?.delivery) {
        totalDeliveryCharge += await calculateDelhiveryCharge(
          width,
          height,
          !!frameId,
          deliveryPincode
        );
      }
    }

    const totalCouponDiscount = Math.min(rawCouponDiscount, maxDiscount);
    totalFinalPrice -= totalCouponDiscount;

    const netBeforeCharges =
      subtotal - totalPhotographerDiscount - totalCouponDiscount;

    if (netBeforeCharges >= 3000) {
      totalDeliveryCharge = 0;
    }

    totalFinalPrice += totalDeliveryCharge;

    const isGstActive = layoutContent?.charges?.gst || false;
    const gstCharge = isGstActive ? totalFinalPrice * 0.18 : 0;
    totalFinalPrice += gstCharge;

    if (layoutContent?.charges?.platform) {
      totalPlatformFee = totalFinalPrice * 0.02;
      totalFinalPrice += totalPlatformFee;
    }

    res.json({
      subtotal: Number(subtotal.toFixed(2)),
      totalImagePrice: Number(totalImagePrice.toFixed(2)),
      totalPaperPrice: Number(totalPaperPrice.toFixed(2)),
      totalFramePrice: Number(totalFramePrice.toFixed(2)),
      totalPhotographerDiscount: Number(totalPhotographerDiscount.toFixed(2)),
      totalCouponDiscount: Number(totalCouponDiscount.toFixed(2)),
      totalDeliveryCharge: Number(totalDeliveryCharge.toFixed(2)),
      gstCharge: Number(gstCharge.toFixed(2)),
      totalPlatformFee: Number(totalPlatformFee.toFixed(2)),
      totalFinalPrice: Number(totalFinalPrice.toFixed(2)),
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message || "Server error." });
  }
};

const updatePrintStatus = asyncHandler(async (req, res) => {
  const { orderId, printStatus } = req.body;

  const order = await Order.findOne({ _id: orderId });

  order.printStatus = printStatus;

  await order.save();

  if (order.userInfo && order.userInfo.user) {
    await sendNotificationToUser({
      userId: order.userInfo.user,
      userType: order.userInfo.userType,
      title: "Print Status Updated",
      body: `Your order is now: ${printStatus?.slice(0, 1).toUpperCase() + printStatus?.slice(1)
        }`,
      type: "order",
      data: {
        url: `${order.userInfo.userType === "User" ? "clickedart" : "clickedartartist"
          }://${printStatus === "no-print" ? "digitalorder" : "printorder"}/${order._id
          }`,
      },
    });
  }

  res.status(200).send({ message: "Print Status updated successfully" });
});

const updateReadyToShipStatus = asyncHandler(async (req, res) => {
  const { orderId, status = false } = req.body;

  if (!orderId) {
    return res.status(400).send({ message: "Order Id not found" });
  }
  let readyToShipTimeStamp;
  if (status === true) {
    readyToShipTimeStamp = new Date();
  }

  await Order.findOneAndUpdate(
    { _id: orderId },
    { readyToShip: status, readyToShipTimeStamp }
  );

  res
    .status(200)
    .send({ message: "Ready To Ship Status Updated Successfully" });
});

const getStoreOrders = asyncHandler(async (req, res) => {
  const storeId = req.storeId;
  const {
    search,
    status,
    startDate,
    endDate,
    page = 1,
    limit = 15,
  } = req.query;

  const query = { orderSource: { $in: ["STORE", "store"] } };
  if (storeId) {
    query.$or = [
      { store: storeId },
      { store: null },
      { store: { $exists: false } },
    ];
  }

  // Status filter
  if (status && status !== "all") {
    query.orderStatus = status;
  }

  // Date range filter
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      query.createdAt.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  // Search filter
  if (search && search.trim() !== "") {
    const regex = new RegExp(search.trim(), "i");
    query.$or = [
      { orderNumber: regex },
      { invoiceNumber: regex },
      { "customer.name": regex },
      { "customer.email": regex },
      { "customer.phone": regex },
    ];
  }

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 15;
  const skip = (pageNum - 1) * limitNum;

  const total = await Order.countDocuments(query);
  const orders = await Order.find(query)
    .populate({
      path: "orderItems.imageInfo.image",
    })
    .populate({
      path: "orderItems.frameInfo.frame",
    })
    .populate({
      path: "orderItems.paperInfo.paper",
    })
    .populate({
      path: "orderItems.imageInfo.photographer",
    })
    .populate("userInfo.user")
    .populate("store", "name storeCode city state")
    .populate("createdBy", "name email role")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .lean();

  const enrichedOrders = orders.map((ord) => {
    const u = ord.userInfo?.user;
    const userName =
      typeof u === "object" && u
        ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.name
        : "";
    const userPhone = typeof u === "object" && u ? (u.mobile || u.phone || "") : "";
    const userEmail = typeof u === "object" && u ? (u.email || "") : "";

    const currentCust = ord.customer || {};
    const isDefaultCust =
      !currentCust.name || currentCust.name === "Walk-in Customer";

    const resolvedCustomerName =
      (!isDefaultCust && currentCust.name) ||
      userName ||
      currentCust.name ||
      "Walk-in Customer";
    const resolvedCustomerPhone = currentCust.phone || userPhone || "";
    const resolvedCustomerEmail = currentCust.email || userEmail || "";

    return {
      ...ord,
      customer: {
        ...currentCust,
        name: resolvedCustomerName,
        phone: resolvedCustomerPhone,
        email: resolvedCustomerEmail,
      },
    };
  });

  res.status(200).json({
    status: true,
    orders: enrichedOrders,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  });
});

const validateStoreCoupon = asyncHandler(async (req, res) => {
  const { code } = req.query;
  if (!code || !code.trim()) {
    return res.status(400).json({
      status: false,
      message: "Coupon code is required",
    });
  }

  const cleanCode = code.trim().toUpperCase();
  const coupon = await Coupon.findOne({
    code: { $regex: new RegExp(`^${cleanCode}$`, "i") },
  });

  if (!coupon) {
    return res.status(404).json({
      status: false,
      message: `Coupon code "${cleanCode}" is invalid`,
    });
  }

  if (coupon.status && coupon.status !== "active") {
    return res.status(400).json({
      status: false,
      message: `Coupon code "${cleanCode}" is no longer active`,
    });
  }

  res.status(200).json({
    status: true,
    message: `Coupon "${cleanCode}" applied successfully!`,
    coupon: {
      code: coupon.code,
      discountPercentage: Number(coupon.discountPercentage) || 0,
      maxDiscountAmount: Number(coupon.maxDiscountAmount) || 0,
      type: coupon.type || "coupon",
    },
  });
});

module.exports = {
  createOrder,
  getAllOrders,
  getMyOrders,
  getOrdersByPhotographer,
  getOrderByStatus,
  updateOrderStatus,
  getOrderById,
  payment,
  getPendingOrders,
  calculateCartPrice,
  updatePrintStatus,
  deleteOrder,
  getFailedOrders,
  updateReadyToShipStatus,
  paymentHandler,
  getStoreOrders,
  validateStoreCoupon,
};
