const asyncHandler = require("express-async-handler");
const Store = require("../models/storeModel");
const StoreUser = require("../models/storeUserModel");

// @desc    Get all stores
// @route   GET /api/stores
// @access  Private (Admin)
const getStores = asyncHandler(async (req, res) => {
  const stores = await Store.find({}).sort({ createdAt: -1 });
  
  // Since frontend expects storeId instead of storeCode, map it
  const formattedStores = stores.map((s) => ({
    _id: s._id,
    storeName: s.name,
    storeId: s.storeCode,
    email: s.email,
    phone: s.phone,
    address: s.address?.street || s.address?.city || "",
    status: s.status === "active" ? "Active" : "Inactive",
    createdAt: s.createdAt,
  }));

  res.status(200).json({ status: true, stores: formattedStores });
});

// @desc    Create a store
// @route   POST /api/stores
// @access  Private (Admin)
const createStore = asyncHandler(async (req, res) => {
  const { storeName, storeId, email, password, phone, address, status } = req.body;

  if (!storeName || !storeId || !email || !password || !phone) {
    return res.status(400).json({ status: false, message: "Missing required fields" });
  }

  const storeExists = await Store.findOne({ storeCode: storeId });
  if (storeExists) {
    return res.status(400).json({ status: false, message: "Store Code already exists" });
  }

  const storeUserExists = await StoreUser.findOne({ email: email.toLowerCase() });
  if (storeUserExists) {
    return res.status(400).json({ status: false, message: "Store email already used by a user" });
  }

  // Create store
  const store = await Store.create({
    name: storeName,
    storeCode: storeId,
    email: email.toLowerCase(),
    phone: phone || "",
    address: { street: address || "" },
    status: status === "Active" ? "active" : "inactive",
  });

  // Create store user (Manager) to allow login
  const storeUser = await StoreUser.create({
    store: store._id,
    name: storeName + " Manager",
    email: email.toLowerCase(),
    password: password,
    role: "StoreManager",
    status: store.status,
  });

  res.status(201).json({ status: true, message: "Store created", store });
});

// @desc    Update a store
// @route   PUT /api/stores/:id
// @access  Private (Admin)
const updateStore = asyncHandler(async (req, res) => {
  const { storeName, email, phone, address, status } = req.body;
  const store = await Store.findById(req.params.id);

  if (!store) {
    return res.status(404).json({ status: false, message: "Store not found" });
  }

  store.name = storeName || store.name;
  store.email = email ? email.toLowerCase() : store.email;
  store.phone = phone || store.phone;
  if (address) {
    store.address = { street: address };
  }
  if (status) {
    store.status = status === "Active" ? "active" : "inactive";
  }

  await store.save();

  // Also update corresponding store manager user email if changed
  if (email || status) {
    const storeUser = await StoreUser.findOne({ store: store._id, role: "StoreManager" });
    if (storeUser) {
      if (email) storeUser.email = email.toLowerCase();
      if (status) storeUser.status = status === "Active" ? "active" : "inactive";
      await storeUser.save();
    }
  }

  res.status(200).json({ status: true, message: "Store updated", store });
});

// @desc    Update store status
// @route   PATCH /api/stores/:id/status
// @access  Private (Admin)
const updateStoreStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const store = await Store.findById(req.params.id);

  if (!store) {
    return res.status(404).json({ status: false, message: "Store not found" });
  }

  store.status = status === "Active" ? "active" : "inactive";
  await store.save();

  // Update associated users
  await StoreUser.updateMany({ store: store._id }, { status: store.status });

  res.status(200).json({ status: true, message: "Store status updated" });
});

// @desc    Reset store password
// @route   PATCH /api/stores/:id/reset-password
// @access  Private (Admin)
const resetStorePassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ status: false, message: "Password is required" });
  }

  const store = await Store.findById(req.params.id);
  if (!store) {
    return res.status(404).json({ status: false, message: "Store not found" });
  }

  // Update the StoreManager's password
  const storeUser = await StoreUser.findOne({ store: store._id, role: "StoreManager" });
  if (!storeUser) {
    return res.status(404).json({ status: false, message: "Store manager user not found for this store" });
  }

  storeUser.password = password;
  await storeUser.save();

  res.status(200).json({ status: true, message: "Password reset successful" });
});

// @desc    Delete store
// @route   DELETE /api/stores/:id
// @access  Private (Admin)
const deleteStore = asyncHandler(async (req, res) => {
  const store = await Store.findById(req.params.id);
  if (!store) {
    return res.status(404).json({ status: false, message: "Store not found" });
  }

  await store.deleteOne();
  // Delete all users associated with this store
  await StoreUser.deleteMany({ store: store._id });

  res.status(200).json({ status: true, message: "Store removed" });
});

module.exports = {
  getStores,
  createStore,
  updateStore,
  updateStoreStatus,
  resetStorePassword,
  deleteStore,
};
