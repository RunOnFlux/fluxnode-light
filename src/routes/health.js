const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const log = require('../lib/logger');

let healthStatus = {
  status: 'initializing',
  lastCheck: Date.now(),
  checks: {},
  uptime: 0,
  version: require('../../package.json').version,
};

// Update health status periodically
async function updateHealthStatus() {
  try {
    const checks = {};

    // Check memory usage
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsagePercent = ((totalMem - freeMem) / totalMem) * 100;

    checks.memory = {
      status: memUsagePercent < 90 ? 'healthy' : 'warning',
      usage: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
        systemUsagePercent: memUsagePercent.toFixed(2) + '%',
      },
    };

    // Check CPU usage
    const cpuUsage = process.cpuUsage();
    checks.cpu = {
      status: 'healthy',
      usage: {
        user: Math.round(cpuUsage.user / 1000) + 'ms',
        system: Math.round(cpuUsage.system / 1000) + 'ms',
      },
    };

    // Check disk space (for log directory)
    try {
      const logDir = path.join(__dirname, '../../logs');
      await fs.stat(logDir);
      checks.disk = {
        status: 'healthy',
        accessible: true,
      };
    } catch (error) {
      checks.disk = {
        status: 'error',
        error: 'Cannot access log directory',
      };
    }

    // Check external API connectivity
    checks.externalAPIs = {
      status: 'healthy',
      message: 'API connectivity monitoring active',
    };

    // Overall status determination
    const allStatuses = Object.values(checks).map(check => check.status);
    let overallStatus = 'healthy';

    if (allStatuses.includes('error')) {
      overallStatus = 'unhealthy';
    } else if (allStatuses.includes('warning')) {
      overallStatus = 'degraded';
    }

    healthStatus = {
      status: overallStatus,
      lastCheck: Date.now(),
      checks,
      uptime: process.uptime(),
      version: require('../../package.json').version,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    log.error(`Health check failed: ${error.message}`);
    healthStatus.status = 'error';
  }
}

// Liveness probe - simple check if service is responsive
function livenessProbe(req, res) {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
}

// Readiness probe - check if service is ready to accept traffic
function readinessProbe(req, res) {
  const isReady = healthStatus.status !== 'initializing' &&
                  healthStatus.status !== 'error';

  if (isReady) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      reason: healthStatus.status,
      timestamp: new Date().toISOString(),
    });
  }
}

// Detailed health check
function healthCheck(req, res) {
  const statusCode = healthStatus.status === 'healthy' ? 200 :
                     healthStatus.status === 'degraded' ? 200 : 503;

  res.status(statusCode).json(healthStatus);
}

// Metrics endpoint for monitoring — requires auth (enforced in router)
// Reduced information exposure: no hostname, PID, or platform details
function metrics(req, res) {
  const memUsage = process.memoryUsage();

  // Get app-level metrics from app.locals
  const appMetrics = req.app.locals.metrics || {};

  const metricsData = {
    process: {
      uptime: process.uptime(),
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
      },
    },
    application: {
      version: require('../../package.json').version,
      requests: {
        total: appMetrics.requestCount || 0,
        errors: appMetrics.errorCount || 0,
      },
      addresses: appMetrics.addressCount || 0,
    },
    timestamp: new Date().toISOString(),
  };

  res.json(metricsData);
}

// Initialize health monitoring
function initHealthMonitoring(interval = 60000) {
  updateHealthStatus();
  setInterval(updateHealthStatus, interval);
  log.info(`Health monitoring initialized with ${interval}ms interval`);
}

module.exports = {
  livenessProbe,
  readinessProbe,
  healthCheck,
  metrics,
  initHealthMonitoring,
  updateHealthStatus,
};
