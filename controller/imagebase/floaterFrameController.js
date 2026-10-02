const FloaterFrame = require("../../models/imagebase/floaterFrameModel");
const asyncHandler = require("express-async-handler");
const { DeleteObjectCommand, S3Client } = require("@aws-sdk/client-s3");

const config = {
  region: process.env.AWS_BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
};
const s3 = new S3Client(config);

const createFloaterFrame = asyncHandler(async (req, res) => {
  const {
    name,
    color = "",
    colorCode = "#18181b",
    image,
    material = "Wood",
    style = "Floater",
    thickness = 1.5,
    initialBasePrice,
    userDiscount = 0,
    photographerDiscount = 0,
    isActive = true,
  } = req.body;

  if (!initialBasePrice || initialBasePrice <= 0) {
    res.status(400);
    throw new Error("Initial base price is required.");
  }

  const existing = await FloaterFrame.findOne({ name });
  if (existing) {
    res.status(400);
    throw new Error("Floater frame with this name already exists.");
  }

  const basePricePerLinearInch = Number(
    (initialBasePrice * (1 - (userDiscount || 0) / 100)).toFixed(2)
  );

  const photographerFinalPrice = Number(
    (basePricePerLinearInch * (1 - (photographerDiscount || 0) / 100)).toFixed(2)
  );

  const floaterFrame = await FloaterFrame.create({
    name,
    color,
    colorCode,
    image,
    material,
    style,
    thickness,
    initialBasePrice,
    userDiscount,
    basePricePerLinearInch,
    photographerDiscount,
    photographerFinalPrice,
    isActive,
    active: isActive,
  });

  res.status(201).json({ floaterFrame });
});

const getFloaterFrames = asyncHandler(async (req, res) => {
  const floaterFrames = await FloaterFrame.find({ active: { $ne: false } }).sort({ createdAt: -1 });
  res.status(200).json({ floaterFrames: floaterFrames || [] });
});

const getFloaterFrameById = asyncHandler(async (req, res) => {
  const floaterFrame = await FloaterFrame.findById(req.query.id);
  if (!floaterFrame) {
    res.status(404);
    throw new Error("Floater frame not found.");
  }
  res.status(200).json({ floaterFrame });
});

const updateFloaterFrame = asyncHandler(async (req, res) => {
  const {
    id,
    _id,
    name,
    color,
    colorCode,
    image,
    material,
    style,
    thickness,
    initialBasePrice,
    userDiscount,
    photographerDiscount,
    isActive,
  } = req.body;

  const frameId = id || _id;
  const floaterFrame = await FloaterFrame.findById(frameId);
  if (!floaterFrame) {
    res.status(404);
    throw new Error("Floater frame not found.");
  }

  if (name !== undefined) floaterFrame.name = name;
  if (color !== undefined) floaterFrame.color = color;
  if (colorCode !== undefined) floaterFrame.colorCode = colorCode;
  if (image !== undefined) floaterFrame.image = image;
  if (material !== undefined) floaterFrame.material = material;
  if (style !== undefined) floaterFrame.style = style;
  if (thickness !== undefined) floaterFrame.thickness = thickness;
  if (isActive !== undefined) {
    floaterFrame.isActive = isActive;
    floaterFrame.active = isActive;
  }

  if (initialBasePrice !== undefined) floaterFrame.initialBasePrice = initialBasePrice;
  if (userDiscount !== undefined) floaterFrame.userDiscount = userDiscount;
  if (photographerDiscount !== undefined) floaterFrame.photographerDiscount = photographerDiscount;

  const baseAfterUserDiscount =
    floaterFrame.initialBasePrice * (1 - (floaterFrame.userDiscount || 0) / 100);

  floaterFrame.basePricePerLinearInch = Number(baseAfterUserDiscount.toFixed(2));
  floaterFrame.photographerFinalPrice = Number(
    (floaterFrame.basePricePerLinearInch * (1 - (floaterFrame.photographerDiscount || 0) / 100)).toFixed(2)
  );

  const updatedFloaterFrame = await floaterFrame.save();
  res.status(200).json({ updatedFloaterFrame });
});

const deleteFloaterFrame = asyncHandler(async (req, res) => {
  const floaterFrame = await FloaterFrame.findById(req.query.id);
  if (!floaterFrame) {
    return res.status(404).json({ message: "Floater frame not found." });
  }

  // Attempt S3 image cleanup if images exist
  if (Array.isArray(floaterFrame.image)) {
    for (const img of floaterFrame.image) {
      if (!img) continue;
      const fileName = img.split(".amazonaws.com/")[1];
      if (!fileName) continue;
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET,
            Key: fileName,
          })
        );
      } catch (err) {
        console.warn("Could not delete S3 image:", fileName, err.message);
      }
    }
  }

  await FloaterFrame.findByIdAndDelete(req.query.id);
  res.status(200).json({ message: "Floater frame deleted successfully." });
});

module.exports = {
  createFloaterFrame,
  getFloaterFrames,
  getFloaterFrameById,
  updateFloaterFrame,
  deleteFloaterFrame,
};
