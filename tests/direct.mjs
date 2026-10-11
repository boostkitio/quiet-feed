// Extension-only install: post filters with nothing else running, then optional
// reply checking with the reader's own key. A local fixture stands in for TypeSafe.
import { chromium } from 'playwright';
import { readFile, writeFile, cp, mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';

await mkdir('work', { recursive: true });
const goodKey = 'fixture_direct_key_0123456789';
const calls = [];
let rejected = 0;
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url !== '/v1/systemone' || req.method !== 'POST') { res.writeHead(404); return res.end('{}'); }
  let body = ''; for await (const chunk of req) body += chunk;
  if (req.headers.authorization !== `Bearer ${goodKey}`) { rejected++; res.writeHead(401); return res.end('{}'); }
  const request = JSON.parse(body); calls.push(request);
  const text = request.state.reply.text, high = text.includes('SYNTHETIC_AI');
  const noul = value => ({ type: 'noul', noul: value });
  return res.end(JSON.stringify({ model: 'test-fixture', usage: { input_tokens: 1, output_tokens: 1 }, answers: {
    aiStyle: noul(high ? .96 : .1), boilerplate: noul(high ? .95 : .15), disclosure: noul(.01),
    ...(request.questions.preference ? { preference: noul(text.includes('PREFERENCE_MATCH') ? .96 : .1), keepPreference: noul(.05) } : {}),
  } }));
});
await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
const origin = `127.0.0.1:${server.address().port}`;
const extension = await mkdtemp(resolve('work/direct-extension-'));
await cp(resolve('dist/extension'), extension, { recursive: true, filter: source => !source.endsWith('local-connection.json') });
for (const file of ['background.js', 'manifest.json']) {
  const path = resolve(extension, file);
  // Neither the real TypeSafe API nor a companion running on this computer is ever contacted.
  await writeFile(path, (await readFile(path, 'utf8')).replaceAll('https://api.typesafe.ai', `http://${origin}`).replaceAll('127.0.0.1:43127', origin));
}
let context;
try {
  context = await chromium.launchPersistentContext(await mkdtemp(resolve(tmpdir(), 'quiet-feed-direct-')), {
    channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`], viewport: { width: 1050, height: 1000 },
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).hostname;
  await context.route('https://www.linkedin.com/**', route => readFile('tests/feed.html', 'utf8').then(body => route.fulfill({ status: 200, contentType: 'text/html', body })));
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.locator('#connection').getByText('Filtering Posts', { exact: true }).waitFor();
  assert.equal(await popup.locator('#apiKey').isVisible(), false, 'a fresh install is not presented as needing setup');
  const page = await context.newPage(); await page.goto('https://www.linkedin.com/feed/');
  for (const post of ['promoted-legacy', 'old-sdui', 'suggested-sdui']) await page.locator(`#${post}.qf-collapsed`).waitFor();
  await page.locator('#feed-sort > .qf-filter-host').getByText('Quiet Feed hides:', { exact: true }).waitFor();
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.qf-reply-host:not([hidden])').count(), 0, 'no reply controls are offered without a key or companion');
  assert.equal(calls.length + rejected, 0, 'post filters make no requests');
  assert.equal((await worker.evaluate(() => chrome.storage.session.get('lastError'))).lastError || '', '', 'the missing optional extra is not an error');

  await popup.locator('#settingsPanel summary').click();
  await popup.locator('#apiKey').fill('abc'); await popup.locator('#saveKey').click();
  await popup.getByText('Invalid TypeSafe key.', { exact: false }).waitFor();
  await popup.locator('#apiKey').fill('wrong_key_0123456789abcdef'); await popup.locator('#saveKey').click();
  await popup.getByText('Key saved. Reply checking is on.', { exact: true }).waitFor();
  for (let n = 0; n < 60 && !rejected; n++) await page.waitForTimeout(50);
  assert.ok(rejected > 0);
  await page.waitForTimeout(300); await popup.reload();
  await popup.getByText('TypeSafe rejected the API key.', { exact: false }).waitFor();
  assert.equal(await page.locator('#ai-body').isVisible(), true, 'a rejected key leaves replies visible');
  assert.equal(Number((await worker.evaluate(() => chrome.storage.session.get('requests'))).requests || 0), 0, 'a rejected key does not use the allowance');

  await popup.locator('#apiKey').fill(goodKey); await popup.locator('#saveKey').click();
  await popup.locator('#connection').getByText('Filtering Posts & Replies', { exact: true }).waitFor();
  await page.locator('#ai-body.qf-reply-collapsed').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#human-body').isVisible(), true);
  assert.ok(calls.length > 0 && calls.every(call => Object.keys(call.state).every(key => ['reply', 'readerFeedback'].includes(key))));
  assert.ok(calls.every(call => !/ORIGINAL_|PRIVATE_|Example Commenter/.test(JSON.stringify(call.state))), 'only reply text is sent');
  const state = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'status' }));
  assert.equal(JSON.stringify(state).includes(goodKey), false, 'the key is never handed back to the popup');
  assert.equal(await popup.locator('#apiKey').inputValue(), '');
  assert.equal(await page.evaluate(() => document.documentElement.outerHTML.includes('fixture_direct_key')), false);

  // Feedback is kept in the browser and shapes later checks, as with the companion.
  await page.locator('#short-comment').getByRole('button', { name: 'Flag As Potentially AI', exact: true }).click();
  await page.locator('#short-comment').getByText('Flagged By You', { exact: true }).waitFor();
  assert.equal((await worker.evaluate(() => chrome.storage.local.get('directFeedback'))).directFeedback.entries.length, 1);
  await page.evaluate(() => {
    const root = document.createElement('div'); root.className = 'comments-comment-item'; root.id = 'learned';
    const body = document.createElement('div'); body.className = 'update-components-text'; body.textContent = 'PREFERENCE_MATCH: An unseen reply exercises saved preferences without asserting authorship.';
    root.append(body); document.querySelector('#thread').append(root);
  });
  await page.locator('#learned').getByText('Matches Your Feedback', { exact: true }).waitFor();
  assert.equal(calls.at(-1).state.readerFeedback.length, 1);
  await page.reload();
  await page.locator('#short-body.qf-reply-collapsed').waitFor({ state: 'attached' });

  await popup.reload(); await popup.locator('#settingsPanel summary').click();
  await popup.locator('#removeKey').click();
  await popup.locator('#connection').getByText('Filtering Posts', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.qf-reply-collapsed, .qf-reply-host:not([hidden])'));
  assert.equal(JSON.stringify(await worker.evaluate(() => chrome.storage.local.get(null))).includes(goodKey), false, 'removing the key erases it');
  assert.equal(await page.locator('#promoted-legacy.qf-collapsed').count(), 1, 'post filters carry on without the key');
  console.log('Passed: extension-only install filters posts with no requests; own-key reply checking, rejection handling, privacy of the key, local feedback and key removal.');
} finally { await context?.close(); await new Promise(done => server.close(done)); }
