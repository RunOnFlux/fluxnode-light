const log = require('../lib/log');

// Validate transaction ID (should be 64 character hex string)
function validateTxid(txid) {
  const txidRegex = /^[a-fA-F0-9]{64}$/;
  return txidRegex.test(txid);
}

// Validate index (should be a non-negative integer)
function validateIndex(index) {
  const num = parseInt(index, 10);
  return !isNaN(num) && num >= 0 && num <= 9999 && num.toString() === index;
}

// Validate address name (alphanumeric with spaces, underscores, dashes)
function validateAddressName(name) {
  if (!name) return true; // Optional parameter
  const nameRegex = /^[a-zA-Z0-9\s_-]{1,50}$/;
  return nameRegex.test(name);
}

// Middleware to validate transaction parameters
function validateTransactionParams(req, res, next) {
  const { txid, index, addressName } = req.params;

  // Validate txid
  if (!validateTxid(txid)) {
    log.warn(`Invalid txid received: ${txid}`);
    return res.status(400).json({
      status: 'error',
      error: 'Invalid transaction ID format. Must be 64 character hex string.',
    });
  }

  // Validate index
  if (!validateIndex(index)) {
    log.warn(`Invalid index received: ${index}`);
    return res.status(400).json({
      status: 'error',
      error: 'Invalid index. Must be a non-negative integer.',
    });
  }

  // Validate addressName if provided
  if (addressName && !validateAddressName(addressName)) {
    log.warn(`Invalid addressName received: ${addressName}`);
    return res.status(400).json({
      status: 'error',
      error: 'Invalid address name format.',
    });
  }

  next();
}

// Sanitize user input to prevent injection attacks
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  // Remove any control characters and limit length
  return input.replace(/[^\x20-\x7E]/g, '').substring(0, 100);
}

module.exports = {
  validateTransactionParams,
  validateTxid,
  validateIndex,
  validateAddressName,
  sanitizeInput,
};