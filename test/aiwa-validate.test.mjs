import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ed25519 } from '@noble/curves/ed25519.js';
import {
  identityFromSecretKey, createEvent, vdfSeed, computeSuccinctEpochs, buildSignedProgressionEvent, buildSignedAccrualEvent,
  buildSignedClaimEvent, SOLANA_INCINERATOR_ADDRESS, fromUnits,
} from 'aiwa-core';

const require = createRequire(import.meta.url);
const { checkScoreEligibilityAiwa, domainOfWallet } = require('../aiwa-utils.js');

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
  constructor(w) { this.w = w; this.events = []; this.head = []; this.epoch = 0; this.output = null; this.lastProgression = null; }
  async append(type, payload) {
    const parents = type === 'progression' && this.lastProgression && !this.head.includes(this.lastProgression) ? [...this.head, this.lastProgression] : this.head;
    const e = await createEvent(this.w.identity, { domain: 'yourmine', parents, type, payload });
    this.events.push(e); this.head = [e.id];
    if (type === 'progression') this.lastProgression = e.id;
    return e;
  }
  burn(signature) { return this.append('burn-record', { domain: this.w.domain, signature }); }
  async work(epochs, { iterations = epochs * EI } = {}) {
    const w = await computeSuccinctEpochs(vdfSeed(this.w.domain, this.output ?? 'genesis'), iterations);
    this.epoch += epochs;
    const signed = await buildSignedProgressionEvent({ domain: this.w.domain, epoch: this.epoch, vdfIterations: iterations, vdfOutput: w.vdfOutput }, this.w.seed, this.w.pub);
    this.output = w.vdfOutput;
    return this.append('progression', { ...signed, vdfProof: w.vdfProof });
  }
  async commit(fields) { return this.append('accrual', await buildSignedAccrualEvent({ domain: this.w.domain, ...fields }, this.w.seed, this.w.pub)); }
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
  const cheapWork = await computeSuccinctEpochs(vdfSeed(w.domain, h.output), EI); // one epoch of work...
  const signed = await buildSignedProgressionEvent({ domain: w.domain, epoch: h.epoch + 500, vdfIterations: EI, vdfOutput: cheapWork.vdfOutput }, w.seed, w.pub);
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
