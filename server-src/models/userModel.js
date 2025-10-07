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
  },
  {
    timestamps: true,
  }
);

userSchema.virtual("currentUserRole");

userSchema.pre("save", async function (next) {
  const User = mongoose.model("User"); // Get the User model

  try {
    // If it's not a new document and role wasn't modified, skip the check
    if (!this.isNew && !this.isModified("role")) {
      return next();
    }

    // Count the total number of users and admins
    const totalUsers = await User.countDocuments();
    const totalSuperAdmins = await User.countDocuments({
      role: ROLE.SUPER_ADMIN,
    });

    // If no users exist, allow creating the first SUPER_ADMIN
    if (totalUsers === 0 && this.role === ROLE.SUPER_ADMIN) {
      return next();
    }

    // Prevent creating another SUPER_ADMIN if one already exists
    if (this.role === ROLE.SUPER_ADMIN && totalSuperAdmins > 0) {
      const error = new Error("Only one Super Admin can exist in the system");
      error.status = 403;
      return next(error);
    }

    // Restrict creating ADMIN unless current user is SUPER_ADMIN
    if (this.role === ROLE.ADMIN && this.currentUserRole !== ROLE.SUPER_ADMIN) {
      const error = new Error("Only Super Admins can create Admins");
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
