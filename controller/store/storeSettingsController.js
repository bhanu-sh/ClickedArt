const asyncHandler = require("express-async-handler");
const Store = require("../../models/storeModel");
const StoreUser = require("../../models/storeUserModel");

// @desc    Get current store profile, settings, and staff list
// @route   GET /api/store/settings
// @access  Store User
const getStoreSettings = asyncHandler(async (req, res) => {
  const storeId = req.storeId;
  const store = await Store.findById(storeId);

  if (!store) {
    return res.status(404).json({
      status: false,
      message: "Store not found",
    });
  }

  // Get users for this store
  const staffMembers = await StoreUser.find({ store: storeId })
    .select("name email role phone status lastLogin createdAt")
    .sort({ role: 1, createdAt: 1 })
    .lean();

  res.status(200).json({
    status: true,
    store,
    staffMembers,
  });
});

// @desc    Update store details and preferences
// @route   PUT /api/store/settings
// @access  Store Manager
const updateStoreSettings = asyncHandler(async (req, res) => {
  const storeId = req.storeId;
  const {
    name,
    phone,
    email,
    address,
    operatingHours,
    settings: storeSettings,
    googleMapUrl,
    photos,
  } = req.body;

  const store = await Store.findById(storeId);
  if (!store) {
    return res.status(404).json({
      status: false,
      message: "Store not found",
    });
  }


  if (name) store.name = name.trim();
  if (phone) store.phone = phone.trim();
  if (email) store.email = email.trim();
  if (operatingHours) store.operatingHours = operatingHours.trim();

  if (googleMapUrl !== undefined) {
    store.googleMapUrl = typeof googleMapUrl === "string" ? googleMapUrl.trim() : "";
  }

  if (photos !== undefined) {
    store.photos = Array.isArray(photos) ? photos : [];
  }

  if (address) {
    store.address = {
      street: address.street !== undefined ? address.street : store.address.street,
      city: address.city !== undefined ? address.city : store.address.city,
      state: address.state !== undefined ? address.state : store.address.state,
      pincode: address.pincode !== undefined ? address.pincode : store.address.pincode,
      country: address.country !== undefined ? address.country : store.address.country,
      googleMapUrl: address.googleMapUrl !== undefined ? address.googleMapUrl.trim() : (store.address?.googleMapUrl || store.googleMapUrl || ""),
    };
    if (address.googleMapUrl !== undefined && googleMapUrl === undefined) {
      store.googleMapUrl = address.googleMapUrl.trim();
    }
  }

  if (storeSettings) {
    store.settings = {
      currency: storeSettings.currency || store.settings.currency || "INR",
      currencySymbol: storeSettings.currencySymbol || store.settings.currencySymbol || "₹",
      taxRate: storeSettings.taxRate !== undefined ? Number(storeSettings.taxRate) : store.settings.taxRate,
      lowStockThreshold:
        storeSettings.lowStockThreshold !== undefined
          ? Math.max(1, Number(storeSettings.lowStockThreshold))
          : store.settings.lowStockThreshold,
      receiptNotes:
        storeSettings.receiptNotes !== undefined
          ? storeSettings.receiptNotes
          : store.settings.receiptNotes,
    };
  }

  await store.save();


  res.status(200).json({
    status: true,
    message: "Store settings updated successfully",
    store,
  });
});

module.exports = {
  getStoreSettings,
  updateStoreSettings,
};
