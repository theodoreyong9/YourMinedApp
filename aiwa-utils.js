// aiwa-utils.js — the score of a submission, derived from the author's own Aiwa events.
//
// The protocol part is Aiwa's (aiwa-core's assessSubmission): each event's envelope verified, progression proofs
// checked (milliseconds each, whatever the work they attest to), burns confirmed by THIS validator against Solana,
// the baseline continued (only the events after it, chained from it), and what OTHER wallets hold of this one
// (witnesses) required in the history shown. What stays here is YourMine's: where those are kept (aiwa-state.json and
// aiwa-witness.json on main), the Solana endpoint, and the permission-score ratio the figure is judged by.
// The figure that comes out — { score, laps } — is what the ranking freezes, as before.

const fs = require('fs');
const path = require('path');
const { Connection } = require('@solana/web3.js');

const RPC_URL = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const STATE_FILE = 'aiwa-state.json';      // wallet address -> { domain, epoch, head, state }: what this validator derived last time
const WITNESS_FILE = 'aiwa-witness.json';  // domain -> [{ id, epoch }]: what other wallets hold of it

// The deployment's parameters — the same as the wallet's (src/mine.js): the formula YourMine's Proof of Will already
// states (alpha, beta, gamma, C, minQ) and the work of one epoch.
const AIWA_PARAMS = { alpha: 1.1, beta: 2.2, gamma: 3, C: Math.pow(33, 3), minQ: 1, epochIterations: 100000 };

let corePromise = null;
const core = () => (corePromise ??= import('aiwa-core'));

/** The Aiwa domain of a Solana wallet: the hash of the key (a wallet and its domain are the same key). */
async function domainOfWallet(walletPubkey) {
  return (await core()).domainOfAddress(walletPubkey);
}

function readBaselines(dir = '.') {
  try { return JSON.parse(fs.readFileSync(path.join(dir, STATE_FILE), 'utf8')) || {}; } catch { return {}; }
}
function readWitnessStore(dir = '.') {
  try { return JSON.parse(fs.readFileSync(path.join(dir, WITNESS_FILE), 'utf8')) || {}; } catch { return {}; }
}
function readEvidence(prContentDir, nonce) {
  if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(nonce)) return null;
  const file = path.join(prContentDir, 'aiwa', nonce + '.json');
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** domain -> the epoch this validator already validated for it (0 if none), from the baselines kept by wallet address. */
function baselineEpochOf(baselines) {
  const byDomain = {};
  for (const entry of Object.values(baselines)) if (entry && entry.domain) byDomain[entry.domain] = entry.epoch || 0;
  return (domain) => byDomain[domain] || 0;
}

/** The witnesses a submission brings about OTHER wallets (worth keeping), and how many it ignored. */
async function ingestWitnesses({ witnesses, ownDomain, baselines = {} }) {
  return (await core()).ingestWitnesses({ witnesses, ownDomain, baselineEpochOf: baselineEpochOf(baselines) });
}
/** The witness store with `accepted` added, bounded, and what the registry has validated since dropped. */
async function mergeWitnesses(store, accepted, baselines = {}) {
  return (await core()).mergeWitnessStore(store, accepted, baselineEpochOf(baselines));
}

/**
 * @param {object} args
 * @param {string} args.walletPubkey the base58 wallet that signed the YourMine event
 * @param {number} [args.lastPubScore] and @param {number} [args.lastPubLaps] — the wallet's last publication, if any
 * @param {object} args.evidence { version, wallet, domain, afterEpoch, events, witnesses } as src/build.js pushes it
 * @param {object} [args.baselines] what this validator derived before (aiwa-state.json)
 * @param {Array<{ id: string, epoch: number }>} [args.witnessed] what others hold of this wallet's domain (aiwa-witness.json): the history shown must contain them
 * @param {{ getTransaction: Function }} [args.connection] Solana, to confirm the burns (a stub in tests)
 * @param {object} [args.params] the deployment's parameters (the default is the one the wallet runs: tests pass a small epochIterations)
 * @returns {Promise<{ eligible: boolean, reason: string, score: number, currentLaps: number, mining: object | null, baseline: object | null }>}
 */
async function checkScoreEligibilityAiwa({ walletPubkey, lastPubScore = 0, lastPubLaps = 1, evidence, baselines = {}, witnessed = [], connection, params = AIWA_PARAMS }) {
  const none = (reason, extra = {}) => ({ eligible: false, reason, score: 0, currentLaps: 1, mining: null, baseline: null, ...extra });
  if (!evidence || typeof evidence !== 'object' || !Array.isArray(evidence.events)) return none('No Aiwa evidence with this submission');
  if (evidence.wallet !== walletPubkey) return none('The Aiwa evidence is not for this wallet');
  const { assessSubmission } = await core();
  const domain = await domainOfWallet(walletPubkey);

  const assessed = await assessSubmission({
    rewardParams: params, evidence, domain, baseline: baselines[walletPubkey] ?? null, witnessed,
    connection: connection ?? new Connection(RPC_URL, 'confirmed'),
  });
  if (!assessed.ok) return none(assessed.reason, { mining: assessed.mining, rejections: assessed.rejections });
  const mining = assessed.mining;
  if (!mining) return none('No position: the burn is not confirmed, or nothing was committed', { rejections: assessed.rejections });

  const score = Number(mining.claimable);
  const currentLaps = Math.max(1, mining.sinceLastAction);
  if (!(score > 0) || !Number.isFinite(score)) return none('Nothing claimable yet', { mining });

  // as before: the ratio score / laps must not fall below the wallet's last publication's
  const lastRatio = lastPubScore / Math.max(1, lastPubLaps);
  const curRatio = score / currentLaps;
  const eligible = lastPubScore === 0 || curRatio >= lastRatio;
  return {
    eligible,
    reason: eligible ? 'Score eligible' : `Claimable ratio too low (${curRatio.toFixed(6)} < ${lastRatio.toFixed(6)})`,
    score, currentLaps, curRatio, lastRatio, mining,
    // what the registry keeps for the next submission of this wallet
    baseline: assessed.baseline,
  };
}

module.exports = {
  AIWA_PARAMS, STATE_FILE, WITNESS_FILE, domainOfWallet, readBaselines, readEvidence, readWitnessStore,
  baselineEpochOf, ingestWitnesses, mergeWitnesses, checkScoreEligibilityAiwa,
};
