const express = require("express");
const router = express.Router();
const { isAdmin } = require("../middleware/authMiddleware");

const {
  getStores,
  createStore,
  updateStore,
  updateStoreStatus,
  resetStorePassword,
  deleteStore,
} = require("../controller/adminStoreController");

router.get("/", isAdmin, getStores);
router.post("/", isAdmin, createStore);
router.put("/:id", isAdmin, updateStore);
router.patch("/:id/status", isAdmin, updateStoreStatus);
router.patch("/:id/reset-password", isAdmin, resetStorePassword);
router.delete("/:id", isAdmin, deleteStore);

module.exports = router;
