import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { VisionLedger } from '../server/vision-evaluation/ledger.mjs';
import { runAnalysis, prepareAnalysis, sourceHash, analyzeApprovedImage } from '../server/vision-evaluation/analysis.mjs';
import { composeDiagnostic, planOverlay } from '../server/vision-evaluation/overlay.mjs';

const target = '22932.jpg';
const bytes = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#f1ebe0' } }).png().toBuffer();
const hash = sourceHash(bytes);
const proposal = () => ({ located: true, product: [.1, .2, .4, .35], axes: { width: [[.12, .5], [.36, .5]], depth: [[.36, .5], [.48, .4]], height: [[.48, .4], [.48, .22]] }, protectedText: [[.1, .04, .8, .08], [.1, .82, .8, .08]], existingAnnotations: [], inset: [.65, .35, .3, .4] });
const dimensions = { width: '300', depth: '200', height: '100' };
const envelope = (p = proposal(), usage = { prompt_tokens: 1000, completion_tokens: 300 }) => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(p) } }], usage });
const run = (ledger, fetchImpl) => runAnalysis({ bytes, target, ledger, fetchImpl, apiKey: 'mock-only', approvedHashes: { [target]: hash } });

test('shared durable budget survives restart and caps ten calls across images', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vision-ledger-')); const path = join(dir, 'ledger.sqlite');
  try {
    for (let i = 0; i < 10; i++) {
      const ledger = new VisionLedger(path);
      const id = ledger.reserve(i % 2 ? '22935.jpg' : target, hash);
      ledger.settle(id, 100); ledger.close();
    }
    const ledger = new VisionLedger(path);
    assert.equal(ledger.rows().reduce((n, r) => n + r.hold, 0), 300000);
    assert.throws(() => ledger.reserve(target, hash), /APPROVAL_LIMIT/); ledger.close();
  } finally { rmSync(dir, { recursive: true }); }
});
test('two database connections cannot dispatch parallel calls; crash reservation survives', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vision-concurrency-')); const path = join(dir, 'ledger.sqlite');
  const one = new VisionLedger(path), two = new VisionLedger(path);
  try {
    one.reserve(target, hash); one.close();
    assert.throws(() => two.reserve('22935.jpg', hash), /RECONCILE_REQUIRED/);
  } finally { two.close(); rmSync(dir, { recursive: true }); }
});
test('unapproved third image cannot consume or bypass a reservation', () => {
  const l = new VisionLedger(':memory:');
  assert.throws(() => l.reserve('22925.png', hash), /UNAUTHORIZED_IMAGE/);
  assert.equal(l.rows().length, 0); l.close();
});
test('unknown and over-reservation costs halt; repeat settlement cannot erase costs', () => {
  for (const cost of [null, NaN, -1, 30001]) {
    const l = new VisionLedger(':memory:'); const id = l.reserve(target, hash);
    l.settle(id, cost);
    assert.throws(() => l.reserve(target, hash), /RECONCILE_REQUIRED/);
    assert.throws(() => l.settle(id, 0), /NOT_RESERVED/); l.close();
  }
});
test('byte-bound input and image resize fit the fixed reservation with no tools', async () => {
  const p = await prepareAnalysis(bytes);
  assert.ok(p.costBoundMicros < 30000); assert.ok(p.textBound <= 8000);
  assert.equal(p.payload.max_completion_tokens, 1500);
  assert.equal(p.payload.n, 1); assert.equal(p.payload.tools, undefined);
  assert.equal(p.payload.messages[1].content.length, 1);
  assert.match(p.payload.messages[0].content, /Never use arrow tips/);
});
test('live entry refuses unbound reference bytes before a network call or reservation', async () => {
  const l = new VisionLedger(':memory:');
  await assert.rejects(analyzeApprovedImage({ bytes, target, ledger: l, apiKey: 'mock-only' }), /IMAGE_NOT_BOUND/);
  assert.equal(l.rows().length, 0); l.close();
});
test('missing key and mismatched hash fail before dispatch', async () => {
  const l = new VisionLedger(':memory:'); let called = 0;
  for (const override of [{ apiKey: '' }, { approvedHashes: {} }]) await assert.rejects(runAnalysis({ bytes, target, ledger: l, apiKey: 'mock-only', approvedHashes: { [target]: hash }, fetchImpl: async () => { called++; }, ...override }));
  assert.equal(called, 0); assert.equal(l.rows().length, 0); l.close();
});
test('one analysis settles token usage and leaves location explicitly unverified', async () => {
  const l = new VisionLedger(':memory:'); let called = 0;
  const result = await run(l, async (url, options) => {
    called++; assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(options.redirect, 'error'); assert.equal(l.rows()[0].state, 'reserved');
    return new Response(JSON.stringify(envelope()));
  });
  assert.equal(called, 1); assert.equal(result.costMicros, 2100);
  assert.equal(result.verified, false); assert.equal(l.rows()[0].state, 'settled'); l.close();
});
test('timeout and non-success responses never retry or leak provider details', async () => {
  for (const status of [0, 401, 429, 500]) {
    const l = new VisionLedger(':memory:'); let called = 0;
    const result = await run(l, async () => { called++; if (!status) throw Error('secret-value'); return new Response('secret-value', { status }); });
    assert.equal(called, 1); assert.equal(result.reason, 'ANALYSIS_UNCERTAIN');
    assert.equal(JSON.stringify(result).includes('secret-value'), false);
    assert.throws(() => l.reserve(target, hash), /RECONCILE_REQUIRED/); l.close();
  }
});
test('missing usage, oversized response and truncated JSON retain the reservation', async () => {
  for (const body of [JSON.stringify(envelope(proposal(), null)), JSON.stringify(envelope(proposal(), { prompt_tokens: 0, completion_tokens: 0 })), 'x'.repeat(100001), '{']) {
    const l = new VisionLedger(':memory:');
    const result = await run(l, async () => new Response(body));
    assert.equal(result.proposal, null); assert.equal(result.reason, 'ANALYSIS_UNCERTAIN'); assert.equal(l.rows()[0].state, 'uncertain'); l.close();
  }
});
test('bad geometry does not erase an actual paid usage settlement', async () => {
  const l = new VisionLedger(':memory:');
  const result = await run(l, async () => new Response(JSON.stringify(envelope({ located: false }))));
  const output = await composeDiagnostic({ bytes, expectedHash: hash, proposal: result.proposal, dimensions });
  assert.equal(l.rows()[0].actual, 2100); assert.equal(output.state, 'original-preserved');
  assert.deepEqual(output.bytes, bytes); l.close();
});
test('automatic labels use exact saved values; main and photographic crop plans are review-only', async () => {
  for (const mode of ['main', 'inset']) {
    const result = await composeDiagnostic({ bytes, expectedHash: hash, proposal: proposal(), dimensions, mode });
    assert.equal(result.state, 'review-required'); assert.equal(result.verified, false);
    assert.deepEqual(result.plan.planned.map(e => e.text), ['300 mm', '200 mm', '100 mm']);
    const metadata = await sharp(result.bytes).metadata(); assert.equal(metadata.width, 800); assert.equal(metadata.height, 1000);
  }
});
test('changed image, unsupported geometry, clipping and protected-copy collision preserve original', async () => {
  const bad = [];
  bad.push({ expectedHash: '0'.repeat(64) });
  bad.push({ proposal: { ...proposal(), located: false } });
  bad.push({ proposal: { ...proposal(), axes: { ...proposal().axes, depth: [[.3, .3], [.3, .3]] } } });
  bad.push({ proposal: { ...proposal(), protectedText: [[0, 0, 1, 1]] } });
  bad.push({ dimensions: { ...dimensions, width: '<script>' } });
  bad.push({ proposal: { ...proposal(), inset: [0, 0, 0, 0] }, mode: 'inset' });
  for (const changes of bad) {
    const result = await composeDiagnostic({ bytes, expectedHash: hash, proposal: proposal(), dimensions, ...changes });
    assert.equal(result.state, 'original-preserved'); assert.deepEqual(result.bytes, bytes);
  }
});
test('existing annotations remain explicit and never become new detection proof', () => {
  const p = proposal(); p.existingAnnotations = [[.1, .6, .3, .04]];
  const plan = planOverlay(p, dimensions, 'main', 800, 1000);
  assert.equal(plan.containsExistingAnnotations, true); assert.equal(plan.verified, false);
});
