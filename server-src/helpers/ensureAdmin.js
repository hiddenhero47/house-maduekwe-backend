const { User, ROLE } = require("../models/userModel"); // Import the User model
const bcrypt = require("bcryptjs");

// Function to ensure an admin exists
const ensureAdminExists = async () => {
  try {
    const superAdminExists = await User.findOne({ role: ROLE.SUPER_ADMIN });

    if (!superAdminExists) {
      console.log("No super admin found. Creating a default super admin...");

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

      console.log("✅ Super Admin created:", superAdminUser.email);
    } else {
      console.log("✅ Super Admin already exists:", superAdminExists.email);
    }
  } catch (error) {
    console.error("Error ensuring super admin exists:", error.message);
  }
};

module.exports = { ensureAdminExists };
