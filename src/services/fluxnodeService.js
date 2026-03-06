const { fluxnode } = require('@runonflux/flux-sdk');
const config = require('../../config/env-config');
const ApiClient = require('../lib/api-client');
const log = require('../lib/logger');
const discord = require('../../discord/hooks');

// Valid collateral amounts (numeric comparison, not string)
// Cumulus: 1000, Nimbus: 12500, Stratus: 40000
const VALID_COLLATERAL_AMOUNTS = [1000, 12500, 40000];

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

// Simple in-memory UTXO lock to prevent double-spend races
const utxoLocks = new Map();
const UTXO_LOCK_TTL = 60000; // 1 minute

function acquireUtxoLock(txid, index) {
  const key = `${txid}:${index}`;
  const existing = utxoLocks.get(key);
  if (existing && Date.now() - existing < UTXO_LOCK_TTL) {
    return false;
  }
  utxoLocks.set(key, Date.now());
  return true;
}

function releaseUtxoLock(txid, index) {
  utxoLocks.delete(`${txid}:${index}`);
}

// Periodic lock cleanup
setInterval(() => {
  const cutoff = Date.now() - UTXO_LOCK_TTL;
  for (const [key, timestamp] of utxoLocks.entries()) {
    if (timestamp < cutoff) {
      utxoLocks.delete(key);
    }
  }
}, UTXO_LOCK_TTL);

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
        throw new Error(`Address ${addr.name} has invalid collateral address format: ${addr.collateralAddress}`);
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

    const addrConfig = this.addresses.find(addr => addr.name === addressName);
    if (!addrConfig) {
      throw new Error(`Address configuration not found for: ${addressName}`);
    }

    return addrConfig;
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
      log.debug(`Fetching collateral info for ${txid}:${index}`);

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
      log.error(`Failed to fetch collateral info for ${txid}:${index}: ${error.message}`);
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
    const rawAmount = output.value;

    // Parse amount numerically for robust comparison
    const amountNum = parseFloat(rawAmount);
    if (isNaN(amountNum) || !VALID_COLLATERAL_AMOUNTS.includes(amountNum)) {
      return {
        valid: false,
        error: `Invalid collateral amount: ${rawAmount}`,
      };
    }

    return {
      valid: true,
      address,
      amount: rawAmount,
      type: amountNum === 1000 ? 'Cumulus' : amountNum === 12500 ? 'Nimbus' : 'Stratus',
    };
  }

  // Generate and send start transaction
  // Supports three modes:
  //   - Normal start (default)
  //   - Start + add delegates (delegatePublicKeys provided)
  //   - Start as delegate (delegatePrivateKey provided)
  async generateStartTransaction(collateralInfo, txid, index, addressConfig, options = {}) {
    try {
      const timestamp = Math.round(Date.now() / 1000);
      const outputIndex = parseInt(index, 10);

      log.info(`Generating start transaction for ${addressConfig.name}`);
      log.debug(`Collateral: ${txid}:${index}, Address: ${collateralInfo.address}`);

      let tx;

      if (options.delegatePublicKeys && options.delegatePublicKeys.length > 0) {
        // Mode: Owner starts node and registers delegate public keys
        log.info(`Adding ${options.delegatePublicKeys.length} delegate key(s) for ${addressConfig.name}`);
        tx = fluxnode.startFluxNodeAddDelegate(
          txid,
          outputIndex,
          addressConfig.p2shprivkey,
          addressConfig.fluxnodePrivateKey,
          timestamp,
          options.delegatePublicKeys,
          true, // compressedCollateralPrivateKey
          false, // compressedFluxnodePrivateKey
          addressConfig.redeemScript
        );
      } else if (options.delegatePrivateKey) {
        // Mode: Delegate starts node on behalf of owner
        log.info(`Starting node as delegate for ${addressConfig.name}`);
        tx = fluxnode.startFluxNodeAsDelegate(
          txid,
          outputIndex,
          options.delegatePrivateKey,
          addressConfig.fluxnodePrivateKey,
          timestamp,
          true, // compressedDelegatePrivateKey
          false, // compressedFluxnodePrivateKey
          addressConfig.redeemScript
        );
      } else {
        // Mode: Normal start (owner starts directly)
        tx = fluxnode.startFluxNodev6(
          txid,
          outputIndex,
          addressConfig.p2shprivkey,
          addressConfig.fluxnodePrivateKey,
          timestamp,
          true, // compressedCollateralPrivateKey
          false, // compressedFluxnodePrivateKey
          addressConfig.redeemScript
        );
      }

      if (!tx) {
        throw new Error('Failed to generate start transaction');
      }

      return tx;

    } catch (error) {
      log.error(`Failed to generate start transaction for ${addressConfig.name}: ${error.message}`);
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
      log.info(`Broadcasting transaction for ${txid}:${index} (address: ${addressName || 'default'})`);

      const response = await apiClient.get(url);

      const success = response?.status !== 'error';

      // Log audit event for both success and failure
      log.audit('TRANSACTION_BROADCAST', {
        txid,
        index,
        success,
        ipAddress,
        addressName,
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
      log.error(`Failed to broadcast transaction for ${txid}:${index}: ${error.message}`);

      // Audit failed broadcast
      log.audit('TRANSACTION_BROADCAST_FAILED', {
        txid,
        index,
        ipAddress,
        addressName,
        error: error.message,
      });

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
  // options.delegatePublicKeys: array of delegate public keys to register (owner mode)
  // options.delegatePrivateKey: delegate private key for starting as delegate
  // options.fluxnodePrivateKey: fluxnode identity key (allows delegate start without address in .env)
  // options.redeemScript: redeem script (allows delegate start without address in .env)
  async processStartRequest(txid, index, ipAddress, addressName, options = {}) {
    const startTime = Date.now();

    // Acquire UTXO lock to prevent double-spend races
    if (!acquireUtxoLock(txid, index)) {
      throw new Error(`Transaction ${txid}:${index} is already being processed`);
    }

    try {
      const mode = options.delegatePublicKeys ? 'add-delegate'
        : options.delegatePrivateKey ? 'as-delegate' : 'normal';
      log.info(`Processing start request (${mode}): ${txid}:${index} with address: ${addressName || 'default'}`);

      // Step 1: Fetch and validate collateral
      const collateralInfo = await this.fetchCollateralInfo(txid, index);
      log.info(`Collateral validated: ${collateralInfo.address} (${collateralInfo.type})`);

      // Step 2: Find or build address configuration
      let addressConfig;

      // For delegate starts, caller can provide all required keys directly
      // This allows starting nodes not configured in .env
      if (options.delegatePrivateKey && options.fluxnodePrivateKey && options.redeemScript) {
        addressConfig = {
          name: addressName || 'delegate-provided',
          collateralAddress: collateralInfo.address,
          fluxnodePrivateKey: options.fluxnodePrivateKey,
          redeemScript: options.redeemScript,
        };
        log.info(`Using caller-provided keys for delegate start (no .env config needed)`);
      } else if (addressName) {
        // Specific address requested from config
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

      // Build delegate options — prefer explicit params, fall back to address config
      const txOptions = {};
      if (options.delegatePublicKeys) {
        txOptions.delegatePublicKeys = options.delegatePublicKeys;
      } else if (addressConfig.delegatePublicKeys && addressConfig.delegatePublicKeys.length > 0 && !options.delegatePrivateKey) {
        txOptions.delegatePublicKeys = addressConfig.delegatePublicKeys;
      }
      if (options.delegatePrivateKey) {
        txOptions.delegatePrivateKey = options.delegatePrivateKey;
      } else if (addressConfig.delegatePrivateKey) {
        txOptions.delegatePrivateKey = addressConfig.delegatePrivateKey;
      }

      // Step 3: Generate start transaction
      const tx = await this.generateStartTransaction(
        collateralInfo,
        txid,
        index,
        addressConfig,
        txOptions
      );

      // Step 4: Broadcast transaction
      const result = await this.broadcastTransaction(
        tx,
        txid,
        index,
        ipAddress,
        addressConfig.name
      );

      // Invalidate cache for this UTXO after successful broadcast
      apiClient.invalidateCache(this.buildTransactionUrl(txid));

      // Log performance metrics
      const duration = Date.now() - startTime;
      log.metric('start_request_duration', duration, {
        success: true,
        addressName: addressConfig.name,
        mode,
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
    } finally {
      releaseUtxoLock(txid, index);
    }
  }
}

// Create singleton instance
const service = new FluxnodeService();

// Express route handlers
function getStartWrapper(req, res) {
  const { txid, index, addressName } = req.params;
  const ipAddress = getRealIp(req);

  service.processStartRequest(txid, index, ipAddress, addressName)
    .then(result => {
      res.json(result);
    })
    .catch(error => {
      log.error(`Request failed for ${txid}:${index}: ${error.message}`);

      // Differentiate client vs server errors
      const status = error.message.includes('not found') || error.message.includes('mismatch')
        || error.message.includes('Invalid') || error.message.includes('already being processed')
        ? 400 : 500;

      res.status(status).json({
        status: 'error',
        error: error.message,
      });
    });
}

// Import getRealIp for route handler
const { getRealIp } = require('../middleware/security');

// Helper: standard error response
function sendErrorResponse(res, error) {
  const status = error.message.includes('not found') || error.message.includes('mismatch')
    || error.message.includes('Invalid') || error.message.includes('already being processed')
    || error.message.includes('required') || error.message.includes('Too many')
    ? 400 : 500;

  res.status(status).json({
    status: 'error',
    error: error.message,
  });
}

function getAddresses(req, res) {
  try {
    const addresses = service.listAddresses();
    res.json({
      status: 'success',
      addresses,
      count: addresses.length,
    });
  } catch (error) {
    log.error(`Failed to list addresses: ${error.message}`);
    sendErrorResponse(res, error);
  }
}

// POST /api/start-delegate/:txid/:index/:addressName
// Body: { delegatePublicKeys: ["pubkey1", "pubkey2", ...] }
// Starts a node and registers delegate public keys (owner operation)
function startWithDelegate(req, res) {
  const { txid, index, addressName } = req.params;
  const ipAddress = getRealIp(req);
  const { delegatePublicKeys } = req.body || {};

  if (!delegatePublicKeys || !Array.isArray(delegatePublicKeys) || delegatePublicKeys.length === 0) {
    return res.status(400).json({
      status: 'error',
      error: 'delegatePublicKeys array is required and must contain at least one key',
    });
  }

  // Validate each public key is a 66-char hex string (33 bytes compressed)
  for (const key of delegatePublicKeys) {
    if (typeof key !== 'string' || !/^[a-fA-F0-9]{66}$/.test(key)) {
      return res.status(400).json({
        status: 'error',
        error: `Invalid delegate public key format: ${key}. Must be 66 hex character compressed public key.`,
      });
    }
  }

  if (delegatePublicKeys.length > fluxnode.MAX_DELEGATE_PUBKEYS) {
    return res.status(400).json({
      status: 'error',
      error: `Too many delegate public keys. Maximum is ${fluxnode.MAX_DELEGATE_PUBKEYS}.`,
    });
  }

  service.processStartRequest(txid, index, ipAddress, addressName, { delegatePublicKeys })
    .then(result => res.json(result))
    .catch(error => {
      log.error(`Start-with-delegate failed for ${txid}:${index}: ${error.message}`);
      sendErrorResponse(res, error);
    });
}

// POST /api/start-as-delegate/:txid/:index/:addressName
// Body: { delegatePrivateKey: "WIF-key", fluxnodePrivateKey?: "WIF-key", redeemScript?: "hex" }
// Starts a node using delegate authority (delegate operation)
// If fluxnodePrivateKey and redeemScript are provided, no .env address config is needed
function startAsDelegate(req, res) {
  const { txid, index, addressName } = req.params;
  const ipAddress = getRealIp(req);
  const { delegatePrivateKey, fluxnodePrivateKey, redeemScript } = req.body || {};

  if (!delegatePrivateKey || typeof delegatePrivateKey !== 'string') {
    return res.status(400).json({
      status: 'error',
      error: 'delegatePrivateKey is required (WIF format)',
    });
  }

  // If providing keys directly, both are required together
  if ((fluxnodePrivateKey && !redeemScript) || (!fluxnodePrivateKey && redeemScript)) {
    return res.status(400).json({
      status: 'error',
      error: 'fluxnodePrivateKey and redeemScript must both be provided together',
    });
  }

  const options = { delegatePrivateKey };
  if (fluxnodePrivateKey && redeemScript) {
    if (typeof fluxnodePrivateKey !== 'string' || fluxnodePrivateKey.length < 50 || fluxnodePrivateKey.length > 60) {
      return res.status(400).json({
        status: 'error',
        error: 'fluxnodePrivateKey must be a valid WIF string',
      });
    }
    if (typeof redeemScript !== 'string' || !/^[a-f0-9]+$/i.test(redeemScript) || redeemScript.length > 1024) {
      return res.status(400).json({
        status: 'error',
        error: 'redeemScript must be a valid hex string',
      });
    }
    options.fluxnodePrivateKey = fluxnodePrivateKey;
    options.redeemScript = redeemScript;
  }

  service.processStartRequest(txid, index, ipAddress, addressName, options)
    .then(result => res.json(result))
    .catch(error => {
      log.error(`Start-as-delegate failed for ${txid}:${index}: ${error.message}`);
      sendErrorResponse(res, error);
    });
}

module.exports = {
  FluxnodeService,
  service,
  getStartWrapper,
  getAddresses,
  startWithDelegate,
  startAsDelegate,
  getStart: getStartWrapper,
};
