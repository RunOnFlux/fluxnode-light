/*
 * Obtained from https://github.com/TheTrunk/bitcoinjs-lib/blob/master/src/crypto.js
 * 2017/07/25: No ripemd160 in SJCL, so resorted to this
 */

const createHash = require('create-hash');
const groestlhash = require('groestl-hash-js');

function ripemd160(buffer) {
  try {
    return createHash('ripemd160')
      .update(buffer)
      .digest('hex');
  } catch (err) {
    return createHash('rmd160')
      .update(buffer)
      .digest('hex');
  }
}

function sha1(buffer) {
  return createHash('sha1').update(buffer).digest('hex');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256x2(buffer) {
  return sha256(Buffer.from(sha256(buffer), 'hex'));
}

function hash160(buffer) {
  const sha = sha256(buffer);
  return ripemd160(Buffer.from(sha, 'hex'));
}

function groestl(buffer) {
  return Buffer.from(groestlhash.groestl_2(buffer, 1, 1), 'hex');
}

module.exports = {
  hash160,
  ripemd160,
  sha1,
  sha256,
  sha256x2,
  groestl,
};
