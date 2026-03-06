const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const crypto = require('crypto');
const log = require('./logger');
const config = require('../../config/env-config');

// Import middleware
const { validateTransactionParams } = require('../middleware/validation');
const {
  apiLimiter,
  transactionLimiter,
  trackRequest,
  requestSizeLimiter,
  getRealIp,
} = require('../middleware/security');
const { authenticateApiKey } = require('../middleware/auth');

// Import routes
const healthRoutes = require('../routes/health');

const nodeEnv = process.env.NODE_ENV || 'production';

// Application-level metrics (replaces globals)
const metrics = {
  requestCount: 0,
  errorCount: 0,
  addressCount: 0,
};

const app = express();

// Expose metrics on app for health/metrics routes
app.locals.metrics = metrics;

// Trust proxy for accurate IP addresses when behind CloudFlare/proxy
// Use number to trust N hops, or set TRUST_PROXY env var for flexibility
app.set('trust proxy', process.env.TRUST_PROXY || 1);

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

// CORS configuration — default to restrictive, not wildcard
const corsOptions = {
  origin: config.security.corsOrigin,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  maxAge: 86400, // 24 hours
};
app.use(cors(corsOptions));

// Request tracking
app.use(trackRequest);

// Request counter and request ID
app.use((req, res, next) => {
  metrics.requestCount++;
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// Logging middleware
if (nodeEnv !== 'test') {
  try {
    const { logger } = require('./logger');
    app.use(morgan('combined', { stream: logger.stream }));
  } catch {
    app.use(morgan('combined'));
  }
}

// Root route
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'Fluxnode Light API',
    version: require('../../package.json').version,
    endpoints: {
      health: '/health',
      api: {
        start: 'GET /api/start/:txid/:index',
        startWithAddress: 'GET /api/start/:txid/:index/:addressName',
        startWithDelegate: 'POST /api/start-delegate/:txid/:index/:addressName',
        startAsDelegate: 'POST /api/start-as-delegate/:txid/:index/:addressName',
        addresses: 'GET /api/addresses',
      },
    },
  });
});

// Health check routes (with basic rate limiting)
app.get('/health', healthRoutes.healthCheck);
app.get('/health/liveness', healthRoutes.livenessProbe);
app.get('/health/readiness', healthRoutes.readinessProbe);
app.get('/metrics', authenticateApiKey, healthRoutes.metrics);

// Apply general rate limiting to all API routes
app.use('/api', apiLimiter);

// Apply API key authentication to all API routes (if enabled)
app.use('/api', authenticateApiKey);

// Load service handlers
const fluxnodeService = require('../../src/services/fluxnodeService');

// Shared logging middleware for start endpoints
function logStartRequest(req, res, next) {
  const { txid, index, addressName } = req.params;
  log.info(`API request: ${req.method} start fluxnode ${txid}:${index}${addressName ? ` with address ${addressName}` : ''} from ${getRealIp(req)}`);
  next();
}

// API Routes
const prefix = 'api';

// GET /api/start/:txid/:index — Legacy start (uses default/first address)
app.get(`/${prefix}/start/:txid/:index`, transactionLimiter, validateTransactionParams, logStartRequest, fluxnodeService.getStart);

// GET /api/start/:txid/:index/:addressName — Start with specific address
app.get(`/${prefix}/start/:txid/:index/:addressName`, transactionLimiter, validateTransactionParams, logStartRequest, fluxnodeService.getStart);

// POST /api/start-delegate/:txid/:index/:addressName — Start node + register delegate keys
// Body: { "delegatePublicKeys": ["<66-char-hex>", ...] }
app.post(`/${prefix}/start-delegate/:txid/:index/:addressName`, transactionLimiter, validateTransactionParams, logStartRequest, fluxnodeService.startWithDelegate);

// POST /api/start-as-delegate/:txid/:index/:addressName — Start node as a delegate
// Body: { "delegatePrivateKey": "<WIF-key>" }
app.post(`/${prefix}/start-as-delegate/:txid/:index/:addressName`, transactionLimiter, validateTransactionParams, logStartRequest, fluxnodeService.startAsDelegate);

// GET /api/addresses — List all configured addresses
app.get(
  `/${prefix}/addresses`,
  (req, res, next) => {
    log.info(`API request: list addresses from ${getRealIp(req)}`);
    next();
  },
  fluxnodeService.getAddresses
);

// 404 handler
app.use((req, res) => {
  log.warn(`404 Not Found: ${req.method} ${req.url} from ${getRealIp(req)}`);
  res.status(404).json({
    status: 'error',
    error: 'Endpoint not found',
  });
});

// Global error handler
app.use((err, req, res, next) => {
  metrics.errorCount++;

  log.error(`Express error: ${err.message}`, {
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: getRealIp(req),
    requestId: req.requestId,
  });

  // Never leak error details in production
  const isDevelopment = nodeEnv === 'development';

  res.status(err.status || 500).json({
    status: 'error',
    error: isDevelopment ? err.message : 'Internal server error',
  });
});

module.exports = app;
