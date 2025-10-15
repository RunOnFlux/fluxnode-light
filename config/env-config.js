require('dotenv').config();

// Helper function to parse addresses from environment variables
function parseAddresses() {
  const addresses = [];
  let index = 1;

  // Look for ADDRESS_N_NAME pattern and build address objects
  while (process.env[`ADDRESS_${index}_NAME`]) {
    const address = {
      name: process.env[`ADDRESS_${index}_NAME`],
      collateralAddress: process.env[`ADDRESS_${index}_COLLATERAL_ADDRESS`],
      fluxnodePrivateKey: process.env[`ADDRESS_${index}_FLUXNODE_PRIVATE_KEY`],
      p2shprivkey: process.env[`ADDRESS_${index}_P2SH_PRIVATE_KEY`],
      redeemScript: process.env[`ADDRESS_${index}_REDEEM_SCRIPT`],
    };

    // Validate that all required fields are present
    if (address.collateralAddress && address.fluxnodePrivateKey &&
        address.p2shprivkey && address.redeemScript) {
      addresses.push(address);
    } else {
      console.warn(`Warning: Address ${index} is missing required fields and will be skipped`);
    }

    index++;
  }

  if (addresses.length === 0) {
    throw new Error('No valid addresses configured. Please check your .env file.');
  }

  return addresses;
}

// Parse numeric environment variables with defaults
function getEnvNumber(key, defaultValue) {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Parse boolean environment variables
function getEnvBoolean(key, defaultValue) {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

module.exports = {
  server: {
    port: getEnvNumber('PORT', 9001),
    env: process.env.NODE_ENV || 'production',
  },

  discord: {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL,
    enabled: !!process.env.DISCORD_WEBHOOK_URL,
  },

  api: {
    explorerUrl: process.env.EXPLORER_API_URL || 'https://explorer.runonflux.io/api',
    fluxApiUrl: process.env.FLUX_API_URL || 'https://api.runonflux.io',
    timeout: getEnvNumber('API_TIMEOUT', 30000),
    maxRetries: getEnvNumber('MAX_RETRIES', 3),
    retryDelay: getEnvNumber('RETRY_DELAY', 1000),
  },

  rateLimit: {
    windowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 900000), // 15 minutes
    maxRequests: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),
    transactionWindowMs: getEnvNumber('TRANSACTION_RATE_LIMIT_WINDOW_MS', 300000), // 5 minutes
    transactionMaxRequests: getEnvNumber('TRANSACTION_RATE_LIMIT_MAX_REQUESTS', 10),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    maxFileSize: getEnvNumber('LOG_MAX_FILE_SIZE', 10485760), // 10MB
    maxFiles: getEnvNumber('LOG_MAX_FILES', 5),
    directory: process.env.LOG_DIRECTORY || './logs',
  },

  security: {
    enableHelmet: getEnvBoolean('ENABLE_HELMET', true),
    enableCors: getEnvBoolean('ENABLE_CORS', true),
    corsOrigin: process.env.CORS_ORIGIN || '*',
    requestSizeLimit: getEnvNumber('REQUEST_SIZE_LIMIT', 102400), // 100KB
  },

  healthCheck: {
    enabled: getEnvBoolean('HEALTH_CHECK_ENABLED', true),
    interval: getEnvNumber('HEALTH_CHECK_INTERVAL', 60000), // 1 minute
  },

  process: {
    enableGracefulShutdown: getEnvBoolean('ENABLE_GRACEFUL_SHUTDOWN', true),
    shutdownTimeout: getEnvNumber('SHUTDOWN_TIMEOUT', 30000), // 30 seconds
  },

  cache: {
    enabled: getEnvBoolean('CACHE_ENABLED', true),
    ttl: getEnvNumber('CACHE_TTL', 300000), // 5 minutes
    maxSize: getEnvNumber('CACHE_MAX_SIZE', 100),
  },

  // Multi-address configuration
  addresses: parseAddresses(),

  // Legacy support - for backward compatibility
  discordHook: process.env.DISCORD_WEBHOOK_URL || process.env.WEB_HOOK,
};