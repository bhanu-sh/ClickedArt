const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      validate(value) {
        if (!validator.isEmail(value)) {
          throw new Error("Valid Email is Required");
        }
      },
    },
    password: {
      type: String,
      required: true,
    },
    mobile: {
      type: Number,
    },
    whatsapp: {
      type: Number,
    },

    age: {
      type: Number,
    },
    image: {
      type: String,
      required: false,
    },
    dob: {
      type: Date,
      required: false,
    },
    username: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    accountType: {
      type: String,
      enum: ["regular", "premium", "business", "influencer"],
      required: true,
      default: "regular",
    },
    type: {
      type: String,
      enum: ["User"],
      default: "User",
      required: true,
    },
    connectedAccounts: [
      {
        accountName: { type: String },
        accountLink: { type: String },
      },
    ],
    interests: [{ type: String, required: false }],
    photographer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Photographer",
      default: null,
    },
    shippingAddress: {
      address: { type: String },
      country: { type: String },
      city: { type: String },
      landmark: { type: String },
      area: { type: String },
      pincode: { type: String },
      state: { type: String },
    },
    isMarried: {
      type: Boolean,
    },
    anniversary: {
      type: Date,
    },
    otp: String,
    otpExpiresAt: Date,
    isActive: {
      type: Boolean,
      default: false,
    },
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
    referralcode: {
      type: String,
    },
    deleted: {
      type: Boolean,
      default: false,
    },
    platform: {
      type: String,
      default: null,
    },
    pushToken: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

userSchema.index({
  firstName: "text",
  lastName: "text",
  email: "text",
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
  try {
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch (err) {
    next(err);
  }
});

userSchema.methods.isPasswordCorrect = async function (password) {
  const isMatch = await bcrypt.compare(password, this.password);
  return isMatch;
};

userSchema.methods.generateAccessToken = async function () {
  return await jwt.sign(
    {
      id: this._id,
      type: this.type,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
    },
    process.env.SECRET_KEY
  );
};
const User = mongoose.model("User", userSchema);

module.exports = User;
