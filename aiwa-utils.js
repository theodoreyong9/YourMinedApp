// aiwa-utils.js — the score of a submission, derived from the author's own Aiwa events.
//
// YourMine used to read two or three numbers from the author's account in a Solana program (last burn, last action slot,
// tax). Time is now Aiwa's: epochs of proven sequential work, and the mining state is derived from the events the wallet
// signed — never taken on the page's word:
//   - each event's envelope is verified (id, author, signature); a tampered event is set aside;
//   - the progression proofs are checked (a few milliseconds each, whatever the work they attest to);
//   - the burns are confirmed by THIS validator against Solana (fetchBurnRecord), not read from the events;
//   - what the validator derived for this wallet last time (aiwa-state.json on main) is the baseline: only the events
//     after it are folded, and they must chain from it.
// The figure that comes out — { score, laps } — is what the ranking freezes, as before.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Connection, PublicKey } = require('@solana/web3.js');

const RPC_URL = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const STATE_FILE = 'aiwa-state.json';
const MAX_EVENTS = 200000;     // a single submission's evidence
const MAX_BURNS = 200;         // burn records one submission may ask this validator to confirm

// The deployment's parameters — the same as the wallet's (src/mine.js): the formula YourMine's Proof of Will already
// states (alpha, beta, gamma, C, minQ) and the work of one epoch.
const AIWA_PARAMS = { alpha: 1.1, beta: 2.2, gamma: 3, C: Math.pow(33, 3), minQ: 1, epochIterations: 100000 };

let corePromise = null;
const core = () => (corePromise ??= import('aiwa-core'));

/** The Aiwa domain of a Solana wallet: the hash of the key (a wallet and its domain are the same key). */
function domainOfWallet(walletPubkey) {
  return crypto.createHash('sha256').update(Buffer.from(new PublicKey(walletPubkey).toBytes())).digest('hex');
}

function readBaselines(dir = '.') {
  try { return JSON.parse(fs.readFileSync(path.join(dir, STATE_FILE), 'utf8')) || {}; } catch { return {}; }
}

function readEvidence(prContentDir, nonce) {
  if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(nonce)) return null;
  const file = path.join(prContentDir, 'aiwa', nonce + '.json');
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * @param {object} args
 * @param {string} args.walletPubkey the base58 wallet that signed the YourMine event
 * @param {number} [args.lastPubScore] and @param {number} [args.lastPubLaps] — the wallet's last publication, if any
 * @param {object} args.evidence { version, wallet, domain, afterEpoch, events } as src/build.js pushes it
 * @param {object} [args.baselines] what this validator derived before (aiwa-state.json)
 * @param {{ getTransaction: Function }} [args.connection] Solana, to confirm the burns (a stub in tests)
 * @param {object} [args.params] the deployment's parameters (the default is the one the wallet runs: tests pass a small epochIterations)
 * @returns {Promise<{ eligible: boolean, reason: string, score: number, currentLaps: number, mining: object | null, baseline: object | null }>}
 */
async function checkScoreEligibilityAiwa({ walletPubkey, lastPubScore = 0, lastPubLaps = 1, evidence, baselines = {}, connection, params = AIWA_PARAMS }) {
  const none = (reason) => ({ eligible: false, reason, score: 0, currentLaps: 1, mining: null, baseline: null });
  if (!evidence || typeof evidence !== 'object' || !Array.isArray(evidence.events)) return none('No Aiwa evidence with this submission');
  const domain = domainOfWallet(walletPubkey);
  if (evidence.wallet !== walletPubkey || evidence.domain !== domain) return none('The Aiwa evidence is not for this wallet');
  if (evidence.events.length > MAX_EVENTS) return none('Too many events in the Aiwa evidence');

  const { assessMining, fetchBurnRecord, serializeWalletState, deserializeWalletState } = await core();

  // The validator's own earlier derivation is the base — but only if the evidence continues exactly from it.
  const known = baselines[walletPubkey];
  const after = Number.isInteger(evidence.afterEpoch) ? evidence.afterEpoch : 0;
  let baseline;
  if (after > 0) {
    if (!known || known.epoch !== after) return none(`The evidence continues from epoch ${after}; this validator holds epoch ${known ? known.epoch : 'none'} for this wallet`);
    baseline = deserializeWalletState(known.state);
  }

  // Burns: asked of Solana by this validator, for the signatures the domain's own burn-record events point at.
  const burnRecords = {};
  const wanted = [...new Set(evidence.events
    .filter((e) => e && e.type === 'burn-record' && e.author === domain && typeof e.payload?.signature === 'string')
    .map((e) => e.payload.signature))];
  if (wanted.length > MAX_BURNS) return none('Too many burns to confirm in one submission');
  const rpc = connection ?? new Connection(RPC_URL, 'confirmed');
  for (const signature of wanted) {
    const record = await fetchBurnRecord(rpc, signature).catch(() => null);
    if (record) burnRecords[signature] = record;
  }

  const result = await assessMining({ rewardParams: params, events: evidence.events, burnRecords, domain, baseline });
  const mining = result.mining;
  if (!mining) return { ...none('No position: the burn is not confirmed, or nothing was committed'), rejections: result.rejections };

  const score = Number(mining.claimable);
  const currentLaps = Math.max(1, mining.sinceLastAction);
  if (!(score > 0) || !Number.isFinite(score)) return { ...none('Nothing claimable yet'), mining };

  // as before: the ratio score / laps must not fall below the wallet's last publication's
  const lastRatio = lastPubScore / Math.max(1, lastPubLaps);
  const curRatio = score / currentLaps;
  const eligible = lastPubScore === 0 || curRatio >= lastRatio;
  return {
    eligible,
    reason: eligible ? 'Score eligible' : `Claimable ratio too low (${curRatio.toFixed(6)} < ${lastRatio.toFixed(6)})`,
    score, currentLaps, curRatio, lastRatio, mining,
    // what the registry keeps for the next submission of this wallet
    baseline: { domain, epoch: mining.epoch, state: serializeWalletState(result.state) },
  };
}

module.exports = { AIWA_PARAMS, STATE_FILE, domainOfWallet, readBaselines, readEvidence, checkScoreEligibilityAiwa };
