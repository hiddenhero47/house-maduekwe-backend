const mongoose = require("mongoose");

// Integration tests use a REAL MongoDB connection — checkout/order/shipment
// code runs multi-document transactions (mongoose.startSession()), which
// only work against a replica set. A standalone mongod will fail with
// "Transaction numbers are only allowed on a replica set member".
//
// TEST_MONGO_URI is resolved by tests/setup/globalSetup.js: it either comes
// from your own .env.test, or — if you didn't set one — a disposable
// in-memory replica set is started once for the whole test run and its URI
// is written here. Either way, by the time any test file runs, it's set.
const connectTestDB = async () => {
  const uri = process.env.TEST_MONGO_URI || process.env.MONGO_URI;

  if (!uri) {
    throw new Error(
      "TEST_MONGO_URI is not set. This should have been set automatically by " +
        "tests/setup/globalSetup.js — check that mongodb-memory-server installed " +
        "correctly, or set TEST_MONGO_URI/.env.test yourself (see .env.test.example).",
    );
  }

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
};

const disconnectTestDB = async () => {
  await mongoose.connection.close();
};

// Wipes every collection. Call this between tests (afterEach) so each test
// starts from a clean slate — scoped to whatever TEST_MONGO_URI points at,
// which should never be your dev/prod database.
const clearTestDB = async () => {
  // If connectTestDB() never succeeded, skip rather than let every test hang
  // for Mongoose's ~10s command-buffer timeout.
  if (mongoose.connection.readyState !== 1) return;

  const { collections } = mongoose.connection;

  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({})),
  );
};

module.exports = { connectTestDB, disconnectTestDB, clearTestDB };
