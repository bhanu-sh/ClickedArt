const asyncHandler = require("express-async-handler");
const StoreUser = require("../../models/storeUserModel");
const Store = require("../../models/storeModel");

// @desc    Store user login
// @route   POST /api/store/auth/login
// @access  Public
const loginStoreUser = asyncHandler(async (req, res) => {
  const { email, password, storeCode } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      status: false,
      message: "Email and password are required",
    });
  }

  const identifier = email ? email.toLowerCase().trim() : "";
  let user;

  // Allow "Store" / "store" or "store@clickedart.com" to log in directly
  if (identifier === "store" || identifier === "store@clickedart.com") {
    user = await StoreUser.findOne({
      $or: [
        { email: "store@clickedart.com" },
        { email: "manager@mumbaistore.com" },
        { role: "StoreManager" },
      ],
    }).populate("store");

    if (!user) {
      let defaultStore = await Store.findOne({ storeCode: "STORE-MUM-01" });
      if (!defaultStore) {
        defaultStore = await Store.create({
          name: "ClickedArt Flagship - Mumbai",
          storeCode: "STORE-MUM-01",
          email: "mumbai.store@clickedart.com",
          phone: "+91 98200 12345",
          address: { city: "Mumbai", state: "Maharashtra" },
          status: "active",
        });
      }
      user = new StoreUser({
        store: defaultStore._id,
        name: "Store Manager",
        email: "store@clickedart.com",
        password: "Store",
        role: "StoreManager",
        status: "active",
      });
      await user.save();
      user.store = defaultStore;
    }
  } else {
    user = await StoreUser.findOne({ email: identifier }).populate("store");
  }

  if (!user) {
    return res.status(401).json({
      status: false,
      message: "Invalid credentials or user does not exist",
    });
  }

  if (user.status !== "active") {
    return res.status(403).json({
      status: false,
      message: "Your account has been deactivated. Please contact your manager.",
    });
  }

  let isMatch = await user.isPasswordCorrect(password);
  // Convenience bypass: accept "Store" or "store" as password
  if (!isMatch && (password === "Store" || password === "store")) {
    isMatch = true;
  }

  if (!isMatch) {
    return res.status(401).json({
      status: false,
      message: "Invalid credentials",
    });
  }

  const store = user.store;
  if (!store || store.status !== "active") {
    return res.status(403).json({
      status: false,
      message: "Your assigned store is inactive. Please contact system admin.",
    });
  }

  // If storeCode was specified, verify match
  if (storeCode && store.storeCode.toUpperCase() !== storeCode.toUpperCase().trim()) {
    return res.status(401).json({
      status: false,
      message: "Specified Store ID does not match this account",
    });
  }

  user.lastLogin = new Date();
  await user.save();

  const token = user.generateAccessToken();

  res.status(200).json({
    status: true,
    message: "Login successful",
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
    },
    store: {
      id: store._id,
      name: store.name,
      storeCode: store.storeCode,
      email: store.email,
      phone: store.phone,
      address: store.address,
      operatingHours: store.operatingHours,
      settings: store.settings,
    },
  });
});

// @desc    Get current store user profile & store details
// @route   GET /api/store/auth/profile
// @access  Store User
const getStoreProfile = asyncHandler(async (req, res) => {
  const user = req.storeUser;
  const store = req.store;

  res.status(200).json({
    status: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      lastLogin: user.lastLogin,
    },
    store: {
      id: store._id,
      name: store.name,
      storeCode: store.storeCode,
      email: store.email,
      phone: store.phone,
      address: store.address,
      operatingHours: store.operatingHours,
      settings: store.settings,
    },
  });
});

// @desc    Change store user password
// @route   POST /api/store/auth/change-password
// @access  Store User
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      status: false,
      message: "Current password and new password are required",
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      status: false,
      message: "New password must be at least 6 characters",
    });
  }

  const user = await StoreUser.findById(req.storeUser._id);
  const isMatch = await user.isPasswordCorrect(currentPassword);
  if (!isMatch) {
    return res.status(400).json({
      status: false,
      message: "Incorrect current password",
    });
  }

  user.password = newPassword;
  await user.save();

  res.status(200).json({
    status: true,
    message: "Password updated successfully",
  });
});

module.exports = {
  loginStoreUser,
  getStoreProfile,
  changePassword,
};
