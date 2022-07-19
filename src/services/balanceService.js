const config = require('config');
const axios = require('axios');
const dotenv = require('dotenv');

const log = require('../lib/log');
const hooks = require('../../discord/hooks');

dotenv.config();
const { explorers, addresses, fetchDelay } = config;

const balances = {};
const history = {};

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildApiCall(coin, address) {
  if (coin === 'FLUX') {
    return `https://explorer.runonflux.io/api/addr/${address}`;
  } if (coin === 'SOL') {
    return `https://public-api.solscan.io/account/${address}`;
  } if (coin === 'BSC') {
    return `https://api.bscscan.com/api?module=account&action=balance&address=${address}&apikey=${config.bscApiKey || process.env.BSC_API_KEY}`;
  } if (coin === 'ETH') {
    return `https://api.etherscan.io/api?module=account&action=balance&address=${address}&tag=latest&apikey=${config.ethApiKey || process.env.ETH_API_KEY}`;
  } if (coin === 'TRON') {
    return `https://apilist.tronscan.org/api/account?address=${address}`;
  }
  throw new Error('Invalid coin specified');
}

function parseResponse(item, response) {
  let balance = 0;
  // console.log(response);
  if (item.coin === 'FLUX') {
    balance = response.balance;
  } else if (item.coin === 'SOL') {
    balance = Number(response.lamports) * 10e-10;
  } else if (item.coin === 'BSC') {
    balance = Number(response.result) * 10e-19;
  } else if (item.coin === 'ETH') {
    balance = Number(response.result) * 10e-19;
  } else if (item.coin === 'TRON') {
    balance = Number(response.balance) * 10e-7;
  }
  return balance;
}

async function fetchBalances() {
  try {
    const newBalances = [];
    log.info('Refreshing balances');
    // eslint-disable-next-line no-restricted-syntax
    for (const item of addresses) {
      try {
        const apiUrl = buildApiCall(item.coin, item.address);
        // eslint-disable-next-line no-await-in-loop
        const response = await axios.get(apiUrl);
        const result = parseResponse(item, response.data);
        log.info(`${item.coin}, ${item.address}: ${result}`);
        item.balance = result;
        newBalances.push(item);
        // eslint-disable-next-line no-await-in-loop
        await delay(fetchDelay);
      } catch (error) {
        log.error(error);
      }
    }

    // eslint-disable-next-line no-return-assign
    newBalances.forEach((item) => {
      balances[item.address] = item;
    });
  } catch (error) {
    log.error(error);
  }
}

function checkHooks() {
  addresses.forEach((item) => {
    const balanceExists = item.address in balances;
    if (balanceExists) {
      hooks.checkHook(balances[item.address], explorers[item.coin], history);
    } else {
      const adjustedItem = item;
      adjustedItem.balance = -1;
      hooks.checkHook(balances[item.address], explorers[item.coin], history);
    }
  });
}

function getData(req, res) {
  try {
    const response = { data: { balances, explorers } };
    res.json(response);
  } catch (error) {
    log.error(error);
    res.status(500).json({ error: JSON.stringify(error) });
  }
}

function getTest(req, res) {
  try {
    const response = { msg: 'backend works asfds asdfasdfafsd' };
    res.json(response);
  } catch (error) {
    log.error(error);
    res.status(500).json({ error: JSON.stringify(error) });
  }
}

module.exports = {
  checkHooks,
  fetchBalances,
  getData,
  getTest,
};
