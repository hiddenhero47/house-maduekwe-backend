const cron = require("node-cron");
const cronStatus = require("../status");

const testCronJob = () => {
  cron.schedule(
    "* * * * *",
    async () => {
      if (cronStatus.testJob.running) {
        console.log("Previous run still executing");
        return;
      }

      try {
        cronStatus.testJob.running = true;
        cronStatus.testJob.lastRun = new Date();

        console.log(`[CRON][TEST_JOB] Running at ${new Date().toISOString()}`);
      } catch (error) {
        console.error(error);
      } finally {
        cronStatus.testJob.running = false;
      }
    },
    {
      scheduled: true,
      timezone: "Africa/Lagos",
    },
  );
};

module.exports = testCronJob;
