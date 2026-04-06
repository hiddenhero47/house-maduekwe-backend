const handleCors = (req, res, next) => {
  const allowedOrigin = [
    "http://localhost:3002",
    "http://localhost:4173",
    "https://house-maduekwe-frontend-puetmkoef-hiddenhero47s-projects.vercel.app",
    "https://house-maduekwe-frontend-git-dev-hiddenhero47s-projects.vercel.app/",
  ]; // change to match your React port exactly
  const requestOrigin = req.headers.origin;

  // But if using credentials: 'include' on frontend → MUST be exact origin, NOT *
  if (allowedOrigin.includes(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  res.setHeader("Vary", "Origin");

  // Optional but helpful
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.status(204).end(); // 204 No Content is cleaner than 200
  }

  console.log(`CORS headers set for ${req.method} ${req.url}`);
  next();
};

module.exports = handleCors;
