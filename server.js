require("dotenv").config();
const express = require("express");
const { dbConnect } = require("./db/connect.js");
const cors = require("cors");
const { notFound, errorHandler } = require("./middleware/errorMiddleware.js");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes.js");
const photographerRoutes = require("./routes/photographerRoutes.js");
const categoryRoutes = require("./routes/categoryRoutes.js");
const imageVaultRoutes = require("./routes/imagebase/imageVaultRoutes.js");
const royaltyRoutes = require("./routes/imagebase/royaltyRoutes.js");
const likeRoutes = require("./routes/likeRoutes.js");
const commentRoutes = require("./routes/commentRoutes.js");
const followRoutes = require("./routes/followRoutes.js");
const planRoutes = require("./routes/planRoutes.js");
const subscriptionRoutes = require("./routes/subscriptionRoutes.js");
const paperRoutes = require("./routes/imagebase/paperRoutes.js");
const licenseRoutes = require("./routes/imagebase/licenseRoutes.js");
const frameRoutes = require("./routes/imagebase/frameRoutes.js");
const floaterFrameRoutes = require("./routes/imagebase/floaterFrameRoutes.js");
const mountRoutes = require("./routes/imagebase/mountRoutes.js");
const downloadRoutes = require("./routes/downloadRoutes.js");
const invoiceRoutes = require("./routes/invoiceRoutes.js");
const gstRoutes = require("./routes/gstRoutes.js");
const blogRoutes = require("./routes/blogRoutes.js");
const catalogueRoutes = require("./routes/imagebase/catalogueRoutes.js");
const wishlistRoutes = require("./routes/wishlistRoutes.js");
const storyRoutes = require("./routes/storyRoutes.js");
const marketFreezeRoutes = require("./routes/enquiry/marketFreezeRoutes.js");
const bulkDownloadEnquiryRoutes = require("./routes/enquiry/bulkDownloadEnquiryRoutes.js");
const customRequestRoutes = require("./routes/enquiry/customRequestRoutes.js");
const orderSupportRequestRoutes = require("./routes/enquiry/orderSupportRoutes.js");
const customWatermarkRoutes = require("./routes/customWatermarkRoutes.js");
const couponRoutes = require("./routes/couponRoutes.js");
const photographerAnalyticsRoutes = require("./routes/photographerAnalyticsRoutes.js");
const userAnalyticsRoutes = require("./routes/userAnalyticsRoutes.js");
const referralRoutes = require("./routes/referralRoutes.js");
const monetizationRoutes = require("./routes/monetizationRoutes.js");
const layoutContentRoutes = require("./routes/layoutContentRoutes.js");
const adminAnalyticsRoutes = require("./routes/adminAnalyticsRoutes.js");
const salesUserRoutes = require("./routes/salesuserRoutes.js");
const deliveryRoutes = require("./routes/deliveryRoutes.js");
const rnPushTokenRoutes = require("./routes/rnPushToken.js");
const customUploadImageRoutes = require("./routes/imagebase/customUploadImageRoutes.js");
const customOrderRoutes = require("./routes/customOrderRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const termsRoutes = require("./routes/termsRoutes");
const privacyPolicyRoutes = require("./routes/privacyPolicyRoutes");
const upload = require("./routes/upload");
const artworkRoutes = require("./routes/artworkRoutes");
const artworkCategoryRoutes = require("./routes/artworkCategoryRoutes");
const artworkOrderRoutes = require("./routes/artworkOrderRoutes");
const storeRoutes = require("./routes/storeRoutes");
const cron = require("node-cron");
const {
  checkAndUpdateSubscriptions,
  checkAndSendSubscriptionEmails,
  checkAndSendExpirySubscriptionEmails,
  weeklyMailToInactivePhotographers,
  weeklyMailToNonMonetizedPhotographers,
} = require("./controller/subscriptionController.js");
const {
  checkAndUpdateRejectedPhotographers,
} = require("./controller/photographerController.js");
const {
  raisePickupRequestScheduler,
  raisePickupRequestSchedulerCustom,
} = require("./controller/deliveryController.js");
const { cleanupExpiredImages } = require("./controller/imagebase/imageVaultController.js");
const { cleanupExpiredArtworks } = require("./controller/artworkController.js");

const app = express();

app.use(
  cors({
    origin: "*",
  })
);

app.use(express.json());
app.use("/api/upload", upload);
app.use("/api/user", userRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/photographer", photographerRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/images", imageVaultRoutes);
app.use("/api/royalty", royaltyRoutes);
app.use("/api/likes", likeRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/follow", followRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/frames", frameRoutes);
app.use("/api/floater-frames", floaterFrameRoutes);
app.use("/api/mount", mountRoutes);
app.use("/api/paper", paperRoutes);
app.use("/api/download", downloadRoutes);
app.use("/api/royalty", royaltyRoutes);
app.use("/api/invoice", invoiceRoutes);
app.use("/api/gst", gstRoutes);
app.use("/api/blog", blogRoutes);
app.use("/api/license", licenseRoutes);
app.use("/api/catalogue", catalogueRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/story", storyRoutes);
app.use("/api/marketfreeze", marketFreezeRoutes);
app.use("/api/bulkenquiry", bulkDownloadEnquiryRoutes);
app.use("/api/customenquiry", customRequestRoutes);
app.use("/api/ordersupport", orderSupportRequestRoutes);
app.use("/api/customwatermark", customWatermarkRoutes);
app.use("/api/coupon", couponRoutes);
app.use("/api/photographeranalytics", photographerAnalyticsRoutes);
app.use("/api/useranalytics", userAnalyticsRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/monetization", monetizationRoutes);
app.use("/api/layout", layoutContentRoutes);
app.use("/api/adminanalytics", adminAnalyticsRoutes);
app.use("/api/salesuser", salesUserRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/rnPushTokens", rnPushTokenRoutes);
app.use("/api/custom-uploads", customUploadImageRoutes);
app.use("/api/custom-order", customOrderRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/terms", termsRoutes);
app.use("/api/privacy-policy", privacyPolicyRoutes);
app.use("/api/artworks", artworkRoutes);
app.use("/api/artwork-category", artworkCategoryRoutes);
app.use("/api/artwork-orders", artworkOrderRoutes);
app.use("/api/store", storeRoutes);
app.use("/api/test", (req, res) => {
  res.status(200).json({ message: "Test route is working!" });
});

dbConnect();

cron.schedule("0 0 * * *", () => {
  console.log("Running the subscription expiry check .");
  checkAndUpdateSubscriptions().catch((err) =>
    console.error("Error in subscription check :", err)
  );
});

cron.schedule("0 1 * * 0", () => {
  console.log("Running the rejected photographer deletion check");
  checkAndUpdateRejectedPhotographers();
});

cron.schedule("0 2 * * *", () => {
  console.log("Running the subscription emails check");
  checkAndSendSubscriptionEmails();
});

cron.schedule("0 3 * * *", () => {
  console.log("Running the expiry subscription emails check");
  checkAndSendExpirySubscriptionEmails();
});

cron.schedule("0 8 * * 0", () => {
  console.log("Running the inactive photographers emails check");
  weeklyMailToInactivePhotographers();
});

cron.schedule("0 9 * * 0", () => {
  console.log("Running the non monetized photographers emails check");
  weeklyMailToNonMonetizedPhotographers();
});

cron.schedule("55 23 * * *", () => {
  console.log("Running the raise pickup request scheduler check");
  raisePickupRequestScheduler();
});

cron.schedule("0 4 * * *", () => {
  console.log("Running 7-day cleanup for expired deleted and rejected photos/artworks");
  cleanupExpiredImages();
  cleanupExpiredArtworks();
});


// cron.schedule("5 12 * * *", () => {
//   console.log("Running the raise pickup request scheduler check");
//   raisePickupRequestSchedulerCustom();
// });


app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Successfully served on port: ${PORT}.`);
// Restart nodemon comment 2
});
 
