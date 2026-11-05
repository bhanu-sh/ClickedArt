const express = require("express");
const {
  createGalleryWrap,
  getGalleryWraps,
  getGalleryWrapById,
  updateGalleryWrap,
  deleteGalleryWrap,
} = require("../../controller/imagebase/galleryWrapController");
const { isAdmin } = require("../../middleware/authMiddleware");

const router = express.Router();

router.post("/create-gallery-wrap", isAdmin, createGalleryWrap);
router.post("/update-gallery-wrap", isAdmin, updateGalleryWrap);
router.get("/get-gallery-wrap", getGalleryWraps);
router.get("/get-gallery-wrap-by-id", getGalleryWrapById);
router.delete("/delete-gallery-wrap", isAdmin, deleteGalleryWrap);

module.exports = router;

