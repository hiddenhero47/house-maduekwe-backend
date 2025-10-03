const { ensureAdminExists } = require("../helpers/ensureAdmin");

const runSetupScripts = async (req, res) => {
  const logs = [];

  // Add setup tasks here
  logs.push(await ensureAdminExists());
  // later: logs.push(await anotherSetupTask());

  res.json({
    success: true,
    timestamp: new Date(),
    results: logs,
  });
};

module.exports = { runSetupScripts };