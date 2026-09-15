module.exports = {
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  setupFiles: ["<rootDir>/tests/setup/env.js"],
  // Starts (once, for the whole run) and stops the disposable in-memory
  // replica set used when TEST_MONGO_URI isn't set — see
  // tests/setup/globalSetup.js for why this has to be global rather than
  // per-file.
  globalSetup: "<rootDir>/tests/setup/globalSetup.js",
  globalTeardown: "<rootDir>/tests/setup/globalTeardown.js",
  testTimeout: 30000,
  verbose: true,
  // Integration tests share one DB connection and mutate real collections —
  // running them one-at-a-time avoids two test files racing on the same
  // data. See package.json's "test" script (--runInBand).
};
