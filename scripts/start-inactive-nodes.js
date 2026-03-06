#!/usr/bin/env node

/**
 * Script to start all inactive FluxNodes for a given collateral address
 *
 * Usage:
 *   node scripts/start-inactive-nodes.js <collateral-address>
 *   npm run start:inactive -- <collateral-address>
 *
 * Example:
 *   node scripts/start-inactive-nodes.js t3c4EfxLoXXSRZCRnPRF3RpjPi9mBzF5yoJ
 */

require('dotenv').config();
const axios = require('axios');
const config = require('../config/env-config');
const logger = require('../src/lib/logger');
const { service: fluxnodeService } = require('../src/services/fluxnodeService');

// API URLs from config
const EXPLORER_API_URL = config.api?.explorerUrl || process.env.EXPLORER_API_URL || 'https://explorer.runonflux.io/api';
const FLUX_API_URL = config.api?.fluxApiUrl || process.env.FLUX_API_URL || 'https://api.runonflux.io';

/**
 * Fetch all collateral UTXOs for an address
 * @param {string} collateralAddress - The collateral address to query
 * @returns {Promise<Array>} Array of collateral UTXOs
 */
async function fetchCollateralUtxos(collateralAddress) {
  try {
    logger.info(`Fetching collateral UTXOs for address: ${collateralAddress}`);

    const response = await axios.get(`${EXPLORER_API_URL}/addr/${collateralAddress}/utxo`, {
      timeout: 30000,
      headers: {
        'User-Agent': 'FluxNode-Light-Script/1.0'
      }
    });

    if (!response.data || !Array.isArray(response.data)) {
      logger.warn('No UTXO data found for address');
      return [];
    }

    // Filter for FluxNode collateral outputs (1000, 12500, or 40000 FLUX)
    const collateralUtxos = response.data.filter(utxo => {
      const amount = parseFloat(utxo.amount);
      return amount === 1000 || amount === 12500 || amount === 40000;
    });

    logger.info(`Found ${collateralUtxos.length} collateral UTXO(s)`);

    return collateralUtxos;
  } catch (error) {
    logger.error('Error fetching collateral UTXOs:', error.message);
    throw error;
  }
}

/**
 * Fetch all confirmed FluxNodes from the network
 * @returns {Promise<Array>} Array of all confirmed FluxNodes
 */
async function fetchAllFluxNodes() {
  try {
    logger.info('Fetching confirmed FluxNode list from network...');

    const response = await axios.get(`${FLUX_API_URL}/daemon/viewdeterministiczelnodelist`, {
      timeout: 60000,
      headers: {
        'User-Agent': 'FluxNode-Light-Script/1.0'
      }
    });

    if (!response.data) {
      throw new Error('Invalid response from FluxNode list API');
    }

    // The API returns {"status":"success","data":[...]}
    let nodeList;
    if (response.data.status === 'success' && Array.isArray(response.data.data)) {
      nodeList = response.data.data;
    } else if (Array.isArray(response.data)) {
      nodeList = response.data;
    } else {
      nodeList = Object.values(response.data);
    }

    logger.info(`Retrieved ${nodeList.length} confirmed node(s) from network`);

    return nodeList;
  } catch (error) {
    logger.error('Error fetching FluxNode list:', error.message);
    throw error;
  }
}

/**
 * Check if a collateral is in the confirmed list and get its status
 * @param {Array} confirmedNodes - All confirmed FluxNodes
 * @param {string} txid - Transaction ID
 * @param {number} index - Output index
 * @returns {object|null} Node info if found, null otherwise
 */
function findNodeInConfirmedList(confirmedNodes, txid, index) {
  return confirmedNodes.find(node => {
    // The API uses "txhash" and "outidx" fields
    // Format: {"txhash":"abc123...","outidx":"0",...}
    // or collateral format: "COutPoint(txid, index)"

    const nodeTxid = node.txhash;
    const nodeIndex = node.outidx;

    return nodeTxid === txid && parseInt(nodeIndex) === parseInt(index);
  });
}

/**
 * Find address configuration matching the collateral address
 * @param {string} collateralAddress - The collateral address to match
 * @returns {object|null} Address configuration or null if not found
 */
function findAddressConfig(collateralAddress) {
  const addresses = config.addresses || [];

  const matchingAddress = addresses.find(addr =>
    addr.collateralAddress === collateralAddress
  );

  if (!matchingAddress) {
    logger.warn(`No configuration found for address: ${collateralAddress}`);
    logger.info('Available addresses in .env:');
    addresses.forEach(addr => {
      logger.info(`  - ${addr.name}: ${addr.collateralAddress}`);
    });
  }

  return matchingAddress;
}

/**
 * Main function to start inactive nodes
 */
async function startInactiveNodes() {
  // Validate command line arguments
  if (process.argv.length < 3) {
    console.error('Usage: node start-inactive-nodes.js <collateral-address>');
    console.error('');
    console.error('Available addresses in .env:');
    (config.addresses || []).forEach(addr => {
      console.error(`  - ${addr.collateralAddress} (${addr.name})`);
    });
    process.exit(1);
  }

  const collateralAddress = process.argv[2];

  logger.info('='.repeat(80));
  logger.info('Starting Inactive FluxNode Script');
  logger.info('='.repeat(80));
  logger.info(`Target Address: ${collateralAddress}`);
  logger.info(`Explorer API: ${EXPLORER_API_URL}`);
  logger.info(`Flux API: ${FLUX_API_URL}`);
  logger.info('='.repeat(80));

  try {
    // Step 1: Find address configuration
    const addressConfig = findAddressConfig(collateralAddress);
    if (!addressConfig) {
      logger.error('Address not found in .env configuration. Please add it first.');
      logger.error('Required .env variables:');
      logger.error('  ADDRESS_N_NAME');
      logger.error('  ADDRESS_N_COLLATERAL_ADDRESS');
      logger.error('  ADDRESS_N_FLUXNODE_PRIVATE_KEY');
      logger.error('  ADDRESS_N_P2SH_PRIVATE_KEY');
      logger.error('  ADDRESS_N_REDEEM_SCRIPT');
      process.exit(1);
    }

    logger.info(`✓ Found address config: ${addressConfig.name}`);

    // Step 2: Fetch collateral UTXOs from explorer
    const collateralUtxos = await fetchCollateralUtxos(collateralAddress);

    if (collateralUtxos.length === 0) {
      logger.info('No FluxNode collateral UTXOs found for this address.');
      logger.info('Please ensure you have collateral (12500 or 40000 FLUX) at this address.');
      process.exit(0);
    }

    // Step 3: Fetch confirmed nodes from network
    const confirmedNodes = await fetchAllFluxNodes();

    logger.info('');
    logger.info('Matching collaterals against confirmed node list...');
    logger.debug(`Collateral address to match: ${collateralAddress}`);

    // Step 4: Process each collateral and check if it needs to be started
    const results = {
      total: collateralUtxos.length,
      alreadyConfirmed: 0,
      notInList: 0,
      started: 0,
      failed: 0,
      errors: []
    };

    for (const utxo of collateralUtxos) {
      const txid = utxo.txid;
      const index = utxo.vout;
      const amount = parseFloat(utxo.amount);
      const identifier = `${txid}:${index}`;

      logger.info('');
      logger.info('-'.repeat(80));
      logger.info(`Processing collateral: ${identifier}`);
      logger.info(`  Amount: ${amount} FLUX`);
      logger.info(`  Type: ${amount === 1000 ? 'Cumulus' : amount === 12500 ? 'Nimbus' : 'Stratus'}`);

      // Check if this collateral is in the confirmed node list
      logger.debug(`Looking for ${txid}:${index} in confirmed list...`);
      const confirmedNode = findNodeInConfirmedList(confirmedNodes, txid, index);

      if (confirmedNode) {
        logger.debug(`Match found: ${confirmedNode.txhash}:${confirmedNode.outidx}`);

        // Node is in the confirmed list - skip it
        const nodeIp = confirmedNode.ip || 'N/A';
        const nodeTier = confirmedNode.tier || 'UNKNOWN';
        const paymentAddress = confirmedNode.payment_address || 'N/A';
        const confirmedHeight = confirmedNode.confirmed_height || 'N/A';

        logger.info(`  ✓ Found in confirmed list - already active`);
        logger.info(`  IP: ${nodeIp}`);
        logger.info(`  Tier: ${nodeTier}`);
        logger.info(`  Payment Address: ${paymentAddress}`);
        logger.info(`  Confirmed Height: ${confirmedHeight}`);
        logger.info(`  → Skipping (already confirmed)`);
        results.alreadyConfirmed++;
        continue;
      }

      // Collateral exists but node is NOT in the confirmed list - needs to be started
      logger.debug(`No match found for ${txid}:${index}`);
      logger.info(`  Not found in confirmed list`);
      logger.info(`  → Attempting to start node...`);
      results.notInList++;

      // Attempt to start the node
      try {
        const result = await fluxnodeService.processStartRequest(
          txid,
          index,
          collateralAddress, // Use collateral address as IP placeholder
          addressConfig.name
        );

        // Check if the result indicates success or error
        if (result.status === 'error') {
          logger.error(`  ✗ Failed to start node: ${result.error || JSON.stringify(result)}`);
          results.failed++;
          results.errors.push({ identifier, error: result.error || 'Unknown error' });
        } else {
          logger.info(`  ✓ Successfully started node`);
          logger.info(`  Response: ${JSON.stringify(result)}`);
          results.started++;
        }

      } catch (error) {
        logger.error(`  ✗ Error starting node: ${error.message}`);
        results.failed++;
        results.errors.push({ identifier, error: error.message });
      }

      // Add delay between starts to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Print summary
    logger.info('');
    logger.info('='.repeat(80));
    logger.info('SUMMARY');
    logger.info('='.repeat(80));
    logger.info(`Total collaterals found: ${results.total}`);
    logger.info(`Already confirmed (skipped): ${results.alreadyConfirmed}`);
    logger.info(`Not in confirmed list: ${results.notInList}`);
    logger.info(`Successfully started: ${results.started}`);
    logger.info(`Failed to start: ${results.failed}`);

    if (results.errors.length > 0) {
      logger.info('');
      logger.info('Errors:');
      results.errors.forEach(({ identifier, error }) => {
        logger.error(`  ${identifier}: ${error}`);
      });
    }

    logger.info('='.repeat(80));

    process.exit(results.failed > 0 ? 1 : 0);

  } catch (error) {
    logger.error('Fatal error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
startInactiveNodes().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
