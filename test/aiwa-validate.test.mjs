import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ed25519 } from '@noble/curves/ed25519.js';
import {
  identityFromSecretKey, createEvent, progressionSeed, computeSuccinctEpochs, buildSignedProgressionEvent, buildSignedAccrualEvent,
  buildSignedClaimEvent, SOLANA_INCINERATOR_ADDRESS, fromUnits,
} from 'aiwa-core';

const require = createRequire(import.meta.url);
const { checkScoreEligibilityAiwa, domainOfWallet, ingestWitnesses, mergeWitnesses } = require('../aiwa-utils.js');

// What the registry's validator does with a submission's Aiwa evidence. A small epoch so the tests are quick: the
// deployment's own (100 000 squarings) is what validate.js uses.
const EI = 100;
const params = { alpha: 1.1, beta: 2.2, gamma: 3, C: Math.pow(33, 3), minQ: 1, epochIterations: EI };

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes) {
  let x = 0n;
  for (const v of bytes) x = x * 256n + BigInt(v);
  let out = '';
  while (x > 0n) { out = ALPHABET[Number(x % 58n)] + out; x /= 58n; }
  for (const v of bytes) { if (v === 0) out = '1' + out; else break; }
  return out;
}
const hex = (bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

// a wallet: one Ed25519 key, its Solana address, its Aiwa domain
async function wallet() {
  const seed = ed25519.utils.randomSecretKey();
  const pub = ed25519.getPublicKey(seed);
  const identity = await identityFromSecretKey(hex(seed));
  return { seed, pub, identity, address: base58(pub), domain: identity.id };
}
// Solana, as far as the validator asks: the finalized transaction of a burn
const solana = (known) => ({
  getTransaction: async (signature) => {
    const burn = known[signature];
    if (!burn) return null;
    return {
      slot: 5,
      transaction: { message: { accountKeys: [burn.payer, SOLANA_INCINERATOR_ADDRESS, '11111111111111111111111111111111'] } },
      meta: { err: null, fee: 5000, preBalances: [50e9, 0, 1], postBalances: [50e9 - burn.lamports - 5000, burn.lamports, 1] },
    };
  },
});

// the wallet's honest history, as src/build.js would export it
class Wallet {
  constructor(w) { this.w = w; this.events = []; this.parents = []; this.epoch = 0; this.output = null; this.chainHead = null; }
  async append(type, payload) {
    const e = await createEvent(this.w.identity, { domain: 'yourmine', parents: this.parents, type, payload });
    this.events.push(e); this.parents = [e.id];
    if (type === 'progression' || type === 'accrual' || type === 'claim') this.chainHead = e.id;   // the mining line
    return e;
  }
  burn(signature) { return this.append('burn-record', { domain: this.w.domain, signature }); }
  async work(epochs, { iterations = epochs * EI } = {}) {
    const previous = this.chainHead;
    const w = await computeSuccinctEpochs(progressionSeed(this.w.domain, this.output, previous), iterations);
    this.epoch += epochs;
    const signed = await buildSignedProgressionEvent({ domain: this.w.domain, epoch: this.epoch, vdfIterations: iterations, vdfOutput: w.vdfOutput, previous }, this.w.seed, this.w.pub);
    this.output = w.vdfOutput;
    return this.append('progression', { ...signed, vdfProof: w.vdfProof });
  }
  async commit(fields) { return this.append('accrual', await buildSignedAccrualEvent({ domain: this.w.domain, ...fields, previous: this.chainHead }, this.w.seed, this.w.pub)); }
  evidence({ afterEpoch = 0, events = this.events } = {}) {
    return { version: 1, wallet: this.w.address, domain: this.w.domain, afterEpoch, events: events.filter((e) => e.type !== 'progression' || e.payload.epoch > afterEpoch) };
  }
}
const check = (w, evidence, extra = {}) => checkScoreEligibilityAiwa({ walletPubkey: w.address, evidence, params, connection: extra.connection, baselines: extra.baselines ?? {}, lastPubScore: extra.lastPubScore ?? 0, lastPubLaps: extra.lastPubLaps ?? 1 });

test('the domain of a Solana wallet is the hash of its key, as in Aiwa', async () => {
  const w = await wallet();
  assert.equal(domainOfWallet(w.address), w.domain);
});

test('a first submission: the figure comes out of the events, with the burn confirmed by the validator', async () => {
  const w = await wallet();
  const h = new Wallet(w);
  await h.burn('sig1'); await h.work(2); await h.commit({ b: 1 }); await h.work(6);
  const r = await check(w, h.evidence(), { connection: solana({ sig1: { payer: w.address, lamports: 2e9 } }) });
  assert.equal(r.eligible, true, r.reason);
  assert.ok(r.score > 0);
  assert.equal(r.currentLaps, 6);
  assert.equal(r.mining.epoch, 8);
  assert.equal(r.baseline.epoch, 8);
});

test('no evidence, evidence for another wallet, or a burn Solana does not know: no position', async () => {
  const w = await wallet(); const other = await wallet();
  const h = new Wallet(w);
  await h.burn('sig1'); await h.work(2); await h.commit({ b: 1 }); await h.work(4);
  const connection = solana({ sig1: { payer: w.address, lamports: 2e9 } });
  assert.match((await check(w, null)).reason, /No Aiwa evidence/);
  assert.match((await check(other, h.evidence(), { connection })).reason, /not for this wallet/);
  const unknown = await check(w, h.evidence(), { connection: solana({}) });
  assert.equal(unknown.eligible, false);
  assert.match(unknown.reason, /No position/);
  // somebody else's burn quoted by this domain does not count either
  const notMine = await check(w, h.evidence(), { connection: solana({ sig1: { payer: other.address, lamports: 2e9 } }) });
  assert.equal(notMine.eligible, false);
});

test('age cannot be had for less work: an epoch of fewer iterations is not counted', async () => {
  const w = await wallet();
  const h = new Wallet(w);
  await h.burn('sig1'); await h.work(2); await h.commit({ b: 1 });
  await h.work(1);
  const cheapWork = await computeSuccinctEpochs(progressionSeed(w.domain, h.output, h.chainHead), EI); // one epoch of work...
  const signed = await buildSignedProgressionEvent({ domain: w.domain, epoch: h.epoch + 500, vdfIterations: EI, vdfOutput: cheapWork.vdfOutput, previous: h.chainHead }, w.seed, w.pub);
  await h.append('progression', { ...signed, vdfProof: cheapWork.vdfProof }); // ...announced as 500
  const r = await check(w, h.evidence(), { connection: solana({ sig1: { payer: w.address, lamports: 2e9 } }) });
  assert.equal(r.mining.epoch, 3, 'the age is what the work proves');
});

test('the ratio gate: laps weigh against the score, as before', async () => {
  const w = await wallet();
  const h = new Wallet(w);
  await h.burn('sig1'); await h.work(2); await h.commit({ b: 1 }); await h.work(6);
  const connection = solana({ sig1: { payer: w.address, lamports: 2e9 } });
  const first = await check(w, h.evidence(), { connection });
  const demanding = await check(w, h.evidence(), { connection, lastPubScore: first.score * 100, lastPubLaps: 1 });
  assert.equal(demanding.eligible, false);
  assert.match(demanding.reason, /ratio too low/);
});

test('a second submission continues from what the validator kept: only the new events, chained', async () => {
  const w = await wallet();
  const h = new Wallet(w);
  await h.burn('sig1'); await h.work(2); await h.commit({ b: 1 }); await h.work(3);
  const connection = solana({ sig1: { payer: w.address, lamports: 2e9 } });
  const first = await check(w, h.evidence(), { connection });
  const baselines = { [w.address]: first.baseline };

  await h.work(4);
  const second = await check(w, h.evidence({ afterEpoch: first.baseline.epoch, events: h.events.slice(-1) }), { connection, baselines });
  assert.equal(second.eligible, true, second.reason);
  assert.equal(second.mining.epoch, 9);
  const whole = await check(w, h.evidence(), { connection });
  assert.equal(second.mining.claimable, whole.mining.claimable, 'the same figure as replaying everything');

  const stale = await check(w, h.evidence({ afterEpoch: 3, events: h.events.slice(-1) }), { connection, baselines });
  assert.match(stale.reason, /continues from epoch 3; this validator holds epoch 5/);
  const nobase = await check(w, h.evidence({ afterEpoch: 5, events: h.events.slice(-1) }), { connection, baselines: {} });
  assert.match(nobase.reason, /holds epoch none/);
});

test('a tampered event is set aside: the rest still counts, and the forged part does not', async () => {
  const w = await wallet();
  const h = new Wallet(w);
  await h.burn('sig1'); await h.work(2); await h.commit({ b: 1 }); await h.work(5);
  const events = [...h.events];
  events[events.length - 1] = { ...events[events.length - 1], payload: { ...events[events.length - 1].payload, epoch: 999 } };
  const r = await check(w, { ...h.evidence(), events }, { connection: solana({ sig1: { payer: w.address, lamports: 2e9 } }) });
  assert.equal(r.mining.epoch, 2, 'the forged last epoch is not counted');
});

// --- Witnesses: what others hold of a wallet's events must be in the history it shows ---------------------------------

// a wallet whose history has a hidden action: [burn, work 2, commit big, work 2, commit small (T 0.4), work 2]
async function history(w) {
  const h = new Wallet(w);
  await h.burn('sig1'); await h.work(2); await h.commit({ b: 1 }); await h.work(2);
  const small = await h.commit({ b: 0.2, T: 0.4 });
  const last = await h.work(2);
  return { h, small, last };
}
const burns = (w) => solana({ sig1: { payer: w.address, lamports: 3e9 } });

test('witnesses: a history that contains what another holder has is accepted', async () => {
  const w = await wallet();
  const { h, last } = await history(w);
  const witnessed = [{ id: last.id, epoch: last.payload.epoch }];
  const r = await check(w, h.evidence(), { connection: burns(w) });
  const withWitness = await checkScoreEligibilityAiwa({ walletPubkey: w.address, evidence: h.evidence(), params, connection: burns(w), witnessed });
  assert.equal(r.eligible, true);
  assert.equal(withWitness.eligible, true, withWitness.reason);
});

test('witnesses: an action left out is caught — the work after it does not stand without it, and the witness is missing', async () => {
  const w = await wallet();
  const { h, small, last } = await history(w);
  const shown = h.events.filter((e) => e.id !== small.id);
  const alone = await check(w, h.evidence({ events: shown }), { connection: burns(w) });
  assert.equal(alone.mining.epoch, 4, 'without the witness the history still stops at the action: the two last epochs are bound to it');
  const caught = await checkScoreEligibilityAiwa({ walletPubkey: w.address, evidence: h.evidence({ events: shown }), params, connection: burns(w), witnessed: [{ id: last.id, epoch: last.payload.epoch }] });
  assert.equal(caught.eligible, false);
  assert.match(caught.reason, /Another holder of this wallet's events/);
});

test('witnesses: a second history of the same key, valid on its own, is refused once someone holds the first', async () => {
  const w = await wallet();
  const { last } = await history(w);
  // the other history: the same key, the same steps, built again — a different line from the first commit on
  const fork = new Wallet(w);
  await fork.burn('sig1'); await fork.work(2); await fork.commit({ b: 1 }); await fork.work(4);
  const own = await check(w, fork.evidence(), { connection: burns(w) });
  assert.equal(own.eligible, true, 'valid by itself: nothing in it contradicts itself');
  const caught = await checkScoreEligibilityAiwa({ walletPubkey: w.address, evidence: fork.evidence(), params, connection: burns(w), witnessed: [{ id: last.id, epoch: last.payload.epoch }] });
  assert.equal(caught.eligible, false);
  assert.match(caught.reason, /does not contain it/);
});

test('witnesses: a history cut short before the witnessed epoch is refused; one that goes further, or a witness the baseline already passed, is not', async () => {
  const w = await wallet();
  const { h, last } = await history(w);
  const witnessed = [{ id: last.id, epoch: last.payload.epoch }];
  const prefix = h.events.slice(0, -1);   // everything but the last stretch of work
  const cut = await checkScoreEligibilityAiwa({ walletPubkey: w.address, evidence: h.evidence({ events: prefix }), params, connection: burns(w), witnessed });
  assert.equal(cut.eligible, false);

  // a witness at an epoch the validator already holds a baseline beyond: nothing to ask for
  const first = await check(w, h.evidence(), { connection: burns(w) });
  const baselines = { [w.address]: first.baseline };
  await h.work(3);
  const next = await checkScoreEligibilityAiwa({
    walletPubkey: w.address, evidence: h.evidence({ afterEpoch: first.baseline.epoch, events: h.events.slice(-1) }),
    params, connection: burns(w), baselines, witnessed,
  });
  assert.equal(next.eligible, true, next.reason);
  assert.equal(next.baseline.head, h.chainHead, 'the baseline keeps the chain head the wallet continues from');
});

test('ingestWitnesses keeps a real progression event of another wallet, and ignores everything else', async () => {
  const w = await wallet(); const other = await wallet();
  const { h: mine } = await history(w);
  const { h: theirs, last } = await history(other);
  const forged = { ...last, payload: { ...last.payload, epoch: 99 } };
  const a = await ingestWitnesses({
    ownDomain: w.domain,
    witnesses: [last, last, forged, mine.events.find((e) => e.type === 'progression'), theirs.events.find((e) => e.type === 'accrual'), null, 'x'],
  });
  assert.deepEqual(a.accepted, [{ domain: other.domain, id: last.id, epoch: last.payload.epoch }], 'only the real one, once');
  assert.equal(a.ignored, 6, 'a copy, a forgery, my own, an accrual, and the garbage');

  const behind = await ingestWitnesses({ ownDomain: w.domain, witnesses: [last], baselines: { [other.address]: { domain: other.domain, epoch: last.payload.epoch } } });
  assert.deepEqual(behind.accepted, [], 'the registry has already validated that epoch');
});

test('mergeWitnesses: keeps the furthest along per domain, bounded, and drops what the registry has since validated', async () => {
  const d = 'd'.repeat(64);
  let store = {};
  store = mergeWitnesses(store, Array.from({ length: 40 }, (_, i) => ({ domain: d, id: 'id' + i, epoch: i + 1 })));
  assert.equal(store[d].length, 32);
  assert.equal(store[d][0].epoch, 40, 'the furthest along first');
  assert.equal(store[d].at(-1).epoch, 9, 'the oldest ones are what goes');
  store = mergeWitnesses(store, [], { somewallet: { domain: d, epoch: 40 } });
  assert.deepEqual(store, {}, 'once the registry validated epoch 40 for that domain, nothing is left to ask for');
});
