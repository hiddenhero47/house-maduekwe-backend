const mongoose = require("mongoose");

const ROLE = {
  SUPER_ADMIN: "superAdmin",
  ADMIN: "admin",
  BASIC: "basic",
};

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please add a name"],
    },
    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
    },
    password: {
      type: String,
      required: [true, "Please add a password"],
    },
    role: {
      type: String,
      default: ROLE.BASIC,
      enum: Object.values(ROLE),
    },
    user2fa: {
      type: Object,
      default: { enable: false },
    },
    deviceId: {
      type: Array,
      default: [],
    },
    phoneNumber: {
      number: {
        type: String,
        trim: true,
      },
      country: {
        type: String,
        uppercase: true,
        trim: true,
        match: [
          /^[A-Z]{2}$/,
          "Phone country must be a valid 2-letter country code (e.g. NG, US)",
        ],
      },
    },
    avatar: {
      type: Object,
    },
    authProviders: [
      {
        provider: {
          type: String,
          enum: ["local", "google", "apple"],
          required: true,
        },
        providerId: {
          type: String,
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

userSchema.virtual("currentUserRole");

userSchema.pre("save", async function (next) {
  const User = mongoose.model("User"); // Get the User model

  try {
    // If it's not a new document and role wasn't modified, skip the check
    if (!this.isNew && !this.isModified("role")) {
      return next();
    }

    // 🔒 Enforce single Super Admin
    if (this.role === ROLE.SUPER_ADMIN) {
      const existingSuperAdmin = await User.exists({
        role: ROLE.SUPER_ADMIN,
      });

      if (existingSuperAdmin) {
        const error = new Error("Only one Super Admin can exist in the system");
        error.status = 403;
        return next(error);
      }
    }

    // 🔒 Block ADMIN creation unless explicitly allowed
    if (this.role === ROLE.ADMIN && !this._adminCreation) {
      const error = new Error("Admin creation not allowed");
      error.status = 403;
      return next(error);
    }

    next(); // Proceed with saving if no issues
  } catch (err) {
    return next(err);
  }
});

const User = mongoose.model("User", userSchema);
module.exports = { User, ROLE };
