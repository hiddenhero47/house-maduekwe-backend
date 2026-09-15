require("./env"); // loads .env.test (or .env fallback) into process.env

const { MongoMemoryReplSet } = require("mongodb-memory-server");

// Runs ONCE for the whole test run (not per file) — starting a fresh
// replica set per test file was unreliable and slow. If you've set
// TEST_MONGO_URI/MONGO_URI yourself (via .env.test), that takes priority
// and nothing gets spun up here.
module.exports = async () => {
  if (process.env.TEST_MONGO_URI || process.env.MONGO_URI) {
    return;
  }

  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

  // globalSetup and globalTeardown run in the same process, so stashing the
  // instance on `global` here is how globalTeardown gets it back.
  global.__MONGO_REPLSET__ = replSet;
  process.env.TEST_MONGO_URI = replSet.getUri();
};
