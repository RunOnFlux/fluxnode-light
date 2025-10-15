const http = require('http');
const config = require('./config/env-config');
const app = require('./src/lib/server');
const log = require('./src/lib/log');
const ShutdownManager = require('./src/lib/shutdown-manager');
const { initHealthMonitoring } = require('./src/routes/health');

// Global error tracking
global.requestCount = 0;
global.errorCount = 0;
global.addressCount = config.addresses ? config.addresses.length : 0;

// Create HTTP server
const server = http.createServer(app);
const port = process.env.PORT || config.server.port;

// Initialize shutdown manager
const shutdownManager = new ShutdownManager(server, {
  shutdownTimeout: config.process.shutdownTimeout,
});

// Server startup
async function startServer() {
  try {
    // Validate configuration
    if (!config.addresses || config.addresses.length === 0) {
      throw new Error('No addresses configured. Please check your .env file.');
    }

    // Initialize health monitoring
    if (config.healthCheck.enabled) {
      initHealthMonitoring(config.healthCheck.interval);
    }

    // Start listening
    await new Promise((resolve, reject) => {
      server.listen(port, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    log.info(`========================================`);
    log.info(`Fluxnode Light Service v${require('./package.json').version}`);
    log.info(`Environment: ${config.server.env}`);
    log.info(`Server listening on port ${port}`);
    log.info(`Configured addresses: ${config.addresses.length}`);
    log.info(`Health check: ${config.healthCheck.enabled ? 'enabled' : 'disabled'}`);
    log.info(`Rate limiting: enabled`);
    log.info(`Graceful shutdown: ${config.process.enableGracefulShutdown ? 'enabled' : 'disabled'}`);
    log.info(`========================================`);

    // Log available endpoints
    log.info('Available endpoints:');
    log.info(`  GET /api/start/:txid/:index - Start fluxnode (legacy)`);
    log.info(`  GET /api/start/:txid/:index/:addressName - Start fluxnode with specific address`);
    log.info(`  GET /api/addresses - List configured addresses`);
    log.info(`  GET /health - Health check`);
    log.info(`  GET /health/liveness - Liveness probe`);
    log.info(`  GET /health/readiness - Readiness probe`);
    log.info(`  GET /metrics - Application metrics`);

  } catch (error) {
    log.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

// Handle server errors
server.on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;

  switch (error.code) {
    case 'EACCES':
      log.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      log.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});

// Track server connections for monitoring
server.on('connection', (socket) => {
  socket.on('error', (error) => {
    if (error.code !== 'ECONNRESET') {
      log.error(`Socket error: ${error.message}`);
    }
  });
});

// Register shutdown tasks
shutdownManager.onShutdown(async () => {
  log.info('Performing application cleanup...');
  // Add any application-specific cleanup here
  // e.g., close database connections, save state, etc.
});

// Start the server
startServer().catch((error) => {
  log.error(`Startup failed: ${error.message}`);
  process.exit(1);
});

module.exports = server;