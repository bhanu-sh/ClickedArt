const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const storeUserSchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: [true, "Store association is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
    },
    email: {
      type: String,
      required: [true, "Valid email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      validate(value) {
        if (!validator.isEmail(value)) {
          throw new Error("Invalid email format");
        }
      },
    },
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    role: {
      type: String,
      required: true,
      enum: ["StoreManager", "StoreStaff"],
      default: "StoreStaff",
    },
    phone: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

storeUserSchema.pre("save", async function (next) {
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

storeUserSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

storeUserSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      id: this._id,
      storeId: this.store,
      role: this.role,
      email: this.email,
      name: this.name,
      type: "StoreUser",
    },
    process.env.SECRET_KEY || "clickedart_secret_jwt_key",
    { expiresIn: "7d" }
  );
};

const StoreUser = mongoose.model("StoreUser", storeUserSchema);

module.exports = StoreUser;
