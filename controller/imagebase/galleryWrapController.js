const GalleryWrap = require("../../models/imagebase/galleryWrapModel");
const asyncHandler = require("express-async-handler");
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { S3Client } = require("@aws-sdk/client-s3");

const config = {
  region: process.env.AWS_BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
};
const s3 = new S3Client(config);

const createGalleryWrap = asyncHandler(async (req, res) => {
  const {
    name,
    image,
    material,
    thickness,
    initialBasePrice,
    basePricePerSquareInch,
    customDimensions,
    photographerDiscount,
    userDiscount,
    extraPrice,
    hasExtraPrice,
  } = req.body;

  const existing = await GalleryWrap.findOne({ name });
  if (existing) {
    res.status(400);
    throw new Error("Gallery Wrap with this name already exists.");
  }

  const finalInitialBasePrice =
    Number(initialBasePrice) || Number(basePricePerSquareInch) || 0;
  const finalBasePrice =
    Number(basePricePerSquareInch) || finalInitialBasePrice || 0;

  const formattedDimensions = (customDimensions || []).map((dim) => {
    const w = Number(dim.width) || 0;
    const h = Number(dim.height) || 0;
    const price = Number(dim.price) || Math.round(finalBasePrice * w * h);
    const initialPrice =
      Number(dim.initialPrice) || Number(dim.price) || Math.round(finalInitialBasePrice * w * h);
    return {
      width: w,
      height: h,
      price,
      initialPrice,
      extraPrice: Number(dim.extraPrice) || 0,
    };
  });

  const galleryWrap = await GalleryWrap.create({
    name,
    image,
    material,
    thickness: Number(thickness) || 20,
    initialBasePrice: finalInitialBasePrice,
    basePricePerSquareInch: finalBasePrice,
    customDimensions: formattedDimensions,
    photographerDiscount: Number(photographerDiscount) || 0,
    userDiscount: Number(userDiscount) || 0,
    extraPrice: Number(extraPrice) || 0,
    hasExtraPrice: Boolean(hasExtraPrice),
  });

  res.status(201).json({ galleryWrap });
});

const getGalleryWraps = asyncHandler(async (req, res) => {
  const { pageNumber = 1, pageSize = 50 } = req.query;
  const galleryWraps = await GalleryWrap.find({})
    .sort({ createdAt: -1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize);

  const totalDocuments = await GalleryWrap.countDocuments({});
  const pageCount = Math.ceil(totalDocuments / pageSize) || 1;

  res.status(200).json({ galleryWraps: galleryWraps || [], pageCount, totalDocuments });
});

const getGalleryWrapById = asyncHandler(async (req, res) => {
  const { galleryWrapId, id } = req.query;
  const targetId = galleryWrapId || id;
  const galleryWrap = await GalleryWrap.findById(targetId);
  if (!galleryWrap) {
    return res.status(404).json({ message: "Gallery Wrap not found" });
  }
  res.status(200).json({ galleryWrap });
});

const updateGalleryWrap = asyncHandler(async (req, res) => {
  const {
    galleryWrapId,
    id,
    name,
    image,
    material,
    thickness,
    initialBasePrice,
    basePricePerSquareInch,
    customDimensions,
    photographerDiscount,
    userDiscount,
    extraPrice,
    hasExtraPrice,
  } = req.body;

  const targetId = galleryWrapId || id;
  const galleryWrap = await GalleryWrap.findById(targetId);
  if (!galleryWrap) {
    return res.status(404).json({ message: "Gallery Wrap not found" });
  }

  galleryWrap.name = name ?? galleryWrap.name;
  galleryWrap.image = image ?? galleryWrap.image;
  galleryWrap.material = material ?? galleryWrap.material;
  galleryWrap.thickness = thickness ?? galleryWrap.thickness;
  galleryWrap.initialBasePrice = initialBasePrice ?? galleryWrap.initialBasePrice;
  galleryWrap.userDiscount = userDiscount ?? galleryWrap.userDiscount;
  galleryWrap.basePricePerSquareInch =
    basePricePerSquareInch ?? galleryWrap.basePricePerSquareInch;
  galleryWrap.photographerDiscount =
    photographerDiscount ?? galleryWrap.photographerDiscount;
  if (extraPrice !== undefined) galleryWrap.extraPrice = extraPrice;
  if (hasExtraPrice !== undefined) galleryWrap.hasExtraPrice = hasExtraPrice;
  if (customDimensions) {
    galleryWrap.customDimensions = customDimensions;
  }
  const updated = await galleryWrap.save();
  res.status(200).json({ galleryWrap: updated });
});

const deleteGalleryWrap = asyncHandler(async (req, res) => {
  const { galleryWrapId, id } = req.query;
  const targetId = galleryWrapId || id;

  const galleryWrap = await GalleryWrap.findById(targetId);
  if (!galleryWrap) {
    return res.status(404).json({ message: "Gallery Wrap not found" });
  }

  const imageUrl = galleryWrap?.image;
  if (imageUrl && imageUrl.includes("//")) {
    try {
      const fileName = imageUrl.split("//")[1].split("/")[1];
      const command = new DeleteObjectCommand({
        Bucket: process.env.AWS_BUCKET,
        Key: fileName,
      });
      await s3.send(command);
    } catch (err) {
      console.error("S3 delete failed:", err.message);
    }
  }

  await GalleryWrap.findByIdAndDelete(targetId);
  res.status(200).json({ message: "Gallery Wrap deleted successfully." });
});

module.exports = {
  createGalleryWrap,
  getGalleryWraps,
  getGalleryWrapById,
  updateGalleryWrap,
  deleteGalleryWrap,
};

