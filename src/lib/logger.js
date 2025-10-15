const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logDir = process.env.LOG_DIRECTORY || './logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Try to load winston
let winston;
let useWinston = false;

try {
  winston = require('winston');
  require('winston-daily-rotate-file');
  useWinston = true;
} catch (error) {
  console.warn('Winston not installed. Using fallback console logger.');
}

// If winston is available, set it up
if (useWinston) {
  // Define log levels
  const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
  };

  // Define colors for each level
  const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
  };

  winston.addColors(colors);

  // Format for console output
  const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
      (info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? '\n' + info.stack : ''}`
    )
  );

  // Format for file output
  const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  );

  // Create rotating file transport
  const fileRotateTransport = new winston.transports.DailyRotateFile({
    filename: path.join(logDir, 'application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: process.env.LOG_MAX_FILE_SIZE || '10m',
    maxFiles: process.env.LOG_MAX_FILES || '5',
    format: fileFormat,
    level: process.env.LOG_LEVEL || 'info',
  });

  // Error file transport
  const errorFileTransport = new winston.transports.DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: process.env.LOG_MAX_FILE_SIZE || '10m',
    maxFiles: process.env.LOG_MAX_FILES || '5',
    format: fileFormat,
    level: 'error',
  });

  // Create the logger
  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    levels,
    format: fileFormat,
    transports: [
      fileRotateTransport,
      errorFileTransport,
    ],
    exitOnError: false,
  });

  // Add console transport
  if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
      format: consoleFormat,
      level: 'debug',
    }));
  } else {
    logger.add(new winston.transports.Console({
      format: consoleFormat,
      level: 'warn',
    }));
  }

  // Create a stream for Morgan HTTP logging
  logger.stream = {
    write: (message) => {
      logger.http(message.trim());
    },
  };

  // Wrapper functions for backward compatibility
  const log = {
    error: (message, meta) => {
      if (typeof message === 'object') {
        logger.error(JSON.stringify(message), meta);
      } else {
        logger.error(message, meta);
      }
    },

    warn: (message, meta) => {
      if (typeof message === 'object') {
        logger.warn(JSON.stringify(message), meta);
      } else {
        logger.warn(message, meta);
      }
    },

    info: (message, meta) => {
      if (typeof message === 'object') {
        logger.info(JSON.stringify(message), meta);
      } else {
        logger.info(message, meta);
      }
    },

    debug: (message, meta) => {
      if (typeof message === 'object') {
        logger.debug(JSON.stringify(message), meta);
      } else {
        logger.debug(message, meta);
      }
    },

    http: (message, meta) => {
      logger.http(message, meta);
    },

    time: (label) => {
      logger.profile(label);
    },

    timeEnd: (label) => {
      logger.profile(label);
    },

    metric: (name, value, tags = {}) => {
      logger.info('METRIC', {
        metric: name,
        value,
        tags,
        timestamp: Date.now(),
      });
    },

    audit: (action, details = {}) => {
      logger.info('AUDIT', {
        action,
        details,
        timestamp: Date.now(),
        user: details.user || 'system',
      });
    },
  };

  // Handle log rotation events
  fileRotateTransport.on('rotate', (oldFilename, newFilename) => {
    logger.info(`Log rotation: ${oldFilename} -> ${newFilename}`);
  });

  // Export winston-based logger
  module.exports = log;
  module.exports.logger = logger;

} else {
  // Fallback implementation when winston is not available
  const fallbackLog = {
    error: (message, meta) => console.error(`[ERROR] ${message}`, meta || ''),
    warn: (message, meta) => console.warn(`[WARN] ${message}`, meta || ''),
    info: (message, meta) => console.info(`[INFO] ${message}`, meta || ''),
    debug: (message, meta) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[DEBUG] ${message}`, meta || '');
      }
    },
    http: (message, meta) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[HTTP] ${message}`, meta || '');
      }
    },
    time: (label) => console.time(label),
    timeEnd: (label) => console.timeEnd(label),
    metric: (name, value, tags = {}) => {
      console.log(`[METRIC] ${name}: ${value}`, tags);
    },
    audit: (action, details = {}) => {
      console.log(`[AUDIT] ${action}`, details);
    },
  };

  // Create a mock logger object for compatibility with Morgan
  const fallbackLogger = {
    stream: {
      write: (message) => console.log(message.trim()),
    },
  };

  // Export fallback logger
  module.exports = fallbackLog;
  module.exports.logger = fallbackLogger;
}