const crypto = require('crypto');
const log = require('../lib/logger');
const { getRealIp } = require('./security');

/**
 * API Key Authentication Middleware
 *
 * Validates API keys for production environments
 * Can be configured to allow certain IPs to bypass authentication
 */

// Check if API key authentication is enabled
function isAuthEnabled() {
  return process.env.API_KEY_REQUIRED === 'true' && process.env.NODE_ENV === 'production';
}

// Parse all API key config once and cache it
function getApiKeyConfig() {
  const apiKeys = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('API_KEY_') && key !== 'API_KEY_REQUIRED') {
      const keyName = key.replace('API_KEY_', '');
      if (value && value !== 'your_' + keyName.toLowerCase() + '_api_key_here') {
        apiKeys[keyName] = value;
      }
    }
  }

  // Also support legacy comma-separated format for backward compatibility
  if (process.env.API_KEYS) {
    const legacyKeys = process.env.API_KEYS.split(',').map(k => k.trim()).filter(k => k.length > 0);
    legacyKeys.forEach(key => {
      if (!Object.values(apiKeys).includes(key)) {
        apiKeys['LEGACY'] = key;
      }
    });
  }

  return apiKeys;
}

// Constant-time API key comparison to prevent timing attacks
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Find a matching key using constant-time comparison, returns [name, matched]
function findMatchingKey(keyToCheck, apiKeys) {
  let matchedName = null;
  for (const [name, key] of Object.entries(apiKeys)) {
    if (safeCompare(keyToCheck, key)) {
      matchedName = name;
    }
  }
  return matchedName;
}

// Get whitelisted IPs that don't need API key (comma-separated)
function getWhitelistedIPs() {
  const ips = process.env.WHITELISTED_IPS || '';
  return ips.split(',').map(ip => ip.trim()).filter(ip => ip.length > 0);
}

// Main authentication middleware
function authenticateApiKey(req, res, next) {
  // Skip auth if not enabled
  if (!isAuthEnabled()) {
    return next();
  }

  // Skip auth for health check endpoints (metrics requires auth via route-level middleware)
  if (req.path.startsWith('/health')) {
    return next();
  }

  const clientIp = getRealIp(req);

  // Check if IP is whitelisted
  const whitelistedIPs = getWhitelistedIPs();
  if (whitelistedIPs.includes(clientIp)) {
    log.debug(`IP ${clientIp} is whitelisted, skipping API key check`);
    return next();
  }

  // Check for API key in headers
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];

  if (!apiKey) {
    log.warn(`Missing API key from IP: ${clientIp}`);
    return res.status(401).json({
      status: 'error',
      error: 'API key required. Please provide X-API-Key header.',
    });
  }

  // Validate API key
  const apiKeys = getApiKeyConfig();
  const validKeyCount = Object.keys(apiKeys).length;

  if (validKeyCount === 0) {
    log.error('No API keys configured but API_KEY_REQUIRED is true');
    return res.status(500).json({
      status: 'error',
      error: 'Server configuration error',
    });
  }

  // Check if provided key is valid using constant-time comparison
  const keyToCheck = apiKey.replace('Bearer ', '').trim();
  const keyName = findMatchingKey(keyToCheck, apiKeys);

  if (!keyName) {
    log.warn(`Invalid API key attempt from IP: ${clientIp}`);
    log.audit('INVALID_API_KEY', {
      ip: clientIp,
      path: req.path,
      method: req.method,
    });

    return res.status(401).json({
      status: 'error',
      error: 'Invalid API key',
    });
  }

  // API key is valid — store only the key name, never the key itself
  log.info(`Valid API key (${keyName}) used by IP: ${clientIp} for ${req.path}`);
  log.audit('API_KEY_USED', {
    keyName,
    ip: clientIp,
    path: req.path,
    method: req.method,
  });

  req.apiKeyName = keyName;

  next();
}

// Middleware to require API key for specific routes only
function requireApiKey(req, res, next) {
  const clientIp = getRealIp(req);

  // Check for API key in headers
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];

  if (!apiKey) {
    log.warn(`Missing API key for protected route from IP: ${clientIp}`);
    return res.status(401).json({
      status: 'error',
      error: 'API key required for this endpoint',
    });
  }

  // Validate API key using constant-time comparison
  const apiKeys = getApiKeyConfig();
  const keyToCheck = apiKey.replace('Bearer ', '').trim();

  if (!findMatchingKey(keyToCheck, apiKeys)) {
    log.warn(`Invalid API key for protected route from IP: ${clientIp}`);
    return res.status(401).json({
      status: 'error',
      error: 'Invalid API key',
    });
  }

  next();
}

// Generate a random API key
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

// Helper to check if request has valid API key (for conditional logic)
function hasValidApiKey(req) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  if (!apiKey) return false;

  const apiKeys = getApiKeyConfig();
  const keyToCheck = apiKey.replace('Bearer ', '').trim();

  return !!findMatchingKey(keyToCheck, apiKeys);
}

module.exports = {
  authenticateApiKey,
  requireApiKey,
  generateApiKey,
  hasValidApiKey,
  isAuthEnabled,
};
