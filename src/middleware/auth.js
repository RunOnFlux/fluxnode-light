const log = require('../lib/log');

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

// Get configured API keys from environment variables
// Looks for API_KEY_* environment variables
function getValidApiKeys() {
  const apiKeys = {};
  const validKeys = [];

  // Look for all environment variables starting with API_KEY_
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('API_KEY_') && key !== 'API_KEY_REQUIRED') {
      const keyName = key.replace('API_KEY_', '');
      if (value && value !== 'your_' + keyName.toLowerCase() + '_api_key_here') {
        apiKeys[keyName] = value;
        validKeys.push(value);
      }
    }
  }

  // Also support legacy comma-separated format for backward compatibility
  if (process.env.API_KEYS) {
    const legacyKeys = process.env.API_KEYS.split(',').map(k => k.trim()).filter(k => k.length > 0);
    legacyKeys.forEach(key => {
      if (!validKeys.includes(key)) {
        validKeys.push(key);
        apiKeys['LEGACY'] = key;
      }
    });
  }

  return validKeys;
}

// Get API key configuration with names
function getApiKeyConfig() {
  const apiKeys = {};

  // Look for all environment variables starting with API_KEY_
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('API_KEY_') && key !== 'API_KEY_REQUIRED') {
      const keyName = key.replace('API_KEY_', '');
      if (value && value !== 'your_' + keyName.toLowerCase() + '_api_key_here') {
        apiKeys[keyName] = value;
      }
    }
  }

  return apiKeys;
}

// Find which named key was used
function getKeyName(apiKey) {
  const config = getApiKeyConfig();
  for (const [name, key] of Object.entries(config)) {
    if (key === apiKey) {
      return name;
    }
  }
  return 'UNKNOWN';
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

  // Skip auth for health check endpoints
  if (req.path.startsWith('/health') || req.path === '/metrics') {
    return next();
  }

  const clientIp = req.ip || req.connection.remoteAddress;

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
  const validKeys = getValidApiKeys();

  if (validKeys.length === 0) {
    log.error('No API keys configured but API_KEY_REQUIRED is true');
    return res.status(500).json({
      status: 'error',
      error: 'Server configuration error',
    });
  }

  // Check if provided key is valid
  const keyToCheck = apiKey.replace('Bearer ', '').trim();

  if (!validKeys.includes(keyToCheck)) {
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

  // API key is valid
  const keyName = getKeyName(keyToCheck);
  log.info(`Valid API key (${keyName}) used by IP: ${clientIp} for ${req.path}`);
  log.audit('API_KEY_USED', {
    keyName,
    ip: clientIp,
    path: req.path,
    method: req.method,
  });

  // Store which key was used (for tracking)
  req.apiKeyName = keyName;
  req.apiKey = keyToCheck;

  next();
}

// Middleware to require API key for specific routes only
function requireApiKey(req, res, next) {
  // Force authentication regardless of environment
  const clientIp = req.ip || req.connection.remoteAddress;

  // Check for API key in headers
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];

  if (!apiKey) {
    log.warn(`Missing API key for protected route from IP: ${clientIp}`);
    return res.status(401).json({
      status: 'error',
      error: 'API key required for this endpoint',
    });
  }

  // Validate API key
  const validKeys = getValidApiKeys();
  const keyToCheck = apiKey.replace('Bearer ', '').trim();

  if (!validKeys.includes(keyToCheck)) {
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
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

// Helper to check if request has valid API key (for conditional logic)
function hasValidApiKey(req) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  if (!apiKey) return false;

  const validKeys = getValidApiKeys();
  const keyToCheck = apiKey.replace('Bearer ', '').trim();

  return validKeys.includes(keyToCheck);
}

module.exports = {
  authenticateApiKey,
  requireApiKey,
  generateApiKey,
  hasValidApiKey,
  isAuthEnabled,
};