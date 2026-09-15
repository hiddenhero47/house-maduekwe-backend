process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);

  process.exit(1);
});
const colors = require("colors");
const dotenv = require("dotenv").config();
const connectDB = require("./config/db");
const port = process.env.PORT || 4000;
const createApp = require("./app");
const { loadTemplates } = require("./helpers/emailSender");
const startCronJobs = require("./jobs/cronIndex");

const startServer = async () => {
  try {
    await connectDB();

    await loadTemplates();

    const app = createApp();

    app.listen(port, () => {
      console.log(`🚀 Server started on port ${port}`);
      startCronJobs();
    });
  } catch (error) {
    console.error("Startup failed:", error.message);

    process.exit(1);
  }
};

startServer();
