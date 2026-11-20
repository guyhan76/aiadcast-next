import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const script = await readFile(new URL('./android-download-bridge.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.route('https://appassets.androidplatform.net/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Native bridge test</title><button id="test">test</button>' }));
  await page.addInitScript(() => {
    window.messages = [];
    window.events = [];
    window.AiadcastNative = { postMessage: value => window.messages.push(JSON.parse(value)) };
    window.addEventListener('aiadcast-native-export', event => window.events.push(event.detail));
  });
  await page.goto('https://appassets.androidplatform.net/index.html');
  await page.addScriptTag({ content: script });
  await page.addScriptTag({ content: script }); // Initialization is idempotent.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('aiadcast-export-context', {detail:{owner:'fixture-owner'}})));
  assert.equal((await page.evaluate(() => window.messages))[0].type, 'export-context');
  await page.evaluate(() => { window.messages = []; });
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['{"project":"카페"}'], { type: 'application/json' }));
    a.download = '프로젝트.json';
    a.click(); // Existing detached-anchor download path used by the app.
  });
  await page.waitForFunction(() => window.messages.length === 1);
  let messages = await page.evaluate(() => window.messages);
  assert.equal(messages[0].filename, '프로젝트.json');
  assert.equal(messages[0].mime, 'application/json');
  assert.equal(Buffer.from(messages[0].base64, 'base64').toString(), '{"project":"카페"}');
  assert.equal(messages[0].owner, 'fixture-owner');
  assert.match(messages[0].requestId, /^[0-9a-f-]{36}$/);
  await page.evaluate(requestId => window.dispatchEvent(new CustomEvent('aiadcast-native-export', {detail:{status:'saved',requestId}})), messages[0].requestId);

  await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 10; canvas.height = 10;
    canvas.getContext('2d').fillRect(0, 0, 10, 10);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'feed.png'; a.textContent = 'Export'; a.id = 'png';
    document.body.appendChild(a);
  });
  await page.locator('#png').click(); // Real user clicks use the capture handler.
  await page.waitForFunction(() => window.messages.length === 2);
  messages = await page.evaluate(() => window.messages);
  assert.equal(messages[1].mime, 'image/png');
  assert.deepEqual([...Buffer.from(messages[1].base64, 'base64').subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  await page.evaluate(requestId => window.dispatchEvent(new CustomEvent('aiadcast-native-export', {detail:{status:'saved',requestId}})), messages[1].requestId);

  await page.evaluate(() => {
    const a = document.createElement('a');
    a.href = 'https://example.com/image.png'; a.download = 'remote.png'; a.click();
    const unsafe = document.createElement('a');
    unsafe.href = URL.createObjectURL(new Blob(['<script>alert(1)</script>'], { type: 'text/html' }));
    unsafe.download = 'unsafe.html'; unsafe.click();
  });
  await page.waitForFunction(() => window.events.filter(event => event.status === 'error').length === 2);
  assert.equal((await page.evaluate(() => window.messages)).length, 2);
  console.log('Android download bridge: 4 checks passed (JSON, PNG, idempotence, unsupported/remote rejection). Native device chooser still requires Android device validation.');
} finally {
  await browser.close();
}
