const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const log = require('./log');

// Import middleware
const { validateTransactionParams } = require('../middleware/validation');
const {
  apiLimiter,
  transactionLimiter,
  trackRequest,
  securityHeaders,
  requestSizeLimiter,
} = require('../middleware/security');
const { authenticateApiKey } = require('../middleware/auth');

// Import routes
const healthRoutes = require('../routes/health');

const nodeEnv = process.env.NODE_ENV || 'production';

const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', true);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API
  crossOriginEmbedderPolicy: false,
}));

// Compression middleware
app.use(compression());

// Request parsing middleware
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Request size limiter
app.use(requestSizeLimiter);

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // 24 hours
};
app.use(cors(corsOptions));

// Request tracking
app.use(trackRequest);

// Global request counter
app.use((req, res, next) => {
  global.requestCount = (global.requestCount || 0) + 1;
  next();
});

// Logging middleware
if (nodeEnv !== 'test') {
  // Use winston stream for logging
  try {
    const { logger } = require('./logger');
    app.use(morgan('combined', { stream: logger.stream }));
  } catch {
    // Fallback to console if winston not available
    app.use(morgan('combined'));
  }
}

// Root route
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'Fluxnode Light API',
    version: process.env.npm_package_version || '1.0.0',
    endpoints: {
      health: '/health',
      api: {
        start: '/api/start/:txid/:index',
        startWithAddress: '/api/start/:txid/:index/:addressName',
        addresses: '/api/addresses'
      }
    }
  });
});

// Health check routes (no rate limiting)
app.get('/health', healthRoutes.healthCheck);
app.get('/health/liveness', healthRoutes.livenessProbe);
app.get('/health/readiness', healthRoutes.readinessProbe);
app.get('/metrics', healthRoutes.metrics);

// Apply general rate limiting to all API routes
app.use('/api', apiLimiter);

// Apply API key authentication to all API routes (if enabled)
app.use('/api', authenticateApiKey);

// API Routes with validation and rate limiting
const prefix = 'api';

// Legacy endpoint - uses default/first address
app.get(
  `/${prefix}/start/:txid/:index`,
  transactionLimiter,
  validateTransactionParams,
  (req, res, next) => {
    const { txid, index } = req.params;
    log.info(`API request: start fluxnode ${txid}:${index} from ${req.ip}`);
    next();
  },
  require('../../src/services/fluxnodeService').getStart
);

// New endpoint - specify which address to use by name
app.get(
  `/${prefix}/start/:txid/:index/:addressName`,
  transactionLimiter,
  validateTransactionParams,
  (req, res, next) => {
    const { txid, index, addressName } = req.params;
    log.info(`API request: start fluxnode ${txid}:${index} with address ${addressName} from ${req.ip}`);
    next();
  },
  require('../../src/services/fluxnodeService').getStart
);

// Endpoint to list all available addresses
app.get(
  `/${prefix}/addresses`,
  (req, res, next) => {
    log.info(`API request: list addresses from ${req.ip}`);
    next();
  },
  require('../../src/services/fluxnodeService').getAddresses
);

// 404 handler
app.use((req, res) => {
  log.warn(`404 Not Found: ${req.method} ${req.url} from ${req.ip}`);
  res.status(404).json({
    status: 'error',
    error: 'Endpoint not found',
    path: req.url,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  global.errorCount = (global.errorCount || 0) + 1;

  // Log the error
  log.error(`Express error: ${err.message}`, {
    error: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  // Don't leak error details in production
  const isDevelopment = nodeEnv === 'development';

  res.status(err.status || 500).json({
    status: 'error',
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack }),
  });
});

module.exports = app;