const log = require('../lib/logger');
const config = require('../../config/env-config');

// Fail hard if rate limiting module is missing — security should not silently degrade
const rateLimit = require('express-rate-limit');

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

// Create rate limiter for API endpoints — values from config
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getRealIp(req),
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

// Stricter rate limit for transaction endpoints — values from config
const transactionLimiter = rateLimit({
  windowMs: config.rateLimit.transactionWindowMs,
  max: config.rateLimit.transactionMaxRequests,
  message: 'Too many transaction requests from this IP.',
  skipSuccessfulRequests: false,
  keyGenerator: (req) => getRealIp(req),
  validate: false,
  handler: (req, res) => {
    const realIp = getRealIp(req);
    log.warn(`Transaction rate limit exceeded for IP: ${realIp}`);
    res.status(429).json({
      status: 'error',
      error: 'Too many transaction requests. Please wait before trying again.',
    });
  },
});

// IP-based request tracking for suspicious activity with deterministic cleanup
const requestTracker = new Map();
const TRACKER_MAX_SIZE = 10000;
const TRACKER_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

// Deterministic cleanup on interval
setInterval(() => {
  const cutoff = Date.now() - TRACKER_CLEANUP_INTERVAL;
  for (const [ip, data] of requestTracker.entries()) {
    if (data.lastRequest < cutoff) {
      requestTracker.delete(ip);
    }
  }
}, TRACKER_CLEANUP_INTERVAL);

function trackRequest(req, res, next) {
  const ip = getRealIp(req);
  const now = Date.now();

  if (!requestTracker.has(ip)) {
    // Enforce max size — evict oldest entry if at capacity
    if (requestTracker.size >= TRACKER_MAX_SIZE) {
      const oldestKey = requestTracker.keys().next().value;
      requestTracker.delete(oldestKey);
    }

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
    if (timeDiff > 0) {
      const requestsPerMinute = (tracker.count / (timeDiff / 60000));
      if (requestsPerMinute > 30) {
        log.warn(`Suspicious activity detected from IP ${ip}: ${requestsPerMinute.toFixed(2)} requests/min`);
      }
    }
  }

  next();
}

// Request size limiter
function requestSizeLimiter(req, res, next) {
  const contentLength = req.headers['content-length'];
  const maxSize = config.security.requestSizeLimit;

  if (contentLength && parseInt(contentLength, 10) > maxSize) {
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
  requestSizeLimiter,
  getRealIp,
};
