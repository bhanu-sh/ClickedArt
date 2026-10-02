const express = require("express");
const {
  createFloaterFrame,
  getFloaterFrames,
  getFloaterFrameById,
  updateFloaterFrame,
  deleteFloaterFrame,
} = require("../../controller/imagebase/floaterFrameController");
const { isAdmin } = require("../../middleware/authMiddleware");

const router = express.Router();

router.post("/create-frame", isAdmin, createFloaterFrame);
router.post("/update-frame", isAdmin, updateFloaterFrame);
router.get("/get-frame-by-id", getFloaterFrameById);
router.get("/get-frames", getFloaterFrames);
router.delete("/delete-frame", isAdmin, deleteFloaterFrame);

module.exports = router;
