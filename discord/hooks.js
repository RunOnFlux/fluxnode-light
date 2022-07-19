const { Webhook } = require('discord-webhook-node');
const dotenv = require('dotenv');
const config = require('config');
const log = require('../src/lib/log');

dotenv.config();

const hook = new Webhook(`${process.env.WEB_HOOK || config.discordHook}`);

const IMAGE_URL = 'https://homepages.cae.wisc.edu/~ece533/images/airplane.png';
hook.setUsername('Discord Webhook Balance Bot Test');
hook.setAvatar(IMAGE_URL);

async function sendHook(coin, label, address, balance, alertamount, explorer) {
  hook.send('@everyone');
  const title = `${label} address ***${address}*** is below the alert balance.
          \nDeposit ${coin} ASAP
          \n`;
  const value = `${balance} < ${alertamount}\n${explorer}${address}`;

  log.info(`**${coin} Balance Warning** ${title} ${value}`);
  hook.warning(`**${coin} Balance Warning**`, title, value);
}

function checkHook(item, explorer, history) {
  if (item.ALERT) {
    if (item.balance < item.ALERT) {
      const secondsSinceEpoch = Math.round(Date.now() / 1000);
      if (item.address in history) {
        if (history[item.address] + 3600 > secondsSinceEpoch) {
          log.info(`Skipping discord hook, sent for ${item.address} in the last hour`);
          return;
        }
      }
      sendHook(item.coin, item.label, item.address, item.balance, item.ALERT, explorer);
      // eslint-disable-next-line no-param-reassign
      history[item.address] = secondsSinceEpoch;
    }
  }
}

function testHook() {
  hook.send('Test Message, TEST AGAIN');
}

module.exports = { checkHook, testHook };
