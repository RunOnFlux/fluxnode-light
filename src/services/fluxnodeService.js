// eslint-disable-next-line import/no-import-module-exports
const fluxnode = require('@runonflux/flux-sdk');

const config = require('config');
const axios = require('axios');
const dotenv = require('dotenv');

const log = require('../lib/log');
const discord = require('../../discord/hooks');

dotenv.config();

const {
  collateralAddress, p2shprivkey, fluxnodePrivateKey, redeemScript
} = config;

function buildApiCall(collateralHash) {
  return `https://explorer.runonflux.io/api/tx/${collateralHash}`;
}

async function sendTx(tx, res, collateralHash, index, ipAddress) {
  try {
    const apiUrl = `https://api.runonflux.io/daemon/sendrawtransaction/${tx}`;
    const response = await axios.get(apiUrl);
    discord.sendHook(collateralHash, index, response.data.status !== 'error', response.data, ipAddress);
    res.json(response.data);
  } catch (error) {
    log.error(error);
    discord.sendHook(collateralHash, index, false, error, ipAddress);
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
function validateCollateral(collateralHash, index, req, res) {
  fetchCollateralAddress(collateralHash, index).then((address) => {
    let ipAddress = req.socket.remoteAddress;
    if (address === undefined) {
      log.info('Validating collateral: address in undefined');
      const response = { msg: 'Failed validating collateral. Address undefined' };
      discord.sendHook(collateralHash, index, false, response.msg, ipAddress);
      res.json(response);
      return;
    }

    if (address === collateralAddress) {
      log.info(`Validating collateral: address matches for collateral ${collateralHash}:${index}`);
      const timestamp = Math.round(new Date().getTime() / 1000).toString();
      const tx = fluxnode.startFluxNodev6(
        collateralHash.toString(),
        index.toString(),
        p2shprivkey,
        fluxnodePrivateKey,
        timestamp,
        true,
        true,
        redeemScript,
      );
      sendTx(tx, res, collateralHash, index, ipAddress);
      return;
    }

    log.info('Failed to validate collateral');
    const response = { msg: 'Failed validating collateral. Address not expected value' };
    res.json(response);
  });
}

// eslint-disable-next-line no-unused-vars
function processCall(collateralHash, index, req, res) {
  log.info(`Processing call for hash ${collateralHash}:${index}`);
  validateCollateral(collateralHash, index, req, res);
}

function getStart(txid, index, req, res) {
  try {
    processCall(txid, index, req, res);
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
};
