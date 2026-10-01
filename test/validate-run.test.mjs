import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, symlinkSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import nacl from 'tweetnacl';
import {
  identityFromSecretKey, createEvent, progressionSeed, computeSuccinctEpochs, buildSignedProgressionEvent, buildSignedAccrualEvent,
  SOLANA_INCINERATOR_ADDRESS,
} from 'aiwa-core';

// The real validate.js, run as the GitHub Action runs it: a PR checkout with a signed YourMine event, a sphere and the
// Aiwa evidence, and a Solana (a local JSON-RPC server) that knows the burn. The deployment's own epoch (100 000
// squarings) is what runs: a few epochs, a few seconds.
const root = resolve('.');
const EPOCH = 100000;
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes) {
  let x = 0n;
  for (const v of bytes) x = x * 256n + BigInt(v);
  let out = '';
  while (x > 0n) { out = ALPHABET[Number(x % 58n)] + out; x /= 58n; }
  for (const v of bytes) { if (v === 0) out = '1' + out; else break; }
  return out;
}
const hex = (b) => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');

// a Solana that answers getTransaction for known burns, in the shape @solana/web3.js parses
function fakeSolana(burns) {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const call = JSON.parse(body);
      const burn = burns[call.params?.[0]];
      const result = call.method === 'getTransaction' && burn ? {
        slot: 5, blockTime: 1,
        transaction: {
          signatures: [call.params[0]],
          message: {
            accountKeys: [burn.payer, SOLANA_INCINERATOR_ADDRESS, '11111111111111111111111111111111'],
            header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 1 },
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [{ programIdIndex: 2, accounts: [0, 1], data: '3Bxs4Bc3VYuGVB19' }],
          },
        },
        meta: { err: null, fee: 5000, innerInstructions: [], logMessages: [], preBalances: [50e9, 0, 1], postBalances: [50e9 - burn.lamports - 5000, burn.lamports, 1], preTokenBalances: [], postTokenBalances: [], rewards: [] },
      } : null;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: call.id, result }));
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

async function submission(dir, { withEvidence = true, witnesses = [], store } = {}) {
  const seed = nacl.randomBytes(32);
  const pair = nacl.sign.keyPair.fromSeed(seed);
  const wallet = base58(pair.publicKey);
  const identity = await identityFromSecretKey(hex(seed));
  const domain = identity.id;
  const events = [];
  let parents = []; let epoch = 0; let output = null; let chainHead = null;
  const append = async (type, payload) => {
    const e = await createEvent(identity, { domain: 'yourmine', parents, type, payload });
    events.push(e); parents = [e.id]; if (type === 'progression' || type === 'accrual') chainHead = e.id;
    return e;
  };
  const work = async (n) => {
    const previous = chainHead;
    const w = await computeSuccinctEpochs(progressionSeed(domain, output, previous), n * EPOCH);
    epoch += n; output = w.vdfOutput;
    const signed = await buildSignedProgressionEvent({ domain, epoch, vdfIterations: n * EPOCH, vdfOutput: w.vdfOutput, previous }, seed, pair.publicKey);
    return append('progression', { ...signed, vdfProof: w.vdfProof });
  };
  await append('burn-record', { domain, signature: 'burnsig' });
  await work(1);
  await append('accrual', await buildSignedAccrualEvent({ domain, b: 1, previous: chainHead }, seed, pair.publicKey));
  const last = await work(2);

  const nonce = 'nonce-' + Math.random().toString(36).slice(2, 12);
  const code = '/* a sphere */\nwindow.YM_S={};\n';
  const filename = 'new.sphere.js';
  const content_hash = createHash('sha256').update(code).digest('hex');
  const ts = Math.floor(Date.now() / 1000);
  const evPayload = { action: 'create', filename, content_hash, nonce, timestamp: ts, score: 123, laps: 1, codeUrl: 'https://example.invalid/new.sphere.js', wip: false };
  const signature = Buffer.from(nacl.sign.detached(Buffer.from(JSON.stringify(evPayload)), pair.secretKey)).toString('base64');
  mkdirSync(join(dir, '_pr_content', 'events'), { recursive: true });
  writeFileSync(join(dir, '_pr_content', filename), code);
  writeFileSync(join(dir, '_pr_content', 'events', nonce + '.json'), JSON.stringify({ ...evPayload, wallet, signature }));
  if (withEvidence) {
    mkdirSync(join(dir, '_pr_content', 'aiwa'), { recursive: true });
    writeFileSync(join(dir, '_pr_content', 'aiwa', nonce + '.json'), JSON.stringify({ version: 1, wallet, domain, afterEpoch: 0, events, witnesses }));
  }
  // what the registry already holds of OTHER wallets' histories, and of this one's (aiwa-witness.json on main)
  if (store) writeFileSync(join(dir, 'aiwa-witness.json'), JSON.stringify(store(domain, last)));
  return { wallet, epoch, domain, last };
}

// async, not spawnSync: the fake Solana lives in this process and must keep answering while validate.js runs
function runValidate(dir, rpc) {
  for (const f of ['validate.js', 'solana-utils.js', 'aiwa-utils.js']) copyFileSync(join(root, f), join(dir, f));
  try { symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules')); } catch { /* already there */ }
  writeFileSync(join(dir, 'files.json'), '[]');
  rmSync('/tmp/validation_result.json', { force: true });
  return new Promise((resolve) => {
    const child = spawn('node', ['validate.js'], { cwd: dir, env: { ...process.env, GH_ACTOR: 'alice', PR_CONTENT_DIR: '_pr_content', SOLANA_RPC: rpc } });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('validate.js: a new sphere with Aiwa evidence and a burn Solana knows is validated, and the baseline is handed to merge.js', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ym-validate-'));
  const { wallet } = await submission(dir);
  const { server, url } = await fakeSolana({ burnsig: { payer: wallet, lamports: 2e9 } });
  try {
    const run = await runValidate(dir, url);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /Score eligible \(claimable=/);
    const result = JSON.parse(readFileSync('/tmp/validation_result.json', 'utf8'));
    assert.equal(result.files[0].filename, 'new.sphere.js');
    assert.ok(result.files[0].score > 0, 'the score is the validator\'s, not the 123 the event wrote');
    assert.notEqual(result.files[0].score, 123);
    assert.equal(result.files[0].laps, 2, 'two epochs since the last action');
    assert.equal(result.aiwaBaseline.epoch, 3);
  } finally { server.closeAllConnections(); server.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('validate.js: without evidence a new sphere is refused', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ym-validate-'));
  const { wallet } = await submission(dir, { withEvidence: false });
  const { server, url } = await fakeSolana({ burnsig: { payer: wallet, lamports: 2e9 } });
  try {
    const run = await runValidate(dir, url);
    assert.equal(run.status, 1);
    assert.match(run.stdout + run.stderr, /No Aiwa evidence/);
  } finally { server.closeAllConnections(); server.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('validate.js: a burn Solana does not know gives no position, whatever the events say', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ym-validate-'));
  await submission(dir);
  const { server, url } = await fakeSolana({});
  try {
    const run = await runValidate(dir, url);
    assert.equal(run.status, 1);
    assert.match(run.stdout + run.stderr, /No position/);
    assert.equal(existsSync('/tmp/validation_result.json'), false);
  } finally { server.closeAllConnections(); server.close(); rmSync(dir, { recursive: true, force: true }); }
});

// another wallet's progression event, as a witness would hand it over
async function foreignProgression() {
  const seed = nacl.randomBytes(32);
  const pair = nacl.sign.keyPair.fromSeed(seed);
  const identity = await identityFromSecretKey(hex(seed));
  const work = await computeSuccinctEpochs(progressionSeed(identity.id, null, null), EPOCH);
  const signed = await buildSignedProgressionEvent({ domain: identity.id, epoch: 1, vdfIterations: EPOCH, vdfOutput: work.vdfOutput, previous: null }, seed, pair.publicKey);
  return createEvent(identity, { domain: 'yourmine', parents: [], type: 'progression', payload: { ...signed, vdfProof: work.vdfProof } });
}

test('validate.js: a history that holds what another wallet witnessed is validated; one that does not is refused', async () => {
  for (const [name, store, ok] of [
    ['witnessed event is in the history', (domain, last) => ({ [domain]: [{ id: last.id, epoch: last.payload.epoch }] }), true],
    ['witnessed event is not in the history', (domain) => ({ [domain]: [{ id: 'f'.repeat(64), epoch: 3 }] }), false],
  ]) {
    const dir = mkdtempSync(join(tmpdir(), 'ym-validate-'));
    const { wallet } = await submission(dir, { store });
    const { server, url } = await fakeSolana({ burnsig: { payer: wallet, lamports: 2e9 } });
    try {
      const run = await runValidate(dir, url);
      if (ok) assert.equal(run.status, 0, name + ': ' + run.stdout + run.stderr);
      else {
        assert.equal(run.status, 1, name);
        assert.match(run.stdout + run.stderr, /Another holder of this wallet's events/);
      }
    } finally { server.closeAllConnections(); server.close(); rmSync(dir, { recursive: true, force: true }); }
  }
});

test('validate.js: the witnesses a submission brings about other wallets are handed to merge.js; garbage among them is ignored', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ym-validate-'));
  const theirs = await foreignProgression();
  const forged = { ...theirs, payload: { ...theirs.payload, epoch: 50 } };
  const { wallet } = await submission(dir, { witnesses: [theirs, forged, { nonsense: true }] });
  const { server, url } = await fakeSolana({ burnsig: { payer: wallet, lamports: 2e9 } });
  try {
    const run = await runValidate(dir, url);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /Witnesses: 1 kept, 2 ignored/);
    const result = JSON.parse(readFileSync('/tmp/validation_result.json', 'utf8'));
    assert.deepEqual(result.aiwaWitnesses, [{ domain: theirs.author, id: theirs.id, epoch: 1 }]);
  } finally { server.closeAllConnections(); server.close(); rmSync(dir, { recursive: true, force: true }); }
});
