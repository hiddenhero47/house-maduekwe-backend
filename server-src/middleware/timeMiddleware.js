const timeWindowGuard = (allowedDay, allowedHourDuration) => {
  return (req, res, next) => {
    const now = new Date();

    const start = new Date(allowedDay); // e.g. "2025-10-02T00:00:00Z"
    const end = new Date(start.getTime() + allowedHourDuration * 60 * 60 * 1000);

    if (now >= start && now <= end) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "⏳ Setup route not available at this time.",
    });
  };
};

module.exports = { timeWindowGuard };
