const mongoose = require("mongoose");

const ROLE = {
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
      enum: [ROLE.BASIC, ROLE.ADMIN],
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", async function (next) {
  const User = mongoose.model("User"); // Get the User model

  try {
    // Count the total number of users and admins
    const totalUsers = await User.countDocuments();
    const totalAdmins = await User.countDocuments({ role: ROLE.ADMIN });

    // If there are no users OR no admins, allow admin creation
    if (totalUsers === 0 || totalAdmins === 0) {
      return next(); // Allow admin creation
    }

    // If there are existing users/admins, prevent unauthorized admin creation
    if (this.role === ROLE.ADMIN && this.currentUserRole !== ROLE.ADMIN) {
      const error = new Error("Setting role as admin is not allowed.");
      error.status = 401;
      return next(error);
    }

    next(); // Proceed with saving if no issues
  } catch (err) {
    return next(err);
  }
});

module.exports = mongoose.model("User", userSchema);
