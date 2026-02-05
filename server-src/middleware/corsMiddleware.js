const handleCors = (req, res, next) => {
  const allowedOrigin = 'http://localhost:3002';

  res.setHeader("Access-Control-Allow-Origin", "*");
  // Allow requests from any origin (you can specify specific origins instead)
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin); // frontend UR
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE"); // Allow specified HTTP methods
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization"); // Allow specified headers
  res.setHeader("Access-Control-Allow-Credentials", "true"); // if using cookies/auth
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade"); // optional to remove strict-origin

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end(); // Return a 200 status code for preflight requests
  } else {
    console.log("CORS middleware passed for", req.method, req.url);
    next(); // Continue to the next middleware/route
  }
};
module.exports = handleCors;
