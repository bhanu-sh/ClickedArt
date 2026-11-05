const asyncHandler = require("express-async-handler");
const User = require("../models/userModel.js");
const Photographer = require("../models/photographerModel.js");
const { generateFromEmail } = require("unique-username-generator");
const UserType = require("../models/typeModel.js");
const {
  sendResetEmail,
  sendVerificationEmail,
} = require("../middleware/handleEmail.js");
const { differenceInYears, parseISO, isValid } = require("date-fns");
const ImageVault = require("../models/imagebase/imageVaultModel.js");
const Artwork = require("../models/artworkModel.js");
const Referral = require("../models/referralModel.js");
const {
  sendApprovedMail,
  sendRejectionEmail,
} = require("../middleware/handleEmail.js");
const { sendOtpSms } = require("../middleware/sendOtpSms.js");
const Subscription = require("../models/subscriptionModel.js");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const registerPhotographer = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    active = true,
    photographerStatus = "approved",
    email,
    password,
    mobile,
    whatsapp,
    bio,
    dob,
    profileImage,
    shippingAddress,
    isCompany,
    companyName,
    companyEmail,
    companyAddress,
    companyPhone,
    portfolioLink,
    photographyStyles,
    yearsOfExperience,
    accountType,
    connectedAccounts,
    expertise,
    awards,
    achievements,
    bestPhotos,
    referralcode,
    coverImage,
    username,
  } = req.body;

  if (!firstName || !email || !password) {
    return res
      .status(400)
      .json({ status: false, message: "All Fields are required" });
  }

  const existingPhotographer = await Photographer.findOne({ email });
  if (existingPhotographer) {
    return res
      .status(400)
      .json({ status: false, message: "Email already exist" });
  }

  const photographerExist = await Photographer.findOne({ username });
  if (photographerExist) {
    return res.status(400).send({ message: "username already exist" });
  }
  const existingMobile = await Photographer.findOne({ mobile });
  if (existingMobile) {
    return res
      .status(400)
      .json({ status: false, message: "Mobile number already exist" });
  }

  let age;
  if (dob) {
    const birthDate = parseISO(dob);
    if (isValid(birthDate)) {
      age = differenceInYears(new Date(), birthDate);
    } else {
      return res
        .status(400)
        .send({ status: false, message: "Invalid date of birth" });
    }
  }

  const photographerData = {
    firstName,
    email,
    username,
    password,
    companyName: !companyName ? firstName : companyName,
  };

  if (isCompany) {
    if (!companyName || !companyEmail || !companyAddress || !companyPhone) {
      throw new Error(
        "Company details are required! Otherwise Please register as freelancer",
      );
    } else {
      photographerData.isCompany = isCompany;
      photographerData.companyAddress = companyAddress;
      photographerData.companyPhone = companyPhone;
    }
  }

  if (referralcode) {
    const now = Date.now();
    const referral = await Referral.findOne({
      code: referralcode,
      status: "active",
      expirationDate: { $gt: now },
    }).populate("photographer");
    if (!referral) {
      return res.status(400).send({ message: "Referral Code is not valid" });
    }
  }

  const photographer = new Photographer({
    firstName,
    lastName,
    email,
    username,
    password,
    shippingAddress,
    bio,
    dob,
    age,
    profileImage,
    portfolioLink,
    mobile,
    whatsapp,
    yearsOfExperience,
    accountType,
    photographyStyles,
    photographerStatus,
    active,
    companyName: !companyName ? firstName : companyName,
    isCompany: photographerData.isCompany,
    companyEmail: !companyEmail ? email : companyEmail,
    companyAddress: photographerData.companyAddress || undefined,
    companyPhone: photographerData.companyPhone,
    connectedAccounts,
    expertise,
    awards,
    achievements,
    bestPhotos,
    referralcode,
    coverImage,
  });

  const otp = Math.floor(100000 + Math.random() * 900000);

  let emailSent = false;
  let smsSent = false;
  let notificationErrors = [];

  try {
    await sendVerificationEmail(otp, email);
    emailSent = true;
  } catch (error) {
    notificationErrors.push("Email failed: " + error.message);
  }

  try {
    await sendOtpSms(mobile, otp);
    smsSent = true;
  } catch (error) {
    notificationErrors.push("SMS failed: " + error.message);
  }

  // Proceed if at least one notification succeeded
  if (!emailSent && !smsSent) {
    return res.status(500).json({
      status: false,
      message: "Failed to send OTP via email and SMS. Registration aborted.",
      errors: notificationErrors,
    });
  }

  photographer.otp = otp.toString();
  await photographer.save();

  await UserType.create({
    user: photographer._id,
    username: photographer.username,
    type: photographer.type,
  });

  res.status(201).json({
    status: true,
    message: `Verification OTP sent via ${
      emailSent && smsSent ? "email and SMS" : emailSent ? "email" : "SMS"
    }. Please verify your email for login.`,
    errors: notificationErrors.length ? notificationErrors : undefined,
    _id: photographer._id,
    email: photographer.email,
  });
});

const updatePhotographer = asyncHandler(async (req, res) => {
  const {
    photographerId,
    firstName,
    lastName,
    email,
    oldPassword,
    password,
    bio,
    dob,
    mobile,
    whatsapp,
    profileImage,
    shippingAddress,
    isCompany,
    companyName,
    companyEmail,
    companyAddress,
    companyPhone,
    portfolioLink,
    photographyStyles,
    yearsOfExperience,
    accountType,
    connectedAccounts,
    expertise,
    awards,
    achievements,
    bestPhotos,
    coverImage,
  } = req.body;

  const photographer = await Photographer.findById(photographerId);
  if (!photographer) {
    return res
      .status(404)
      .json({ status: false, message: "Photographer not found" });
  }

  if (email && email !== photographer.email) {
    const existingPhotographer = await Photographer.findOne({ email });
    if (existingPhotographer) {
      return res
        .status(400)
        .json({ status: false, message: "Email already exists" });
    }
  }

  let age;
  if (dob) {
    const birthDate = parseISO(dob);
    if (isValid(birthDate)) {
      age = differenceInYears(new Date(), birthDate);
      photographer.dob = dob;
      photographer.age = age;
    } else {
      return res
        .status(400)
        .json({ status: false, message: "Invalid date of birth" });
    }
  }

  if (isCompany !== undefined && isCompany !== photographer.isCompany) {
    photographer.isCompany = isCompany;
    if (isCompany) {
      if (!companyName || !companyEmail || !companyAddress || !companyPhone) {
        return res
          .status(400)
          .json({ status: false, message: "Company details are required!" });
      }
      photographer.companyName = companyName;
      photographer.companyEmail = companyEmail;
      photographer.companyAddress = companyAddress;
      photographer.companyPhone = companyPhone;
    } else {
      photographer.companyName = photographer.name;
      photographer.companyEmail = photographer.email;
      photographer.companyAddress = undefined;
      photographer.companyPhone = undefined;
    }
  }
  if (firstName) photographer.firstName = firstName;
  if (lastName) photographer.lastName = lastName;
  if (email) photographer.email = email;
  if (bio) photographer.bio = bio;
  if (profileImage) photographer.profileImage = profileImage;
  if (shippingAddress) photographer.shippingAddress = shippingAddress;
  if (portfolioLink) photographer.portfolioLink = portfolioLink;
  if (photographyStyles) photographer.photographyStyles = photographyStyles;
  if (yearsOfExperience) photographer.yearsOfExperience = yearsOfExperience;
  if (accountType) photographer.accountType = accountType;
  if (connectedAccounts) photographer.connectedAccounts = connectedAccounts;
  if (password && oldPassword) {
    const isMatch = await photographer.isPasswordCorrect(oldPassword);
    console.log("isMatch", isMatch);
    if (!isMatch) {
      throw new Error("Password Not matched");
    }
    photographer.password = password;
  }
  if (mobile) photographer.mobile = mobile;
  if (whatsapp) photographer.whatsapp = whatsapp;
  if (expertise) photographer.expertise = expertise;
  if (awards) photographer.awards = awards;
  if (achievements) photographer.achievements = achievements;
  if (bestPhotos) photographer.bestPhotos = bestPhotos;
  if (coverImage) photographer.coverImage = coverImage;

  await photographer.save();

  res.status(200).json({
    status: true,
    message: "Photographer updated successfully",
    photographer,
  });
});

const photographerLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      status: false,
      message: "Email and password are required",
    });
  }

  const photographer = await Photographer.findOne({
    email: email.toLowerCase(),
  });

  if (!photographer) {
    return res.status(401).json({
      status: false,
      message: "Invalid email or password",
    });
  }

  const isPasswordValid = await photographer.isPasswordCorrect(
    String(password).trim(),
  );

  if (!isPasswordValid) {
    return res.status(401).json({
      status: false,
      message: "Invalid email or password",
    });
  }

  if (!photographer.isEmailVerified) {
    return res.status(403).json({
      status: false,
      message: "Please verify your email before logging in",
    });
  }

  if (
    photographer.photographerStatus === "pending" ||
    photographer.photographerStatus === "rejected"
  ) {
    return res.status(403).json({
      status: false,
      message: "Your account is awaiting admin approval",
    });
  }

  if (!photographer.active) {
    return res.status(403).json({
      status: false,
      message: "Your profile has been deactivated. Contact support.",
    });
  }

  const token = await photographer.generateAccessToken();

  photographer.lastActive = new Date();
  photographer.lastLogin = new Date();
  await photographer.save();

  const responseUser = photographer.toObject();
  delete responseUser.password;

  return res.status(200).json({
    status: true,
    message: "Photographer login successful",
    photographer: responseUser,
    token,
  });
});

const handlePhotographerStatusUpdate = asyncHandler(async (req, res) => {
  const { action, photographerId } = req.body;

  const photographer = await Photographer.findById(photographerId);
  if (!photographer) {
    return res
      .status(400)
      .send({ status: false, message: "Photographer not Found" });
  }
  const validStatusTypes = new Set(["approved", "rejected"]);

  if (!validStatusTypes.has(action?.toLowerCase())) {
    return res.status(400).json({ status: false, message: "Invalid Action" });
  }

  if (action === "approved") {
    ((photographer.photographerStatus = "approved"),
      (photographer.active = true));
    photographer.rejectedAt = null;
    if (photographer.user) {
      const user = await User.findById(photographer.user);
      user.photographer = photographer._id;
      await user.save();
    }
    const name = `${photographer.firstName} ${photographer.lastName}`;
    const email = photographer.email;
    sendApprovedMail(name, email);
  } else if (action === "rejected") {
    ((photographer.photographerStatus = "rejected"),
      (photographer.rejectedAt = new Date()));
    const name = `${photographer.firstName} ${photographer.lastName}`;
    const email = photographer.email;
    sendRejectionEmail(name, email);
  } else {
    return res.status(400).json({ status: false, message: "Invalid Action" });
  }
  await photographer.save();
  await photographer.generateAccessToken();
  res.status(200).json({ status: true, message: `Photographer got ${action}` });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      status: false,
      message: "Email is required",
    });
  }

  const existedUser = await Photographer.findOne({
    email: email.toLowerCase(),
  });

  if (!existedUser) {
    return res.status(404).json({
      status: false,
      message: "Account with this email does not exist",
    });
  }

  if (!existedUser.isEmailVerified) {
    return res.status(403).json({
      status: false,
      message:
        "Email is not verified. Please verify your email before resetting password.",
    });
  }

  const randomPassword = await sendResetEmail(existedUser.email);

  existedUser.password = randomPassword;
  await existedUser.save();

  return res.status(200).json({
    status: true,
    message: "Temporary password sent to your email",
  });
});

const getAllPhotographers = asyncHandler(async (req, res) => {
  const { pageNumber = 1, pageSize = 20 } = req.query;

  const photographers = await Photographer.find({ active: true })
    .sort({ firstName: 1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize);

  if (!photographers || photographers.length === 0)
    return res.status(400).send({ message: "Photographers not found" });

  const totalDocuments = await Photographer.countDocuments({ active: true });
  const pageCount = Math.ceil(totalDocuments / pageSize);

  res.status(200).send({ photographers, pageCount });
});

const getAllPhotographersForAdmin = asyncHandler(async (req, res) => {
  try {
    const { pageNumber = 1, pageSize = 20 } = req.query;

    const [photographers, totalDocuments] = await Promise.all([
      Photographer.find({ active: true })
        .sort({ firstName: 1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Photographer.countDocuments({ active: true }),
    ]);

    if (!photographers.length)
      return res.status(404).json({ message: "No photographers found" });

    const photographerIds = photographers.map((p) => p._id);
    const pageCount = Math.ceil(totalDocuments / pageSize);

    const [subscriptions, activeImages, pendingImages] = await Promise.all([
      Subscription.find({
        "userInfo.user": { $in: photographerIds },
        isActive: true,
      })
        .populate("planId")
        .lean(),

      ImageVault.aggregate([
        { $match: { photographer: { $in: photographerIds }, isActive: true } },
        { $group: { _id: "$photographer", count: { $sum: 1 } } },
      ]),

      ImageVault.aggregate([
        {
          $match: {
            photographer: { $in: photographerIds },
            exclusiveLicenseStatus: { $in: ["pending", "review"] },
            isActive: false,
          },
        },
        { $group: { _id: "$photographer", count: { $sum: 1 } } },
      ]),
    ]);

    const subscriptionMap = new Map(
      subscriptions.map((s) => [
        s.userInfo.user.toString(),
        s.planId?.name || "Basic",
      ]),
    );
    const activeImageMap = new Map(
      activeImages.map((i) => [i._id.toString(), i.count]),
    );
    const pendingImageMap = new Map(
      pendingImages.map((i) => [i._id.toString(), i.count]),
    );

    const enrichedPhotographers = photographers.map((p) => ({
      ...p,
      activeSubscription: subscriptionMap.get(p._id.toString()) || "Basic",
      activeUploadingImgCount: activeImageMap.get(p._id.toString()) || 0,
      pendingImagesCount: pendingImageMap.get(p._id.toString()) || 0,
    }));

    return res
      .status(200)
      .json({ photographers: enrichedPhotographers, pageCount });
  } catch (error) {
    console.error("Error fetching photographers:", error);
    return res.status(500).json({ message: "Failed to fetch photographers" });
  }
});

const getPhotographersWithMostPhotoViews = asyncHandler(async (req, res) => {
  // view count is in ImageAnalytics model which has reference to ImageVault model which has reference to Photographer
  const topPhotographers = await ImageVault.aggregate([
    {
      $lookup: {
        from: "imageanalytics",
        localField: "_id",
        foreignField: "image",
        as: "analytics",
      },
    },
    { $unwind: "$analytics" },
    {
      $group: {
        _id: "$photographer",
        totalViews: { $sum: "$analytics.views" },
      },
    },
    { $sort: { totalViews: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "photographers",
        localField: "_id",
        foreignField: "_id",
        as: "photographerDetails",
      },
    },
    { $unwind: "$photographerDetails" },
    {
      $project: {
        _id: 0,
        photographerId: "$photographerDetails._id",
        firstName: "$photographerDetails.firstName",
        lastName: "$photographerDetails.lastName",
        profileImage: "$photographerDetails.profileImage",
        totalViews: 1,
      },
    },
  ]);
  res.status(200).json({ topPhotographers });
});

const getAllNotFeaturedPhotographers = asyncHandler(async (req, res) => {
  const { pageNumber = 1, pageSize = 20 } = req.query;

  let photographers = await Photographer.find({
    active: true,
    featuredArtist: false,
    _id: { $ne: new mongoose.Types.ObjectId("67cacbe7303273699a9c7db4") },
  })
    .sort({ firstName: 1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize);

  if (!photographers || photographers.length === 0)
    return res.status(400).send({ message: "Photographers not found" });

  const totalDocuments = await Photographer.countDocuments({
    active: true,
    featuredArtist: false,
    _id: { $ne: new mongoose.Types.ObjectId("67cacbe7303273699a9c7db4") },
  });
  const pageCount = Math.ceil(totalDocuments / pageSize);

  photographers = await Promise.all(
    photographers.map(async (photographer) => {
      const subscription = await Subscription.findOne({
        "userInfo.user": photographer._id,
        isActive: true,
      }).populate("planId");

      const activeSubscription = subscription?.planId?.name || "Basic";
      const activeUploadingImgCount = await ImageVault.countDocuments({
        photographer,
        isActive: true,
      });
      const pendingImagesCount = await ImageVault.countDocuments({
        photographer,
        exclusiveLicenseStatus: { $in: ["pending", "review"] },
        isActive: false,
      });

      return {
        ...photographer.toObject(),
        activeSubscription,
        activeUploadingImgCount,
        pendingImagesCount,
      };
    }),
  );

  res.status(200).send({ photographers, pageCount });
});

const getPhotographerById = asyncHandler(async (req, res) => {
  const { photographerId } = req.query;

  const photographer = await Photographer.findOne({ _id: photographerId });

  if (!photographer)
    return res.status(400).send({ message: "Photographer not found" });

  res.status(200).send({ photographer });
});

const getAllPendingPhotographersForAdmin = asyncHandler(async (req, res) => {
  const { pageNumber = 1, pageSize = 20 } = req.query;

  const photographers = await Photographer.find({
    photographerStatus: "pending",
    active: false,
  })
    .sort({
      createdAt: -1,
    })
    .skip((pageNumber - 1) * pageSize)
    .limit({ pageSize });

  if (!photographers || photographers.length === 0) {
    res.status(404);
    throw new Error("Photographer not found");
  }

  const totalDocuments = await Photographer.countDocuments({
    photographerStatus: "pending",
    active: false,
  });
  const pageCount = Math.ceil(totalDocuments / pageSize);

  res.status(200).send({ photographers, pageCount });
});

const updatePhotographerRank = asyncHandler(async (req, res) => {
  const { rank, photographerId } = req.body;

  const validRank = ["master", "professional", "ambassador"];

  if (!rank) {
    return res.status(400).send({ message: "Rank is required" });
  }

  if (!validRank.includes(rank)) {
    return res.status(400).send({ message: "Rank is not valid" });
  }
  const photographer = await Photographer.findOne({ _id: photographerId });

  if (!photographer) {
    return res.status(400).send({ message: "Photographer not found" });
  }
  photographer.rank = rank;

  await photographer.save();

  res.status(200).send({ message: "Photographer Rank updated" });
});

const toggleFeaturedPhotographer = asyncHandler(async (req, res) => {
  const { photographerId } = req.body;

  const photographer = await Photographer.findOne({ _id: photographerId });

  if (!photographer) {
    throw new Error("Photographer not found");
  }
  photographer.featuredArtist = !photographer.featuredArtist;

  await photographer.save();

  res
    .status(200)
    .send({ message: "Featured Photographer toggle successfully" });
});

const getFeaturedPhotographer = asyncHandler(async (req, res) => {
  const { pageNumber = 1, pageSize = 20 } = req.query;

  const [featuredPhotographer, totalDocuments] = await Promise.all([
    Photographer.find({ featuredArtist: true })
      .sort({ firstName: 1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize),
    Photographer.countDocuments({ featuredArtist: true }),
  ]);

  if (!featuredPhotographer || featuredPhotographer.length === 0) {
    return res.status(400).send({ message: "Featured Photographer not found" });
  }
  const pageCount = Math.ceil(totalDocuments / pageSize);

  res.status(200).send({ featuredPhotographer, pageCount });
});

const verifyPhotographerProfile = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const user = await Photographer.findOne({ email });
  if (!user) return res.status(400).send({ message: "User not found" });

  if (user.otp !== otp)
    return res.status(400).send({ message: "OTP not valid" });
  user.isEmailVerified = true;
  user.otp = "";
  await user.save();

  res.status(200).send({
    message:
      "Photographer email verified successfully. We will let u know once admin will approve you as a Photographer",
    photographer: user,
  });
});

const resendOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await Photographer.findOne({ email });
  if (!user) return res.status(400).send({ message: "User not found" });

  const mobile = user.mobile;
  const otp = Math.floor(100000 + Math.random() * 900000);

  let emailSent = false;
  let smsSent = false;
  let errors = [];

  try {
    await sendVerificationEmail(otp, email);
    emailSent = true;
  } catch (error) {
    errors.push("Email failed: " + error.message);
  }

  try {
    await sendOtpSms(mobile, otp);
    smsSent = true;
  } catch (error) {
    errors.push("SMS failed: " + error.message);
  }

  if (emailSent || smsSent) {
    user.otp = otp.toString();
    await user.save();

    return res.status(200).send({
      message: `OTP resent via ${
        emailSent && smsSent ? "email and SMS" : emailSent ? "email" : "SMS"
      }`,
      errors: errors.length ? errors : undefined,
      photographer: user,
    });
  } else {
    return res.status(500).send({
      message: "Failed to resend OTP via both email and SMS.",
      errors,
    });
  }
});

// Fuzzy matching helpers for typo-tolerant / closest search
function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],
          dp[i][j - 1],
          dp[i - 1][j - 1]
        );
      }
    }
  }
  return dp[m][n];
}

function getSimilarity(query, target) {
  if (!query || !target) return 0;
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();

  if (q === t) return 1.0;
  if (t.includes(q)) return 0.95;

  const words = t.split(/[\s_.-]+/).filter(Boolean);
  let bestScore = 0;
  for (const word of words) {
    if (word === q) return 0.95;
    if (word.includes(q)) return 0.90;
    const dist = levenshteinDistance(q, word);
    const maxLen = Math.max(q.length, word.length);
    const wordScore = (maxLen - dist) / maxLen;
    if (wordScore > bestScore) {
      bestScore = wordScore;
    }
  }

  const qClean = q.replace(/[\s_.-]+/g, "");
  const tClean = t.replace(/[\s_.-]+/g, "");
  if (qClean === tClean) return 0.98;
  if (tClean.includes(qClean)) return 0.92;

  const dist = levenshteinDistance(qClean, tClean);
  const maxLen = Math.max(qClean.length, tClean.length);
  const fullScore = (maxLen - dist) / maxLen;

  return Math.max(bestScore, fullScore);
}

const searchPhotographers = async (req, res) => {
  let { Query, pageSize = 20, pageNumber = 1 } = req.query;

  if (!Query) {
    return res.status(400).send({ message: "Query is required" });
  }

  pageSize = parseInt(pageSize, 10);
  pageNumber = parseInt(pageNumber, 10);

  let results = [];
  let total = 0;

  // 1. Try Atlas Search index first if available
  try {
    results = await Photographer.aggregate([
      {
        $search: {
          index: "photographerindex",
          compound: {
            should: [
              {
                autocomplete: {
                  query: Query,
                  path: "username",
                  fuzzy: { maxEdits: 1 },
                  score: { boost: { value: 10 } },
                },
              },
              {
                autocomplete: {
                  query: Query,
                  path: "firstName",
                  fuzzy: { maxEdits: 1 },
                  score: { boost: { value: 5 } },
                },
              },
              {
                autocomplete: {
                  query: Query,
                  path: "lastName",
                  fuzzy: { maxEdits: 1 },
                  score: { boost: { value: 5 } },
                },
              },
            ],
            minimumShouldMatch: 1,
          },
        },
      },
      {
        $addFields: {
          score: { $meta: "searchScore" },
        },
      },
      {
        $match: {
          score: { $gte: 5 },
        },
      },
      { $limit: pageSize },
    ]);

    if (results && results.length > 0) {
      const totalDocuments = await Photographer.aggregate([
        {
          $search: {
            index: "photographerindex",
            text: {
              query: Query,
              path: ["firstName", "lastName", "email", "bio"],
              fuzzy: {
                maxEdits: 2,
                prefixLength: 3,
              },
            },
          },
        },
        { $count: "total" },
      ]);
      total = totalDocuments.length > 0 ? totalDocuments[0].total : results.length;
    }
  } catch (err) {
    console.error("Atlas search error, falling back to regex:", err.message);
    results = [];
  }

  // 2. Fallback to Regex search if Atlas search returned no results or is unindexed
  if (!results || results.length === 0) {
    const escapedQuery = Query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escapedQuery, "i");
    const filter = {
      $or: [
        { username: regex },
        { firstName: regex },
        { lastName: regex },
        { bio: regex },
      ],
    };

    total = await Photographer.countDocuments(filter);
    if (total > 0) {
      const docs = await Photographer.find(filter)
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize);

      results = await Promise.all(
        docs.map(async (doc) => {
          const photosCount = await ImageVault.countDocuments({
            photographer: doc._id,
            isActive: true,
          });
          return {
            ...doc.toObject(),
            photosCount,
          };
        })
      );
    }
  }

  // 3. Fallback to Fuzzy / Closest-match search (for typos like "SClickedart", "clickdeart", "brijsh")
  if (!results || results.length === 0) {
    const allPhotographers = await Photographer.find()
      .select("username firstName lastName bio profileImage coverImage role active createdAt")
      .lean();

    const scored = allPhotographers
      .map((p) => {
        const uScore = getSimilarity(Query, p.username || "");
        const fScore = getSimilarity(Query, p.firstName || "");
        const lScore = getSimilarity(Query, p.lastName || "");
        const fullNameScore = getSimilarity(Query, `${p.firstName || ""} ${p.lastName || ""}`.trim());
        const maxScore = Math.max(uScore, fScore, lScore, fullNameScore);
        return { photographer: p, score: maxScore };
      })
      .filter((item) => item.score >= 0.60)
      .sort((a, b) => b.score - a.score);

    total = scored.length;
    const paged = scored.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

    results = await Promise.all(
      paged.map(async ({ photographer: doc }) => {
        const photosCount = await ImageVault.countDocuments({
          photographer: doc._id,
          isActive: true,
        });
        return {
          ...doc,
          photosCount,
        };
      })
    );
  } else if (results.length > 0 && !results[0].photosCount) {
    results = await Promise.all(
      results.map(async (doc) => {
        const photosCount = await ImageVault.countDocuments({
          photographer: doc._id,
          isActive: true,
        });
        return {
          ...doc,
          photosCount,
        };
      })
    );
  }

  const pageCount = Math.ceil(total / pageSize) || 1;
  res.status(200).json({ results, pageCount });
};

const getPhotographerByUserName = asyncHandler(async (req, res) => {
  const { username } = req.query;

  const user = await Photographer.findOne({
    username: { $regex: new RegExp(`^${username}$`, "i") },
  });

  if (!user) return res.status(400).send({ message: "User not found" });

  res.status(200).send({ user });
});

const updateCoverImage = asyncHandler(async (req, res) => {
  const { photographerId, coverImage } = req.query;

  const photographer = await Photographer.findOneAndUpdate(
    {
      _id: photographerId,
    },
    {
      $set: { coverImage },
    },
    {
      new: true,
    },
  );

  if (!photographer) {
    return res
      .status(400)
      .send({ message: "Photographer not found to update" });
  }

  res.status(200).send({ message: "Profile Cover Image Updated" });
});

const checkPhotographerUserNameExist = asyncHandler(async (req, res) => {
  const { username, email, mobile } = req.body;

  const user = await Photographer.findOne({ username });

  const userEmail = await Photographer.findOne({ email });

  const userMobile = await Photographer.findOne({ mobile });

  if (userEmail || user || userMobile) {
    const isVerified = userEmail ? userEmail.isEmailVerified : false;
    return res.status(409).send({
      emailExists: !!userEmail,
      usernameExists: !!user,
      mobileExists: !!userMobile,
      isVerified,
    });
  }

  return res.status(200).send({
    usernameExists: false,
    emailExists: false,
  });
});

const checkAndUpdateRejectedPhotographers = asyncHandler(async (req, res) => {
  const result = await Photographer.deleteMany({
    photographerStatus: "rejected",
  });
  console.log(`Deleted ${result.deletedCount} rejected photographers.`);
});

const changePassword = asyncHandler(async (req, res) => {
  const { userId, newPassword, oldPassword } = req.body;

  const photographer = await Photographer.findOne({ _id: userId });

  if (!photographer) {
    return res.status(400).send({ message: "Photographer not found" });
  }

  if (!newPassword || !oldPassword) {
    throw new Error("Password Field is required");
  }

  if (newPassword && oldPassword) {
    const isMatch = await photographer.isPasswordCorrect(oldPassword);
    if (!isMatch) throw new Error("Password not matched");
    photographer.password = newPassword;
  }

  await photographer.save();

  res.status(200).send({ photographer });
});

const deletePhotographer = asyncHandler(async (req, res) => {
  const { photographer } = req.query;

  await ImageVault.updateMany({ photographer }, { isActive: false });
  await Photographer.findOneAndUpdate({ _id: photographer }, { active: false });

  res
    .status(200)
    .send({ message: "Photographer profile deactivated successfully" });
});

const getPendingImagesByPhotographer = asyncHandler(async (req, res) => {
  const { photographer, pageSize = Infinity } = req.query;

  const [pendingImages, totalDocuments] = await Promise.all([
    ImageVault.find({
      photographer,
      exclusiveLicenseStatus: { $in: ["pending", "review"] },
      isActive: false,
    }).populate("photographer category license"),
    ImageVault.countDocuments({
      photographer,
      exclusiveLicenseStatus: { $in: ["pending", "review"] },
      isActive: false,
    }),
  ]);

  if (!pendingImages || pendingImages.length === 0) {
    return res.status(400).send({ message: "No Pending Images found" });
  }

  const pageCount = Math.ceil(totalDocuments / pageSize);

  res.status(200).send({ pendingImages, pageCount });
});

const getPendingArtworksByPhotographer = asyncHandler(async (req, res) => {
  const { photographer, pageSize = Infinity } = req.query;

  const [pendingImages, totalDocuments] = await Promise.all([
    Artwork.find({
      photographer,
      exclusiveLicenseStatus: { $in: ["pending", "review"] },
      isActive: false,
    }).populate("photographer category license"),
    Artwork.countDocuments({
      photographer,
      exclusiveLicenseStatus: { $in: ["pending", "review"] },
      isActive: false,
    }),
  ]);

  if (!pendingImages || pendingImages.length === 0) {
    return res.status(400).send({ message: "No Pending Images found" });
  }

  const pageCount = Math.ceil(totalDocuments / pageSize);

  res.status(200).send({ pendingImages, pageCount });
});

const makeArtistOfTheMonth = asyncHandler(async (req, res) => {
  const { photographerId } = req.body;

  const photographer = await Photographer.findById(photographerId);
  if (!photographer) {
    return res.status(404).send({ message: "Photographer not found" });
  }

  if (photographer.artistOfTheMonth) {
    return res.status(409).send({
      message: "Photographer is already Artist of the Month",
    });
  }

  await Photographer.updateMany(
    { artistOfTheMonth: true },
    { $set: { artistOfTheMonth: false } },
  );

  photographer.artistOfTheMonth = true;
  photographer.artistOfTheMonthDate = new Date();
  await photographer.save();

  res.status(200).send({
    message: "Photographer is now Artist of the Month",
    photographer,
  });
});

const getArtistOfTheMonth = asyncHandler(async (req, res) => {
  const artist = await Photographer.findOne({ artistOfTheMonth: true });

  if (!artist) {
    return res.status(404).send({ message: "No Artist of the Month found" });
  }

  res.status(200).send(artist);
});

const removeArtistOfTheMonth = asyncHandler(async (req, res) => {
  const currentArtist = await Photographer.findOne({ artistOfTheMonth: true });

  if (!currentArtist) {
    return res
      .status(404)
      .send({ message: "No Artist of the Month to remove" });
  }

  currentArtist.artistOfTheMonth = false;
  currentArtist.artistOfTheMonthDate = null;
  await currentArtist.save();

  res.status(200).send({
    message: "Artist of the Month removed",
    photographer: currentArtist,
  });
});

const getInactivePhotographersByLastLogin = asyncHandler(async (req, res) => {
  const { pageNumber = 1, pageSize = 20 } = req.query;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const inactivePhotographers = await Photographer.find({
    lastLogin: { $lt: oneWeekAgo },
  })
    .skip((pageNumber - 1) * pageSize)
    .limit(Number(pageSize));

  if (!inactivePhotographers || inactivePhotographers.length === 0) {
    return res.status(400).send({ message: "No Inactive Photographers Found" });
  }

  const totalDocuments = await Photographer.countDocuments({
    lastLogin: { $lt: oneWeekAgo },
  });

  const pageCount = Math.ceil(totalDocuments / pageSize);

  res.json({ inactivePhotographers, pageCount });
});

const getActivePhotographers = asyncHandler(async (req, res) => {
  const { pageNumber = 1, pageSize = 20 } = req.query;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const activePhotographers = await Photographer.find({
    lastActive: { $gte: oneWeekAgo },
  })
    .lean()
    .skip((pageNumber - 1) * Number(pageSize))
    .limit(Number(pageSize));
  if (!activePhotographers || activePhotographers.length === 0) {
    return res.status(400).send({ message: "No Active Photographers Found" });
  }
  const totalDocuments = await Photographer.countDocuments({
    lastActive: { $gte: oneWeekAgo },
  });

  const pageCount = Math.ceil(totalDocuments / pageSize);

  await Promise.all(
    activePhotographers.map(async (photographer) => {
      const imagesCount = await ImageVault.countDocuments({
        photographer: photographer._id,
        isActive: true,
      });
      photographer.imagesCount = imagesCount;
    }),
  );

  res.json({ activePhotographers, pageCount });
});

const getInactivePhotographers = asyncHandler(async (req, res) => {
  const { pageNumber = 1, pageSize = 20 } = req.query;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const inactivePhotographers = await Photographer.find({
    lastActive: { $lt: oneWeekAgo },
  })
    .lean()
    .skip((pageNumber - 1) * Number(pageSize))
    .limit(Number(pageSize));

  if (!inactivePhotographers || inactivePhotographers.length === 0) {
    return res.status(400).send({ message: "No Inactive Photographers Found" });
  }

  const totalDocuments = await Photographer.countDocuments({
    lastActive: { $lt: oneWeekAgo },
  });

  const pageCount = Math.ceil(totalDocuments / pageSize);

  await Promise.all(
    inactivePhotographers.map(async (photographer) => {
      const imagesCount = await ImageVault.countDocuments({
        photographer: photographer._id,
        isActive: true,
      });
      photographer.imagesCount = imagesCount;
    }),
  );

  res.json({ inactivePhotographers, pageCount });
});

const getCertificateByEventName = asyncHandler(async (req, res) => {
  const { photographerId, eventName } = req.query;
  const photographer = await Photographer.findById(photographerId);
  if (!photographer) {
    return res.status(404).send({ message: "Photographer not found" });
  }
  const certificate = photographer.eventCertificates.find(
    (cert) => cert.eventName === eventName,
  );
  if (!certificate) {
    return res
      .status(404)
      .send({ message: "Certificate not found for this event" });
  }
  res.status(200).send({ certificate });
});

const addEventCertificate = asyncHandler(async (req, res) => {
  const { photographerId, eventName, fileUrl } = req.body;
  const photographer = await Photographer.findById(photographerId);
  if (!photographer) {
    return res.status(404).send({ message: "Photographer not found" });
  }
  const existingCertificate = photographer.eventCertificates.find(
    (cert) => cert.eventName === eventName,
  );
  if (existingCertificate) {
    return res
      .status(400)
      .send({ message: "Certificate for this event already exists" });
  }
  photographer.eventCertificates.push({ eventName, fileUrl });
  await photographer.save();
  res.status(201).send({
    message: "Event certificate added successfully",
    certificate: { eventName, fileUrl },
  });
});

const removeEventCertificate = asyncHandler(async (req, res) => {
  const { photographerId, eventName } = req.query;
  const photographer = await Photographer.findById(photographerId);
  if (!photographer) {
    return res.status(404).send({ message: "Photographer not found" });
  }
  const certificateIndex = photographer.eventCertificates.findIndex(
    (cert) => cert.eventName === eventName,
  );
  if (certificateIndex === -1) {
    return res
      .status(404)
      .send({ message: "Certificate not found for this event" });
  }
  photographer.eventCertificates.splice(certificateIndex, 1);
  await photographer.save();
  res.status(200).send({
    message: "Event certificate removed successfully",
    eventName,
  });
});

const getEventCertificates = asyncHandler(async (req, res) => {
  const { photographerId } = req.query;
  const photographer = await Photographer.findById(photographerId);
  if (!photographer) {
    return res.status(404).send({ message: "Photographer not found" });
  }
  if (
    !photographer.eventCertificates ||
    photographer.eventCertificates.length === 0
  ) {
    return res.status(404).send({ message: "No event certificates found" });
  }
  res.status(200).send({
    eventCertificates: photographer.eventCertificates,
  });
});

const getAllEventCertificates = asyncHandler(async (req, res) => {
  const photographers = await Photographer.find({});
  const allCertificates = photographers.flatMap((photographer) =>
    photographer.eventCertificates.map((cert) => ({
      photographerId: photographer._id,
      photographerName: `${photographer.firstName} ${photographer.lastName}`,
      eventName: cert.eventName,
      fileUrl: cert.fileUrl,
    })),
  );
  if (allCertificates.length === 0) {
    return res.status(404).send({ message: "No event certificates found" });
  }
  res.status(200).send({ eventCertificates: allCertificates });
});

module.exports = {
  registerPhotographer,
  photographerLogin,
  handlePhotographerStatusUpdate,
  resetPassword,
  getAllPhotographers,
  getAllPhotographersForAdmin,
  getPhotographerById,
  getAllPendingPhotographersForAdmin,
  getPhotographersWithMostPhotoViews,
  updatePhotographer,
  updatePhotographerRank,
  toggleFeaturedPhotographer,
  getFeaturedPhotographer,
  verifyPhotographerProfile,
  resendOTP,
  searchPhotographers,
  getPhotographerByUserName,
  updateCoverImage,
  checkPhotographerUserNameExist,
  checkAndUpdateRejectedPhotographers,
  changePassword,
  deletePhotographer,
  getPendingImagesByPhotographer,
  getPendingArtworksByPhotographer,
  getAllNotFeaturedPhotographers,
  getInactivePhotographersByLastLogin,
  getActivePhotographers,
  getInactivePhotographers,
  makeArtistOfTheMonth,
  getArtistOfTheMonth,
  removeArtistOfTheMonth,
  getCertificateByEventName,
  addEventCertificate,
  removeEventCertificate,
  getEventCertificates,
  getAllEventCertificates,
};
