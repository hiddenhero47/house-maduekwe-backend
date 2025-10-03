const { User, ROLE } = require("../models/userModel");
const bcrypt = require("bcryptjs");

const ensureAdminExists = async () => {
  try {
    const superAdminExists = await User.findOne({ role: ROLE.SUPER_ADMIN });

    if (!superAdminExists) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(
        process.env.SUPER_ADMIN_PASSWORD || "superadmin123",
        salt
      );

      const superAdminUser = await User.create({
        name: process.env.SUPER_ADMIN_NAME || "hidden hero",
        email: process.env.SUPER_ADMIN_EMAIL || "hiddenhero47pro@gmail.com",
        password: hashedPassword,
        role: ROLE.SUPER_ADMIN,
      });

      return {
        task: "Ensure Super Admin",
        status: "success",
        message: `Super Admin created: ${superAdminUser.email}`,
      };
    } else {
      return {
        task: "Ensure Super Admin",
        status: "success",
        message: `Super Admin already exists: ${superAdminExists.email}`,
      };
    }
  } catch (error) {
    return {
      task: "Ensure Super Admin",
      status: "failed",
      message: error.message,
    };
  }
};

module.exports = { ensureAdminExists };
