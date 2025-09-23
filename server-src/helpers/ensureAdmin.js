const User = require("../models/userModel"); // Import the User model
const bcrypt = require("bcryptjs");

// Function to ensure an admin exists
const ensureAdminExists = async () => {
  try {
    const adminExists = await User.findOne({ role: "admin" });

    if (!adminExists) {
      console.log("No admin found. Creating a default admin...");

      // Hash the admin's password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || "admin123", salt);

      // Create the admin user
      const adminUser = await User.create({
        name: process.env.ADMIN_NAME || "charles",
        email: process.env.ADMIN_EMAIL || "hiddenhero47pro@gmail.com",
        password: hashedPassword,
        role: "admin",
      });

      console.log("✅ Admin user created:", adminUser.email);
    } else {
      console.log("✅ Admin already exists:", adminExists.email);
    }
  } catch (error) {
    console.error("Error ensuring admin user exists:", error.message);
  }
};

module.exports = { ensureAdminExists };

