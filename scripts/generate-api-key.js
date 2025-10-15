#!/usr/bin/env node

const crypto = require('crypto');

function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

console.log(generateApiKey());