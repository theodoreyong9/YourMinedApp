// aiwa-utils.js — the score of a submission, derived from the author's own Aiwa events.
//
// YourMine used to read two or three numbers from the author's account in a Solana program (last burn, last action slot,
// tax). Time is now Aiwa's: epochs of proven sequential work, and the mining state is derived from the events the wallet
// signed — never taken on the page's word:
//   - each event's envelope is verified (id, author, signature); a tampered event is set aside;
//   - the progression proofs are checked (a few milliseconds each, whatever the work they attest to);
//   - the burns are confirmed by THIS validator against Solana (fetchBurnRecord), not read from the events;
//   - what the validator derived for this wallet last time (aiwa-state.json on main) is the baseline: only the events
//     after it are folded, and they must chain from it (each names the one it follows; the work starts from it).
//   - what OTHERS hold of this wallet (aiwa-witness.json on main): a wallet keeps its own events, and could keep two
//     histories and show only the favourable one. Wallets that received its events send, with their own submissions,
//     the highest progression event of this wallet they hold — signed by this wallet, which is what makes it a proof.
//     A submission must contain every such event the validator already holds beyond its baseline.
// The figure that comes out — { score, laps } — is what the ranking freezes, as before.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Connection, PublicKey } = require('@solana/web3.js');

const RPC_URL = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const STATE_FILE = 'aiwa-state.json';
const WITNESS_FILE = 'aiwa-witness.json';
const MAX_EVENTS = 200000;     // a single submission's evidence
const MAX_BURNS = 200;         // burn records one submission may ask this validator to confirm
const MAX_WITNESSES_PER_SUBMISSION = 50;
const MAX_WITNESSES_PER_DOMAIN = 32;   // what the registry keeps per domain (the furthest along)
const MAX_WITNESS_BYTES = 16384;

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

function readWitnessStore(dir = '.') {
  try { return JSON.parse(fs.readFileSync(path.join(dir, WITNESS_FILE), 'utf8')) || {}; } catch { return {}; }
}

/** The epoch of `domain` that the registry already validated (its baseline), 0 if it has none. */
function baselineEpochOf(baselines, domain) {
  for (const entry of Object.values(baselines)) if (entry && entry.domain === domain) return entry.epoch || 0;
  return 0;
}

/**
 * Which of the events a submission carries as witnesses the registry keeps. A witness is an event another domain
 * signed, held by the submitter: it proves that domain's history includes it. It is kept only if it is a progression
 * event of a domain other than the submitter's, whose envelope and own signature verify, and that goes beyond what the
 * registry already validated for that domain. Anything else is ignored (never a reason to refuse the submission).
 * @returns {Promise<{ accepted: Array<{ domain: string, id: string, epoch: number }>, ignored: number }>}
 */
async function ingestWitnesses({ witnesses, ownDomain, baselines = {} }) {
  const { verifyEvent, signatureAuthentic } = await core();
  const accepted = [];
  let ignored = 0;
  if (!Array.isArray(witnesses)) return { accepted, ignored };
  const seen = new Set();
  for (const w of witnesses.slice(0, MAX_WITNESSES_PER_SUBMISSION)) {
    try {
      if (!w || w.type !== 'progression' || !w.payload || JSON.stringify(w).length > MAX_WITNESS_BYTES) throw new Error('shape');
      const domain = w.payload.domain;
      if (typeof domain !== 'string' || domain !== w.author || domain === ownDomain) throw new Error('domain');
      if (!Number.isInteger(w.payload.epoch) || w.payload.epoch < 1) throw new Error('epoch');
      if (w.payload.epoch <= baselineEpochOf(baselines, domain)) throw new Error('already validated');
      if (seen.has(w.id)) throw new Error('duplicate');
      if (!(await verifyEvent(w)).valid || !(await signatureAuthentic(w))) throw new Error('signature');
      seen.add(w.id);
      accepted.push({ domain, id: w.id, epoch: w.payload.epoch });
    } catch { ignored++; }
  }
  return { accepted, ignored };
}

/** The store with `accepted` added, at most MAX_WITNESSES_PER_DOMAIN per domain (the furthest along), and what the registry has validated since dropped. */
function mergeWitnesses(store, accepted, baselines = {}) {
  const next = {};
  const byDomain = {};
  for (const [domain, list] of Object.entries(store)) byDomain[domain] = [...list];
  for (const w of accepted) (byDomain[w.domain] ??= []).push({ id: w.id, epoch: w.epoch });
  for (const [domain, list] of Object.entries(byDomain)) {
    const floor = baselineEpochOf(baselines, domain);
    const unique = new Map();
    for (const w of list) if (w.epoch > floor) unique.set(w.id, { id: w.id, epoch: w.epoch });
    const kept = [...unique.values()].sort((a, b) => b.epoch - a.epoch).slice(0, MAX_WITNESSES_PER_DOMAIN);
    if (kept.length > 0) next[domain] = kept;
  }
  return next;
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
 * @param {Array<{ id: string, epoch: number }>} [args.witnessed] what others hold of this wallet's domain (aiwa-witness.json): the history shown must contain them
 * @param {{ getTransaction: Function }} [args.connection] Solana, to confirm the burns (a stub in tests)
 * @param {object} [args.params] the deployment's parameters (the default is the one the wallet runs: tests pass a small epochIterations)
 * @returns {Promise<{ eligible: boolean, reason: string, score: number, currentLaps: number, mining: object | null, baseline: object | null }>}
 */
async function checkScoreEligibilityAiwa({ walletPubkey, lastPubScore = 0, lastPubLaps = 1, evidence, baselines = {}, witnessed = [], connection, params = AIWA_PARAMS }) {
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
  const counted = baseline?.accrual?.burns?.used ?? {};   // burns the baseline already folded: not asked of Solana again
  const wanted = [...new Set(evidence.events
    .filter((e) => e && e.type === 'burn-record' && e.author === domain && typeof e.payload?.signature === 'string')
    .map((e) => e.payload.signature))].filter((signature) => !counted[signature]);
  if (wanted.length > MAX_BURNS) return none('Too many burns to confirm in one submission');
  const rpc = connection ?? new Connection(RPC_URL, 'confirmed');
  for (const signature of wanted) {
    const record = await fetchBurnRecord(rpc, signature).catch(() => null);
    if (record) burnRecords[signature] = record;
  }

  const result = await assessMining({ rewardParams: params, events: evidence.events, burnRecords, domain, baseline });
  const mining = result.mining;
  if (!mining) return { ...none('No position: the burn is not confirmed, or nothing was committed'), rejections: result.rejections };

  // What others hold of this domain, beyond the baseline, must be in the history shown — and accepted by it. A history
  // that leaves one out is another history of the same key (a fork), or a stretch of work cut short: not this one.
  const refused = new Set([...result.rejections.map((r) => r.eventId), ...result.invalidEvents]);
  const shown = new Set(evidence.events.map((e) => e && e.id));
  for (const w of witnessed) {
    if (!(w && typeof w.id === 'string' && w.epoch > after)) continue;   // before the baseline: the registry already moved past it
    if (!shown.has(w.id) || refused.has(w.id)) {
      return { ...none(`Another holder of this wallet's events has its progression event ${w.id.slice(0, 12)}… (epoch ${w.epoch}); the history shown does not contain it`), mining };
    }
  }

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
    baseline: { domain, epoch: mining.epoch, head: mining.chainHead, state: serializeWalletState(result.state) },
  };
}

module.exports = {
  AIWA_PARAMS, STATE_FILE, WITNESS_FILE, domainOfWallet, readBaselines, readEvidence, readWitnessStore,
  baselineEpochOf, ingestWitnesses, mergeWitnesses, checkScoreEligibilityAiwa,
};
