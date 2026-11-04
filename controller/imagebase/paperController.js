const Paper = require("../../models/imagebase/paperModel");
const asyncHandler = require("express-async-handler");
const ImageVault = require("../../models/imagebase/imageVaultModel");
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { S3Client } = require("@aws-sdk/client-s3");
const Frame = require("../../models/imagebase/frameModel.js");

const config = {
  region: process.env.AWS_BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
};
const s3 = new S3Client(config);

const createPaper = asyncHandler(async (req, res) => {
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

  const existingPaper = await Paper.findOne({ name });
  if (existingPaper) {
    res.status(400);
    throw new Error("Paper with this name already exists.");
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

  const paper = await Paper.create({
    name,
    image,
    material,
    thickness,
    initialBasePrice: finalInitialBasePrice,
    basePricePerSquareInch: finalBasePrice,
    customDimensions: formattedDimensions,
    photographerDiscount: photographerDiscount || 0,
    userDiscount: userDiscount || 0,
    extraPrice: Number(extraPrice) || 0,
    hasExtraPrice: Boolean(hasExtraPrice),
  });

  res.status(201).send({ paper });
});

const getPapers = asyncHandler(async (req, res) => {
  const { pageNumber = 1, pageSize = 20 } = req.query;
  const papers = await Paper.find({})
    .sort({ createdAt: -1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize);
  if (!papers || papers.length === 0)
    return res.status(400).send({ message: "No Paper found" });

  const totalDocuments = await Paper.countDocuments({});
  const pageCount = Math.ceil(totalDocuments / pageSize);

  res.status(200).json({ papers, pageCount });
});

const getPaperById = asyncHandler(async (req, res) => {
  const { paperId } = req.query;
  const paper = await Paper.findById(paperId);
  if (!paper) {
    return res.status(404).send({ message: "Paper not found" });
  }
  res.status(200).json({ paper });
});

const updatePaper = asyncHandler(async (req, res) => {
  const {
    paperId,
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

  const paper = await Paper.findById(paperId);
  if (!paper) {
    return res.status(404).send({ message: "Paper not found" });
  }

  paper.name = name ?? paper.name;
  paper.image = image ?? paper.image;
  paper.material = material ?? paper.material;
  paper.thickness = thickness ?? paper.thickness;
  paper.initialBasePrice = initialBasePrice ?? paper.initialBasePrice;
  paper.userDiscount = userDiscount ?? paper.userDiscount;
  paper.basePricePerSquareInch =
    basePricePerSquareInch ?? paper.basePricePerSquareInch;
  paper.photographerDiscount =
    photographerDiscount ?? paper.photographerDiscount;
  if (extraPrice !== undefined) paper.extraPrice = extraPrice;
  if (hasExtraPrice !== undefined) paper.hasExtraPrice = hasExtraPrice;
  if (customDimensions) {
    paper.customDimensions = customDimensions;
  }
  const updatedPaper = await paper.save();
  res.status(200).json({ paper: updatedPaper });
});

const deletePaper = asyncHandler(async (req, res) => {
  const { paperId } = req.query;

  const paper = await Paper.findById(paperId);
  if (!paper) {
    return res.status(404).send({ message: "Paper not found" });
  }

  const imageUrl = paper?.image || undefined;
  if (imageUrl) {
    const fileName = imageUrl.split("//")[1].split("/")[1];

    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key: fileName,
    });
    await s3.send(command);
  }

  await Paper.findByIdAndDelete(paperId);
  res.status(200).json({ message: "Paper deleted successfully." });
});

const calculatePaperPrices = asyncHandler(async (req, res) => {
  const { paperId, imageId } = req.query;

  if (!paperId || !imageId) {
    res.status(400);
    throw new Error("Paper ID and Image ID are required.");
  }

  const paper = await Paper.findById(paperId);
  if (!paper) {
    res.status(404);
    throw new Error("Paper not found or is inactive.");
  }

  const image = await ImageVault.findById(imageId);
  if (!image || !image.resolutions) {
    res.status(404);
    throw new Error("Image not found or resolutions missing.");
  }

  const dpi = 300;

  const calculatePriceForResolution = (widthPixels, heightPixels, dpi) => {
    const widthInches = widthPixels / dpi;
    const heightInches = heightPixels / dpi;
    const areaInSquareInches = widthInches * heightInches;
    const rawPrice = paper.basePricePerSquareInch * areaInSquareInches;
    return Math.round(rawPrice * 100) / 100;
  };

  const prices = {};
  for (const [key, resolution] of Object.entries(image.resolutions)) {
    if (resolution.width && resolution.height) {
      const price = calculatePriceForResolution(
        resolution.width,
        resolution.height,
        dpi
      );
      prices[key] = {
        size: {
          width: parseFloat((resolution.width / dpi).toFixed(2)),
          height: parseFloat((resolution.height / dpi).toFixed(2)),
        },
        price,
      };
    }
  }

  const customPrices = paper.customDimensions.map((dimension) => ({
    size: {
      width: dimension.width,
      height: dimension.height,
    },
    price: dimension.price,
  }));

  res.status(200).json({
    message: "Paper prices calculated successfully for all resolutions.",
    data: {
      paperId: paper._id,
      imageId: image._id,
      pricing: {
        resolutions: prices,
        customDimensions: customPrices,
      },
    },
  });
});

const calculatePaperAndFramePrices = asyncHandler(async (req, res) => {
  const { paperId, imageId, frameId } = req.query;

  if (!paperId || !imageId) {
    res.status(400);
    throw new Error("Paper ID and Image ID are required.");
  }

  const paper = await Paper.findById(paperId);
  if (!paper) {
    res.status(404);
    throw new Error("Paper not found or is inactive.");
  }

  const image = await ImageVault.findById(imageId);
  if (!image || !image.resolutions) {
    res.status(404);
    throw new Error("Image not found or resolutions missing.");
  }

  const dpi = 300;

  const calculatePriceForResolution = (widthPixels, heightPixels, dpi) => {
    const widthInches = widthPixels / dpi;
    const heightInches = heightPixels / dpi;
    const areaInSquareInches = widthInches * heightInches;
    const rawPrice = paper.basePricePerSquareInch * areaInSquareInches;
    return Math.round(rawPrice * 100) / 100;
  };

  const prices = {};
  for (const [key, resolution] of Object.entries(image.resolutions)) {
    if (resolution.width && resolution.height) {
      const price = calculatePriceForResolution(
        resolution.width,
        resolution.height,
        dpi
      );
      prices[key] = {
        size: {
          width: parseFloat((resolution.width / dpi).toFixed(2)),
          height: parseFloat((resolution.height / dpi).toFixed(2)),
        },
        price,
      };
    }
  }

  const customPrices = paper.customDimensions.map((dimension) => ({
    size: {
      width: dimension.width,
      height: dimension.height,
    },
    price: dimension.price,
  }));

  // for frames calculation

  const frame = await Frame.findById(frameId);

  if (!frame || !frame.isActive) {
    return res.status(200).send({
      message: "Paper Prices successfully calculated. No Frames found",
      paperpricing: {
        paperId: paper._id,
        imageId: image._id,
        pricing: {
          resolutions: prices,
          customDimensions: customPrices,
        },
      },
    });
  }

  const calculateFramePriceForResolution = (widthPixels, heightPixels, dpi) => {
    const widthInches = widthPixels / dpi;
    const heightInches = heightPixels / dpi;

    const perimeterInches = 2 * (widthInches + heightInches);

    return (
      Math.round(frame.basePricePerLinearInch * perimeterInches * 100) / 100
    );
  };

  const pricesForFrame = {};
  for (const [key, resolution] of Object.entries(image.resolutions)) {
    if (resolution.width && resolution.height) {
      const widthInches = parseFloat((resolution.width / dpi).toFixed(2));
      const heightInches = parseFloat((resolution.height / dpi).toFixed(2));

      const price = calculateFramePriceForResolution(
        resolution.width,
        resolution.height,
        dpi
      );
      pricesForFrame[key] = {
        size: {
          width: widthInches,
          height: heightInches,
        },
        price,
      };
    }
  }

  const customPricesForFrame = frame.customDimensions.map((dimension) => ({
    size: {
      width: dimension.width,
      height: dimension.height,
    },
    price: dimension.price,
  }));

  res.status(200).json({
    message:
      "Paper and frame prices calculated successfully for all resolutions.",
    data: {
      paperId: paper._id,
      imageId: image._id,
      paperpricing: {
        resolutions: prices,
        customDimensions: customPrices,
      },
      framepricing: {
        resolutions: pricesForFrame,
        customDimensions: customPricesForFrame,
      },
    },
  });
});

const getInActivePapers = asyncHandler(async (req, res) => {
  const { pageNumber = 1, pageSize = 20 } = req.query;
  const papers = await Paper.find({ active: false })
    .sort({ createdAt: -1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize);
  if (!papers || papers.length === 0)
    return res.status(400).send({ message: "No Paper found" });

  const totalDocuments = await Paper.countDocuments({ active: false });
  const pageCount = Math.ceil(totalDocuments / pageSize);

  res.status(200).json({ papers, pageCount });
});

const getActivePapers = asyncHandler(async (req, res) => {
  const { pageNumber = 1, pageSize = 20 } = req.query;
  const papers = await Paper.find({ active: true })
    .sort({ createdAt: -1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize);
  if (!papers || papers.length === 0)
    return res.status(400).send({ message: "No Paper found" });

  const totalDocuments = await Paper.countDocuments({ active: true });
  const pageCount = Math.ceil(totalDocuments / pageSize);

  res.status(200).json({ papers, pageCount });
});

const updatePaperStatus = asyncHandler(async (req, res) => {
  const { paperId, status = true } = req.body;

  if (!paperId) {
    return res.status(400).send({ message: "Paper Id is required" });
  }

  await Paper.findOne({ _id: paperId }, { active: status });

  res.status(200).send({ message: "Paper Status updated successfully" });
});

module.exports = {
  createPaper,
  getPapers,
  getPaperById,
  updatePaper,
  deletePaper,
  calculatePaperPrices,
  calculatePaperAndFramePrices,
  getInActivePapers,
  getActivePapers,
  updatePaperStatus,
};
