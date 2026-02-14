const handleCors = (req, res, next) => {
  const allowedOrigin = 'http://localhost:3002'; // change to match your React port exactly
  const requestOrigin = req.headers.origin;

  // Decide what to send (exact match for credentials mode, or * for no credentials)
  let corsOrigin = allowedOrigin;
  // Alternative for dev-only wildcard:
  // let corsOrigin = '*';

  // But if using credentials: 'include' on frontend → MUST be exact origin, NOT *
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  // Optional but helpful
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    console.log(`OPTIONS preflight OK → ${req.url}`);
    return res.status(204).end(); // 204 No Content is cleaner than 200
  }

  console.log(`CORS headers set for ${req.method} ${req.url}`);
  next();
};

module.exports = handleCors;