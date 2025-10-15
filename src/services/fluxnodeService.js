const { fluxnode } = require('@runonflux/flux-sdk');
const config = require('../../config/env-config');
const ApiClient = require('../lib/api-client');
const log = require('../lib/logger');
const discord = require('../../discord/hooks');

// Initialize API client with retry logic
const apiClient = new ApiClient({
  timeout: config.api.timeout,
  maxRetries: config.api.maxRetries,
  retryDelay: config.api.retryDelay,
  cacheEnabled: config.cache.enabled,
  cacheTTL: config.cache.ttl,
  maxCacheSize: config.cache.maxSize,
});

// Circuit breakers for external services
const explorerCircuit = apiClient.createCircuitBreaker('Explorer API', 5, 60000);
const fluxApiCircuit = apiClient.createCircuitBreaker('Flux API', 5, 60000);

class FluxnodeService {
  constructor() {
    this.addresses = config.addresses || [];
    this.validateConfiguration();
  }

  // Validate service configuration on startup
  validateConfiguration() {
    if (!this.addresses || this.addresses.length === 0) {
      throw new Error('No addresses configured. Please configure at least one address in your .env file');
    }

    // Validate each address configuration
    for (const [index, addr] of this.addresses.entries()) {
      const required = ['name', 'collateralAddress', 'fluxnodePrivateKey', 'p2shprivkey', 'redeemScript'];
      const missing = required.filter(field => !addr[field]);

      if (missing.length > 0) {
        throw new Error(`Address ${index + 1} is missing required fields: ${missing.join(', ')}`);
      }

      // Validate address format
      if (!/^t[1-9A-Za-z]{34}$/.test(addr.collateralAddress)) {
        log.warn(`Address ${addr.name} has potentially invalid collateral address format`);
      }
    }

    log.info(`Service configured with ${this.addresses.length} address(es)`);
  }

  // Get address configuration by name
  getAddressConfig(addressName) {
    if (!addressName) {
      // Return first address for backward compatibility
      return this.addresses[0];
    }

    const config = this.addresses.find(addr => addr.name === addressName);
    if (!config) {
      throw new Error(`Address configuration not found for: ${addressName}`);
    }

    return config;
  }

  // Find address config by collateral address
  findAddressByCollateral(collateralAddress) {
    return this.addresses.find(addr => addr.collateralAddress === collateralAddress);
  }

  // List all configured addresses (public info only)
  listAddresses() {
    return this.addresses.map(addr => ({
      name: addr.name,
      collateralAddress: addr.collateralAddress,
    }));
  }

  // Build API URL for transaction lookup
  buildTransactionUrl(txid) {
    return `${config.api.explorerUrl}/tx/${txid}`;
  }

  // Fetch and validate collateral address from blockchain
  async fetchCollateralInfo(txid, index) {
    if (!explorerCircuit.canAttempt()) {
      throw new Error('Explorer API circuit breaker is open - too many failures');
    }

    try {
      const url = this.buildTransactionUrl(txid);
      log.debug(`Fetching collateral info from: ${url}`);

      const response = await apiClient.get(url);

      if (!response || response.txid !== txid) {
        throw new Error(`Transaction ID mismatch: expected ${txid}, got ${response?.txid}`);
      }

      // Parse output
      const outputIndex = parseInt(index, 10);
      if (!response.vout || outputIndex >= response.vout.length) {
        throw new Error(`Invalid output index ${index}. Transaction has ${response.vout?.length || 0} outputs`);
      }

      const output = response.vout[outputIndex];

      // Validate output
      const validation = this.validateCollateralOutput(output);
      if (!validation.valid) {
        throw new Error(`Invalid collateral: ${validation.error}`);
      }

      explorerCircuit.recordSuccess();

      return {
        address: validation.address,
        amount: validation.amount,
        type: validation.type,
      };

    } catch (error) {
      explorerCircuit.recordFailure();
      log.error(`Failed to fetch collateral info: ${error.message}`);
      throw error;
    }
  }

  // Validate collateral output
  validateCollateralOutput(output) {
    // Check script type
    if (output.scriptPubKey?.type !== 'scripthash') {
      return {
        valid: false,
        error: `Invalid script type: ${output.scriptPubKey?.type} (expected scripthash)`,
      };
    }

    // Check for address
    const addresses = output.scriptPubKey?.addresses;
    if (!addresses || addresses.length === 0) {
      return {
        valid: false,
        error: 'No addresses found in output',
      };
    }

    const address = addresses[0];
    const amount = output.value;

    // Validate amount (Titan: 12500, others: 40000)
    const validAmounts = ['12500.00000000', '40000.00000000'];
    if (!validAmounts.includes(amount)) {
      return {
        valid: false,
        error: `Invalid collateral amount: ${amount}`,
      };
    }

    return {
      valid: true,
      address,
      amount,
      type: amount === '12500.00000000' ? 'Titan' : 'Standard',
    };
  }

  // Generate and send start transaction
  async generateStartTransaction(collateralInfo, txid, index, addressConfig) {
    try {
      const timestamp = Math.round(Date.now() / 1000).toString();

      log.info(`Generating start transaction for ${addressConfig.name}`);
      log.debug(`Collateral: ${txid}:${index}, Address: ${collateralInfo.address}`);

      const tx = fluxnode.startFluxNodev6(
        txid,
        index.toString(),
        addressConfig.p2shprivkey,
        addressConfig.fluxnodePrivateKey,
        timestamp,
        true, // compressed
        false, // version 6
        addressConfig.redeemScript
      );

      if (!tx) {
        throw new Error('Failed to generate start transaction');
      }

      return tx;

    } catch (error) {
      log.error(`Failed to generate start transaction: ${error.message}`);
      throw error;
    }
  }

  // Broadcast transaction to network
  async broadcastTransaction(tx, txid, index, ipAddress, addressName) {
    if (!fluxApiCircuit.canAttempt()) {
      throw new Error('Flux API circuit breaker is open - too many failures');
    }

    try {
      const url = `${config.api.fluxApiUrl}/daemon/sendrawtransaction/${tx}`;
      log.info(`Broadcasting transaction to: ${url}`);

      const response = await apiClient.get(url);

      const success = response?.status !== 'error';

      // Log audit event
      log.audit('TRANSACTION_BROADCAST', {
        txid,
        index,
        success,
        ipAddress,
        addressName,
        response: response?.data || response,
      });

      // Send Discord notification
      if (config.discord.enabled) {
        const hookData = {
          ...response,
          addressName: addressName || 'default',
        };
        discord.sendHook(txid, index, success, hookData, ipAddress);
      }

      if (success) {
        fluxApiCircuit.recordSuccess();
      } else {
        fluxApiCircuit.recordFailure();
      }

      return response;

    } catch (error) {
      fluxApiCircuit.recordFailure();
      log.error(`Failed to broadcast transaction: ${error.message}`);

      // Send error notification
      if (config.discord.enabled) {
        const errorData = {
          status: 'error',
          error: error.message,
          addressName: addressName || 'default',
        };
        discord.sendHook(txid, index, false, errorData, ipAddress);
      }

      throw error;
    }
  }

  // Main process flow
  async processStartRequest(txid, index, ipAddress, addressName) {
    const startTime = Date.now();

    try {
      log.info(`Processing start request: ${txid}:${index} with address: ${addressName || 'default'}`);

      // Step 1: Fetch and validate collateral
      const collateralInfo = await this.fetchCollateralInfo(txid, index);
      log.info(`Collateral validated: ${collateralInfo.address} (${collateralInfo.type})`);

      // Step 2: Find matching address configuration
      let addressConfig;

      if (addressName) {
        // Specific address requested
        addressConfig = this.getAddressConfig(addressName);

        // Verify it matches the collateral
        if (addressConfig.collateralAddress !== collateralInfo.address) {
          throw new Error(
            `Address mismatch: requested ${addressName} (${addressConfig.collateralAddress}) ` +
            `but collateral is for ${collateralInfo.address}`
          );
        }
      } else {
        // Legacy mode: find matching address
        addressConfig = this.findAddressByCollateral(collateralInfo.address);

        if (!addressConfig) {
          throw new Error(
            `No configuration found for collateral address: ${collateralInfo.address}`
          );
        }
      }

      log.info(`Using address configuration: ${addressConfig.name}`);

      // Step 3: Generate start transaction
      const tx = await this.generateStartTransaction(
        collateralInfo,
        txid,
        index,
        addressConfig
      );

      // Step 4: Broadcast transaction
      const result = await this.broadcastTransaction(
        tx,
        txid,
        index,
        ipAddress,
        addressConfig.name
      );

      // Log performance metrics
      const duration = Date.now() - startTime;
      log.metric('start_request_duration', duration, {
        success: true,
        addressName: addressConfig.name,
      });

      return result;

    } catch (error) {
      // Log failure metrics
      const duration = Date.now() - startTime;
      log.metric('start_request_duration', duration, {
        success: false,
        error: error.message,
      });

      throw error;
    }
  }
}

// Create singleton instance
const service = new FluxnodeService();

// Express route handlers
function getStartWrapper(req, res) {
  const { txid, index, addressName } = req.params;
  const ipAddress = req.ip;

  service.processStartRequest(txid, index, ipAddress, addressName)
    .then(result => {
      res.json(result);
    })
    .catch(error => {
      log.error(`Request failed: ${error.message}`);
      res.status(500).json({
        status: 'error',
        error: error.message,
      });
    });
}

function getAddresses(req, res) {
  try {
    const addresses = service.listAddresses();
    res.json({
      success: true,
      addresses,
      count: addresses.length,
    });
  } catch (error) {
    log.error(`Failed to list addresses: ${error.message}`);
    res.status(500).json({
      status: 'error',
      error: error.message,
    });
  }
}

module.exports = {
  FluxnodeService,
  service,
  getStartWrapper,
  getAddresses,
  // Legacy exports for compatibility
  getStart: getStartWrapper,
};