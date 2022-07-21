const { Webhook, MessageBuilder } = require('discord-webhook-node');
const dotenv = require('dotenv');
const config = require('config');

dotenv.config();

const hook = new Webhook(`${process.env.WEB_HOOK || config.discordHook}`);

async function sendHook(txid, index, success, status) {
  let color = '#2ECC71'; // Green

  if (!success) {
    color = '#E74C3C'; // Red
  }
  const embed = new MessageBuilder()
    .setTitle('API Called')
    .setURL('')
    .addField('Txid', `${txid}`, true)
    .addField('Index', `${index}`, true)
    .addField('Message', `${JSON.stringify(status)}`)
    .setColor(color)
    .setTimestamp();

  hook.send(embed);
}

module.exports = { sendHook };
