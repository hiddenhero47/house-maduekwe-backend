const cronStatus = {
  testJob: {
    running: false,
    lastRun: null,
  },
  expiredOrderCleanup: {
    running: false,
    lastRun: null,
  },
};

module.exports = cronStatus;
