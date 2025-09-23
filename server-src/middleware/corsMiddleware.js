const handleCors = (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // Allow requests from any origin (you can specify specific origins instead)
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE"); // Allow specified HTTP methods
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization"); // Allow specified headers

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end(); // Return a 200 status code for preflight requests
  } else {
    next(); // Continue to the next middleware/route
  }
};
module.exports = handleCors;
