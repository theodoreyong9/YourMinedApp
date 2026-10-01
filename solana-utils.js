// solana-utils.js — Ed25519 signature check of a wallet's submission.
// The score is no longer read from a Solana program: see aiwa-utils.js (derived from the author's own Aiwa events).
const { PublicKey } = require('@solana/web3.js');
const nacl = require('tweetnacl');

// Vérifie la signature ed25519
function verifySignature(message, signatureB64, walletPubkey) {
  try {
    const msgBytes  = Buffer.from(message, 'utf8');
    const sigBytes  = Buffer.from(signatureB64, 'base64');
    const pubkeyBytes = new PublicKey(walletPubkey).toBytes();
    return nacl.sign.detached.verify(msgBytes, sigBytes, pubkeyBytes);
  } catch (e) {
    console.error('Signature verify error:', e.message);
    return false;
  }
}

module.exports = { verifySignature };
