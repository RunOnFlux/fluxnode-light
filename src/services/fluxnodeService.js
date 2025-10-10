// eslint-disable-next-line import/no-import-module-exports
const { fluxnode } = require('@runonflux/flux-sdk');

const config = require('config');
const axios = require('axios');
const dotenv = require('dotenv');

const log = require('../lib/log');
const discord = require('../../discord/hooks');

dotenv.config();

const { addresses } = config;

// Helper function to get address config by name
function getAddressConfig(addressName) {
  if (!addresses || addresses.length === 0) {
    throw new Error('No addresses configured. Please configure at least one address in config/default.js');
  }

  // If no addressName specified, use the first one
  if (!addressName) {
    return addresses[0];
  }

  // Find by name
  const addressConfig = addresses.find((addr) => addr.name === addressName);
  if (!addressConfig) {
    throw new Error(`Address configuration not found for name: ${addressName}`);
  }

  return addressConfig;
}

// Helper function to list all available addresses
function listAddresses() {
  if (!addresses || addresses.length === 0) {
    throw new Error('No addresses configured. Please configure at least one address in config/default.js');
  }

  return addresses.map((addr) => ({
    name: addr.name,
    collateralAddress: addr.collateralAddress,
  }));
}

function buildApiCall(collateralHash) {
  return `https://explorer.runonflux.io/api/tx/${collateralHash}`;
}

async function sendTx(tx, res, collateralHash, index, ipAddress, addressName) {
  try {
    const apiUrl = `https://api.runonflux.io/daemon/sendrawtransaction/${tx}`;
    const response = await axios.get(apiUrl);
    const hookData = {
      ...response.data,
      addressName: addressName || 'default',
    };
    discord.sendHook(collateralHash, index, response.data.status !== 'error', hookData, ipAddress);
    res.json(response.data);
  } catch (error) {
    // Log the actual error message and API response if available
    const errorMessage = error.response?.data?.error || error.response?.data || error.message;
    log.error(`Failed to send transaction: ${JSON.stringify(errorMessage)}`);

    const errorData = {
      status: 'error',
      error: errorMessage,
      addressName: addressName || 'default',
    };
    discord.sendHook(collateralHash, index, false, errorData, ipAddress);
    res.json(errorData);
  }
}

// eslint-disable-next-line no-unused-vars
async function fetchCollateralAddress(collateralHash, index) {
  try {
    log.info(`Fetching Address for collateral ${collateralHash}:${index}`);

    const apiUrl = buildApiCall(collateralHash);
    const response = await axios.get(apiUrl);

    const json = response.data;

    let address;
    let type;
    let amount;
    if (json.txid === collateralHash) {
      if (json.vout.length >= index) {
        const output = json.vout[index];
        const addressIndex = 0;
        address = output.scriptPubKey.addresses[addressIndex];
        type = output.scriptPubKey.type;
        amount = output.value;
        log.info(`${address} ${type} ${amount}`);
      } else {
        log.info(`Fetching address: index given wasn't within the length of the vout list. Given = ${index}. List length = ${json.vout.length}`);
      }
    } else {
      log.info(`Fetching address: txid didn't match ${collateralHash} != ${response.data.txid}`);
    }

    if (type !== 'scripthash') {
      log.info(`Fetching address: Address type wasn't scripthash. Given = ${type}`);
      address = undefined;
    }

    if (amount !== '40000.00000000' && amount !== '12500.00000000') {
      log.info(`Fetching address: Amount wasn't correct. Given = ${amount}`);
      address = undefined;
    }

    return address;
  } catch (error) {
    log.error(error);
    return undefined;
  }
}

// eslint-disable-next-line no-unused-vars
function validateCollateral(collateralHash, index, req, res, addressName) {
  fetchCollateralAddress(collateralHash, index).then((address) => {
    const ipAddress = req.socket.remoteAddress;
    if (address === undefined) {
      log.info('Validating collateral: address in undefined');
      const response = { msg: 'Failed validating collateral. Address undefined' };
      discord.sendHook(collateralHash, index, false, response.msg, ipAddress);
      res.json(response);
      return;
    }

    // Get the address configuration
    let addressConfig;
    try {
      // If addressName is provided, use specific address
      if (addressName) {
        addressConfig = getAddressConfig(addressName);
        log.info(`Using specified address config: ${addressConfig.name} - ${addressConfig.collateralAddress}`);
      } else {
        // Legacy mode: loop through all addresses to find a match
        const allAddresses = listAddresses();
        log.info(`Legacy mode: searching through ${allAddresses.length} addresses for match with ${address}`);

        for (const addr of allAddresses) {
          const config = getAddressConfig(addr.name);
          if (config.collateralAddress === address) {
            addressConfig = config;
            log.info(`Found matching address config: ${addressConfig.name} - ${addressConfig.collateralAddress}`);
            break;
          }
        }

        if (!addressConfig) {
          log.info(`No matching address configuration found for ${address}`);
          const response = { msg: 'Failed validating collateral. No matching address configuration found' };
          discord.sendHook(collateralHash, index, false, response.msg, ipAddress);
          res.json(response);
          return;
        }
      }
    } catch (error) {
      log.error(`Error getting address config: ${error.message}`);
      const response = { msg: `Failed to get address configuration: ${error.message}` };
      discord.sendHook(collateralHash, index, false, response.msg, ipAddress);
      res.json(response);
      return;
    }

    if (address === addressConfig.collateralAddress) {
      log.info(`Validating collateral: address matches for collateral ${collateralHash}:${index}`);
      const timestamp = Math.round(new Date().getTime() / 1000).toString();
      const tx = fluxnode.startFluxNodev6(
        collateralHash.toString(),
        index.toString(),
        addressConfig.p2shprivkey,
        addressConfig.fluxnodePrivateKey,
        timestamp,
        true,
        false,
        addressConfig.redeemScript,
      );
      sendTx(tx, res, collateralHash, index, ipAddress, addressConfig.name);
      return;
    }

    log.info('Failed to validate collateral');
    const response = { msg: 'Failed validating collateral. Address not expected value' };
    res.json(response);
  });
}

// eslint-disable-next-line no-unused-vars
function processCall(collateralHash, index, req, res, addressName) {
  log.info(`Processing call for hash ${collateralHash}:${index} with address: ${addressName || 'default'}`);
  validateCollateral(collateralHash, index, req, res, addressName);
}

function getStart(txid, index, req, res, addressName) {
  try {
    processCall(txid, index, req, res, addressName);
  } catch (error) {
    log.error(error);
    res.status(500).json({ error: JSON.stringify(error) });
  }
}

function getAddresses(req, res) {
  try {
    const addressList = listAddresses();
    res.json({
      success: true,
      addresses: addressList,
    });
  } catch (error) {
    log.error(error);
    res.status(500).json({ error: JSON.stringify(error) });
  }
}

function getTest(req, res) {
  try {
    const response = { msg: 'backend works' };
    res.json(response);
  } catch (error) {
    log.error(error);
    res.status(500).json({ error: JSON.stringify(error) });
  }
}

module.exports = {
  validateCollateral,
  getTest,
  getStart,
  getAddresses,
};
