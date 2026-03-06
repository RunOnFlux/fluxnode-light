const log = require('./logger');

class ShutdownManager {
  constructor(server, options = {}) {
    this.server = server;
    this.shutdownTimeout = options.shutdownTimeout || 30000;
    this.isShuttingDown = false;
    this.activeConnections = new Set();
    this.shutdownCallbacks = [];
    this.shutdownPromises = [];

    this.setupConnectionTracking();
    this.registerSignalHandlers();
  }

  // Track active connections
  setupConnectionTracking() {
    if (!this.server) return;

    this.server.on('connection', (connection) => {
      this.activeConnections.add(connection);

      connection.on('close', () => {
        this.activeConnections.delete(connection);
      });
    });
  }

  // Register system signal handlers
  registerSignalHandlers() {
    // Graceful shutdown on SIGTERM and SIGINT
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));

    // Log other termination signals
    process.on('SIGHUP', () => {
      log.info('Received SIGHUP signal');
      this.gracefulShutdown('SIGHUP');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      log.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
      this.emergencyShutdown(1);
    });

    // Handle unhandled promise rejections — trigger shutdown
    process.on('unhandledRejection', (reason, promise) => {
      log.error(`Unhandled Rejection: ${reason}`, {
        stack: reason instanceof Error ? reason.stack : undefined,
      });
      this.emergencyShutdown(1);
    });

    // Windows-specific signal
    process.on('message', (msg) => {
      if (msg === 'shutdown') {
        this.gracefulShutdown('IPC');
      }
    });
  }

  // Register cleanup callback
  onShutdown(callback) {
    if (typeof callback === 'function') {
      this.shutdownCallbacks.push(callback);
    }
  }

  // Register async cleanup task
  addShutdownTask(promise) {
    if (promise && typeof promise.then === 'function') {
      this.shutdownPromises.push(promise);
    }
  }

  // Close all active connections
  closeConnections() {
    return new Promise((resolve) => {
      if (this.activeConnections.size === 0) {
        resolve();
        return;
      }

      log.info(`Closing ${this.activeConnections.size} active connections...`);

      // Set keep-alive timeout to 0 and destroy connections
      for (const connection of this.activeConnections) {
        connection.setTimeout(0);
        connection.destroy();
      }

      // Give connections time to close
      setTimeout(() => {
        if (this.activeConnections.size > 0) {
          log.warn(`Force closing ${this.activeConnections.size} remaining connections`);
          for (const connection of this.activeConnections) {
            connection.destroy();
          }
        }
        resolve();
      }, 5000);
    });
  }

  // Execute all shutdown callbacks
  async executeCallbacks() {
    for (const callback of this.shutdownCallbacks) {
      try {
        await callback();
      } catch (error) {
        // Fallback to console in case logger is broken during shutdown
        const msg = `Shutdown callback failed: ${error.message}`;
        try { log.error(msg); } catch { console.error(msg); }
      }
    }

    // Wait for all shutdown tasks
    if (this.shutdownPromises.length > 0) {
      log.info(`Waiting for ${this.shutdownPromises.length} shutdown tasks...`);
      await Promise.allSettled(this.shutdownPromises);
    }
  }

  // Graceful shutdown procedure
  async gracefulShutdown(signal) {
    if (this.isShuttingDown) {
      log.info('Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;
    log.info(`Received ${signal} signal. Starting graceful shutdown...`);

    const shutdownTimer = setTimeout(() => {
      log.error('Graceful shutdown timeout exceeded. Forcing exit...');
      this.emergencyShutdown(1);
    }, this.shutdownTimeout);

    try {
      // Step 1: Stop accepting new requests
      if (this.server) {
        log.info('Stopping server from accepting new connections...');
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
      }

      // Step 2: Close existing connections
      await this.closeConnections();

      // Step 3: Execute cleanup callbacks
      log.info('Executing cleanup tasks...');
      await this.executeCallbacks();

      clearTimeout(shutdownTimer);
      log.info('Graceful shutdown completed successfully');
      process.exit(0);
    } catch (error) {
      log.error(`Error during graceful shutdown: ${error.message}`);
      clearTimeout(shutdownTimer);
      this.emergencyShutdown(1);
    }
  }

  // Emergency shutdown for critical failures
  emergencyShutdown(exitCode = 1) {
    log.error(`Emergency shutdown initiated with exit code ${exitCode}`);

    // Force close all connections
    for (const connection of this.activeConnections) {
      connection.destroy();
    }

    // Force exit
    process.exit(exitCode);
  }

  // Get shutdown status
  getStatus() {
    return {
      isShuttingDown: this.isShuttingDown,
      activeConnections: this.activeConnections.size,
      pendingCallbacks: this.shutdownCallbacks.length,
      pendingTasks: this.shutdownPromises.length,
    };
  }
}

module.exports = ShutdownManager;
