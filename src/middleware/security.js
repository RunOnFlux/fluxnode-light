const log = require('../lib/logger');

// Try to load rate limiting, but provide fallback if not available
let rateLimit;
try {
  rateLimit = require('express-rate-limit');
} catch (error) {
  log.warn('express-rate-limit not installed. Rate limiting disabled.');
  // Fallback middleware that does nothing
  rateLimit = () => (req, res, next) => next();
}

// Helper function to get real IP address (works with or without CloudFlare)
function getRealIp(req) {
  // CloudFlare specific header (most reliable when behind CF)
  if (req.headers['cf-connecting-ip']) {
    return req.headers['cf-connecting-ip'];
  }

  // Standard forwarded headers (could be spoofed if not behind proxy)
  if (req.headers['x-forwarded-for']) {
    return req.headers['x-forwarded-for'].split(',')[0].trim();
  }

  if (req.headers['x-real-ip']) {
    return req.headers['x-real-ip'];
  }

  // Fallback to direct connection
  return req.connection.remoteAddress || req.ip;
}

// Create rate limiter for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  // Custom key generator using our getRealIp function
  keyGenerator: (req) => getRealIp(req),
  // Skip validation since we handle IP detection ourselves
  validate: false,
  handler: (req, res) => {
    const realIp = getRealIp(req);
    log.warn(`Rate limit exceeded for IP: ${realIp}`);
    res.status(429).json({
      status: 'error',
      error: 'Too many requests. Please wait before trying again.',
    });
  },
});

// Stricter rate limit for transaction endpoints
const transactionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Limit each IP to 10 transaction requests per windowMs
  message: 'Too many transaction requests from this IP.',
  skipSuccessfulRequests: false,
  // Custom key generator using our getRealIp function
  keyGenerator: (req) => getRealIp(req),
  // Skip validation since we handle IP detection ourselves
  validate: false,
  handler: (req, res) => {
    const realIp = getRealIp(req);
    log.warn(`Transaction rate limit exceeded for IP: ${realIp}`);
    res.status(429).json({
      status: 'error',
      error: 'Too many transaction requests. Please wait 5 minutes.',
    });
  },
});

// IP-based request tracking for suspicious activity
const requestTracker = new Map();

function trackRequest(req, res, next) {
  const ip = getRealIp(req);  // Use our helper function
  const now = Date.now();

  if (!requestTracker.has(ip)) {
    requestTracker.set(ip, {
      count: 1,
      firstRequest: now,
      lastRequest: now,
    });
  } else {
    const tracker = requestTracker.get(ip);
    tracker.count++;
    tracker.lastRequest = now;

    // Alert on suspicious patterns
    const timeDiff = now - tracker.firstRequest;
    const requestsPerMinute = (tracker.count / (timeDiff / 60000));

    if (requestsPerMinute > 30) {
      log.warn(`Suspicious activity detected from IP ${ip}: ${requestsPerMinute.toFixed(2)} requests/min`);
    }
  }

  // Clean up old entries every hour
  if (Math.random() < 0.001) { // Probabilistic cleanup
    const oneHourAgo = now - (60 * 60 * 1000);
    for (const [ip, data] of requestTracker.entries()) {
      if (data.lastRequest < oneHourAgo) {
        requestTracker.delete(ip);
      }
    }
  }

  next();
}

// Security headers middleware
function securityHeaders() {
  // Return a no-op middleware if helmet is not available
  return (req, res, next) => next();
}

// Request size limiter
function requestSizeLimiter(req, res, next) {
  const contentLength = req.headers['content-length'];
  const maxSize = 1024 * 100; // 100KB

  if (contentLength && parseInt(contentLength) > maxSize) {
    const realIp = getRealIp(req);
    log.warn(`Request size too large from IP ${realIp}: ${contentLength} bytes`);
    return res.status(413).json({
      status: 'error',
      error: 'Request payload too large',
    });
  }

  next();
}

module.exports = {
  apiLimiter,
  transactionLimiter,
  trackRequest,
  securityHeaders,
  requestSizeLimiter,
  getRealIp, // Export helper function for use in other modules
};