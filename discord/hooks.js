const { Webhook, MessageBuilder } = require('discord-webhook-node');
const config = require('../config/env-config');
const log = require('../src/lib/logger');

const webhookUrl = config.discord.webhookUrl;
const hook = webhookUrl ? new Webhook(webhookUrl) : null;

async function sendHook(txid, index, success, status, ipAddress) {
  if (!hook) return;

  try {
    let color = '#2ECC71'; // Green

    if (!success) {
      color = '#E74C3C'; // Red
    }

    // Extract addressName if it exists in the status object
    let addressName = 'default';
    let statusMessage = status;

    if (typeof status === 'object' && status !== null) {
      if (status.addressName) {
        addressName = status.addressName;
        const { addressName: _, ...restStatus } = status;
        statusMessage = restStatus;
      }
    }

    // Convert status to string safely
    let messageText;
    if (typeof statusMessage === 'string') {
      messageText = statusMessage;
    } else if (typeof statusMessage === 'object' && statusMessage !== null) {
      messageText = JSON.stringify(statusMessage, null, 2);
    } else {
      messageText = String(statusMessage);
    }

    // Truncate message if too long (Discord has field limits)
    if (messageText.length > 1024) {
      log.warn(`Discord message truncated for ${txid}:${index} (${messageText.length} chars)`);
      messageText = messageText.substring(0, 1021) + '...';
    }

    const embed = new MessageBuilder()
      .setTitle('API Called')
      .setURL('')
      .addField('Txid', `${txid}`, true)
      .addField('Index', `${index}`, true)
      .addField('Address', `${addressName}`, true)
      .addField('Message', messageText)
      .addField('From IP', `${ipAddress}`)
      .setColor(color)
      .setTimestamp();

    await hook.send(embed);
  } catch (error) {
    log.error(`Discord webhook failed for ${txid}:${index}: ${error.message}`);
  }
}

module.exports = { sendHook };
