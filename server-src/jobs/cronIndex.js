const testCronJob = require("./jobListings/testJob");
const expiredOrderCleanup = require("./jobListings/orderJobs");

let initialized = false;

const startCronJobs = () => {
  if (initialized) return;

  initialized = true;

  expiredOrderCleanup();
  // testCronJob();

  console.log("All cron jobs started");
};

module.exports = startCronJobs;
