const express = require("express");
const router = express.Router();
const { isAdmin } = require("../middleware/authMiddleware");

const {
  getStores,
  getActiveStores,
  createStore,
  updateStore,
  updateStoreStatus,
  resetStorePassword,
  deleteStore,
} = require("../controller/adminStoreController");

router.get("/active", getActiveStores);
router.get("/", (req, res, next) => {
  if (!req.header("x-auth-token")) {
    return getActiveStores(req, res, next);
  }
  return isAdmin(req, res, () => getStores(req, res, next));
});
router.post("/", isAdmin, createStore);
router.put("/:id", isAdmin, updateStore);
router.patch("/:id/status", isAdmin, updateStoreStatus);
router.patch("/:id/reset-password", isAdmin, resetStorePassword);
router.delete("/:id", isAdmin, deleteStore);

module.exports = router;
