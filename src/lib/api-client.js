const axios = require('axios');
const log = require('./log');

class ApiClient {
  constructor(config = {}) {
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.cache = new Map();
    this.cacheEnabled = config.cacheEnabled !== false;
    this.cacheTTL = config.cacheTTL || 300000; // 5 minutes
    this.maxCacheSize = config.maxCacheSize || 100;
  }

  // Clean up expired cache entries
  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTTL) {
        this.cache.delete(key);
      }
    }

    // Enforce max cache size
    if (this.cache.size > this.maxCacheSize) {
      const toDelete = this.cache.size - this.maxCacheSize;
      const keys = Array.from(this.cache.keys());
      for (let i = 0; i < toDelete; i++) {
        this.cache.delete(keys[i]);
      }
    }
  }

  // Get cached response if available and not expired
  getCached(url) {
    if (!this.cacheEnabled) return null;

    const cached = this.cache.get(url);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTTL) {
      this.cache.delete(url);
      return null;
    }

    log.debug(`Cache hit for ${url} (age: ${age}ms)`);
    return cached.data;
  }

  // Store response in cache
  setCached(url, data) {
    if (!this.cacheEnabled) return;

    this.cache.set(url, {
      data,
      timestamp: Date.now(),
    });

    // Periodic cleanup
    if (Math.random() < 0.1) {
      this.cleanCache();
    }
  }

  // Exponential backoff calculation
  getBackoffDelay(attempt) {
    return this.retryDelay * Math.pow(2, attempt) + Math.random() * 1000;
  }

  // Check if error is retryable
  isRetryableError(error) {
    if (!error.response) {
      // Network errors, timeouts, etc.
      return true;
    }

    const status = error.response.status;
    // Retry on 5xx errors and specific 4xx errors
    return status >= 500 || status === 429 || status === 408;
  }

  // Make HTTP request with retry logic
  async makeRequest(url, options = {}, attempt = 0) {
    try {
      // Check cache first for GET requests
      if (options.method === 'GET' || !options.method) {
        const cached = this.getCached(url);
        if (cached) return cached;
      }

      const requestConfig = {
        url,
        timeout: this.timeout,
        validateStatus: (status) => status < 500,
        ...options,
      };

      log.debug(`Making request to ${url} (attempt ${attempt + 1}/${this.maxRetries})`);

      const response = await axios(requestConfig);

      // Cache successful GET responses
      if ((options.method === 'GET' || !options.method) && response.status === 200) {
        this.setCached(url, response.data);
      }

      return response.data;
    } catch (error) {
      const isRetryable = this.isRetryableError(error);
      const hasRetriesLeft = attempt < this.maxRetries - 1;

      if (isRetryable && hasRetriesLeft) {
        const delay = this.getBackoffDelay(attempt);
        log.warn(`Request to ${url} failed (attempt ${attempt + 1}/${this.maxRetries}). Retrying in ${delay}ms...`);
        log.debug(`Error: ${error.message}`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest(url, options, attempt + 1);
      }

      // Max retries reached or non-retryable error
      const errorMessage = error.response?.data?.error || error.message;
      log.error(`Request to ${url} failed after ${attempt + 1} attempts: ${errorMessage}`);

      throw {
        message: errorMessage,
        status: error.response?.status,
        isTimeout: error.code === 'ECONNABORTED',
        isNetworkError: !error.response,
        originalError: error,
      };
    }
  }

  // Convenience methods
  async get(url, config = {}) {
    return this.makeRequest(url, { ...config, method: 'GET' });
  }

  async post(url, data, config = {}) {
    return this.makeRequest(url, { ...config, method: 'POST', data });
  }

  // Circuit breaker pattern for external services
  createCircuitBreaker(name, threshold = 5, resetTime = 60000) {
    return {
      name,
      failures: 0,
      lastFailure: null,
      isOpen: false,
      threshold,
      resetTime,

      recordSuccess() {
        this.failures = 0;
        this.isOpen = false;
      },

      recordFailure() {
        this.failures++;
        this.lastFailure = Date.now();

        if (this.failures >= this.threshold) {
          this.isOpen = true;
          log.error(`Circuit breaker opened for ${this.name} after ${this.failures} failures`);
        }
      },

      canAttempt() {
        if (!this.isOpen) return true;

        const timeSinceFailure = Date.now() - this.lastFailure;
        if (timeSinceFailure > this.resetTime) {
          log.info(`Circuit breaker for ${this.name} attempting reset after ${timeSinceFailure}ms`);
          this.isOpen = false;
          this.failures = Math.floor(this.failures / 2); // Half-open state
          return true;
        }

        return false;
      },
    };
  }
}

module.exports = ApiClient;