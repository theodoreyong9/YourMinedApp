// solana-utils.js — Signature verification + score on-chain
// Doit utiliser exactement la même formule que mine.js calcClaimable()
const { Connection, PublicKey } = require('@solana/web3.js');
const nacl = require('tweetnacl');

// FIX: RPC public devnet par défaut, pas besoin de secret
const RPC_URL = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';

// FIX: bon PROGRAM_ID (celui de mine.js)
const PROGRAM_ID = new PublicKey('6ue88JtUXzKN5yrFkauU85EHpg4aSsM9QfarvHBQS7TZ');

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

// Lit le compte on-chain et calcule le score
// lastPubScore / lastPubLaps = ratio de la dernière pub de ce wallet (0/1 si première pub)
async function checkScoreEligibility(walletPubkey, lastPubScore = 0, lastPubLaps = 1) {
  const conn = new Connection(RPC_URL, 'confirmed');

  // Dérive le PDA userAccount
  const [userAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_account'), new PublicKey(walletPubkey).toBytes()],
    PROGRAM_ID
  );

  const info = await conn.getAccountInfo(userAccountPDA);
  if (!info) return { eligible: false, reason: 'No on-chain account found', score: 0, currentSlot: 0, lastActionSlot: 0 };

  const data = info.data;
  const view = new DataView(data.buffer, data.byteOffset);

  // FIX: layout exact de mine.js refreshBalances()
  // offset 0-7  : discriminator (8 bytes)
  // offset 8-39 : user pubkey (32 bytes)
  // offset 40   : taxRate (u8)
  // offset 41-48: lastActionSlot (u64 LE)
  // offset 49-56: totalBurned (u64 LE)
  // offset 57-64: lastBurnAmount (u64 LE, lamports)
  let o = 40;
  const taxRate       = view.getUint8(o);              o += 1;
  const lastActionSlot= Number(view.getBigUint64(o, true)); o += 8;
  /* totalBurned */                                     o += 8;
  const lastBurnLamports = Number(view.getBigUint64(o, true));

  const currentSlot = await conn.getSlot();

  // FIX: même formule exacte que mine.js calcClaimable()
  if (!lastBurnLamports || !lastActionSlot || currentSlot <= lastActionSlot || currentSlot - lastActionSlot < 30) {
    return { eligible: false, reason: 'Nothing claimable yet', score: 0, currentSlot, lastActionSlot };
  }

  const S   = lastBurnLamports / 1e9;                       // lamports → SOL
  const tau = Math.min(taxRate, 40) / 100;
  const dSlot = Math.max(1, currentSlot - lastActionSlot);
  const dGen  = Math.max(1, currentSlot - 111111111);
  const num   = Math.pow(dSlot, 1.1) * S;
  const inner = Math.pow(dGen, 2.2 * (1 - tau)) + Math.pow(33, 3);
  if (inner <= 1) return { eligible: false, reason: 'Formula inner ≤ 1', score: 0, currentSlot, lastActionSlot };
  const den = Math.pow(Math.log(inner), 3);
  if (den <= 0 || !isFinite(den) || !isFinite(num)) {
    return { eligible: false, reason: 'Formula error', score: 0, currentSlot, lastActionSlot };
  }
  const claimable = num / den;
  if (claimable <= 0 || !isFinite(claimable) || claimable > 1e12) {
    return { eligible: false, reason: 'Claimable out of range', score: 0, currentSlot, lastActionSlot };
  }

  const currentLaps = Math.max(1, dSlot);

  // FIX: formule d'éligibilité correcte
  // "score dernière pub / dernier laps < score actuel / laps actuels"
  // première pub : eligible si claimable > 0
  const lastRatio = lastPubScore / Math.max(1, lastPubLaps);
  const curRatio  = claimable / currentLaps;
  const eligible  = claimable > 0 && (lastPubScore === 0 || curRatio >= lastRatio);

  return {
    eligible,
    reason: eligible ? 'Score eligible' : `Claimable ratio too low (${curRatio.toFixed(6)} < ${lastRatio.toFixed(6)})`,
    score: claimable,
    lastBurnLamports,
    lastActionSlot,
    currentSlot,
    currentLaps,
    curRatio,
    lastRatio
  };
}

module.exports = { verifySignature, checkScoreEligibility };
