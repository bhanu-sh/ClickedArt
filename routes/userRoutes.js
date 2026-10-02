const express  = require("express");
const { userRegistration, userLogin, resetPassword, getAllUsers, getUserById, userProfileUpdate, deleteUserProfile, verifyUserProfile, resendOTP, getUserByUserName, checkUserNameExist, changePassword, getUserAnalytics } = require("../controller/userController.js");
const { verifyToken, getUserProfileByToken } = require("../middleware/authMiddleware.js");
const { verifyStoreToken } = require("../middleware/storeAuthMiddleware.js");
const { createUserForStore } = require("../controller/store/storeCustomerController.js");
const { updateCoverImage } = require("../controller/photographerController.js");

const router = express.Router()


// Public Routes
router.post('/create-from-store', verifyStoreToken, createUserForStore)
router.post('/register', userRegistration)
router.post('/login', userLogin)
router.get('/get-user-profile-by-token', getUserProfileByToken)
router.post('/update-profile', verifyToken, userProfileUpdate)
router.post('/verify-user-profile', verifyUserProfile)
router.post('/reset-password', resetPassword)
router.post('/change-password', changePassword)
router.post('/resent-otp', resendOTP)
router.get('/get-all-users', getAllUsers)
router.get('/get-user-by-id', getUserById)
router.delete('/delete-profile', deleteUserProfile)
router.get('/get-user-by-username', getUserByUserName)
router.post('/update-cover-image', updateCoverImage)
router.post('/check-user-name-exists', checkUserNameExist)
router.get('/get-user-analytics', getUserAnalytics)

module.exports = router