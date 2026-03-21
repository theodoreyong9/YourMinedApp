// solana-utils.js — Signature verification + score on-chain
// Score = YRM claimable (lu depuis le compte on-chain)
const { Connection, PublicKey } = require('@solana/web3.js');
const { Buffer } = require('buffer');
const nacl = require('tweetnacl');

const RPC_URL = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const YRM_DECIMALS = 1e18;
const PROGRAM_ID = new PublicKey('YRMine11111111111111111111111111111111111111');

// Vérifie la signature ed25519 Solana
function verifySignature(message, signatureB64, walletPubkey) {
  try {
    const msgBytes = Buffer.from(message, 'utf8');
    const sigBytes = Buffer.from(signatureB64, 'base64');
    const pubkeyBytes = new PublicKey(walletPubkey).toBytes();
    return nacl.sign.detached.verify(msgBytes, sigBytes, pubkeyBytes);
  } catch (e) {
    console.error('Signature verify error:', e.message);
    return false;
  }
}

// Lit le score on-chain = YRM claimable
// Formule : lastBurnAmount / lastLaps < claimable / currentLaps
async function checkScoreEligibility(walletPubkey) {
  const conn = new Connection(RPC_URL, 'confirmed');

  // Dérive le PDA userAccount
  const [userAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_account'), new PublicKey(walletPubkey).toBytes()],
    PROGRAM_ID
  );

  const info = await conn.getAccountInfo(userAccountPDA);
  if (!info) return { eligible: false, reason: 'No on-chain account found', score: 0 };

  const data = info.data;
  const view = new DataView(data.buffer, data.byteOffset);
  
  // Layout userAccount (offset 8 = discriminator)
  let o = 8;
  // pubkey (32) 
  o += 32;
  // lastBurnAmount (u64)
  const lastBurnAmount = Number(view.getBigUint64(o, true)) / YRM_DECIMALS;
  o += 8;
  // lastActionSlot (u64)
  const lastActionSlot = Number(view.getBigUint64(o, true));
  o += 8;

  const currentSlot = await conn.getSlot();
  const currentLaps = Math.max(1, currentSlot - lastActionSlot);
  const lastLaps = Math.max(1, lastActionSlot);

  // Calcul claimable simplifié (même formule que mine.js)
  const alpha = 1.2, beta = 0.8, gamma = 0.5, C = 1000;
  const globalInfo = await conn.getAccountInfo(
    PublicKey.findProgramAddressSync([Buffer.from('global_state')], PROGRAM_ID)[0]
  );
  const protocolAge = globalInfo
    ? Number(new DataView(globalInfo.data.buffer, globalInfo.data.byteOffset).getBigUint64(8, true))
    : 1000;
  
  const patience = 0.2; // taxRate par défaut
  const numerator = lastBurnAmount * Math.pow(currentLaps, alpha);
  const denominator = Math.pow(Math.log(Math.pow(protocolAge, beta * (1 - patience)) + C), gamma);
  const claimable = denominator > 0 ? numerator / denominator : 0;

  // Permission : lastBurnAmount/lastLaps < claimable/currentLaps
  const lastRatio = lastBurnAmount / lastLaps;
  const curRatio = claimable / currentLaps;
  const eligible = claimable > 0 && curRatio >= lastRatio;

  return {
    eligible,
    reason: eligible ? 'Score eligible' : 'Claimable ratio too low',
    score: claimable,
    lastBurnAmount,
    lastActionSlot,
    currentSlot,
    curRatio,
    lastRatio
  };
}

module.exports = { verifySignature, checkScoreEligibility };
