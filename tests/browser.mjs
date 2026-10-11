import { chromium } from 'playwright';
import { readFile, writeFile, cp, mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import { VERSION } from '../src/shared.ts';
import { FeedbackStore } from '../src/feedback.ts';

await mkdir('work', { recursive: true });
const analysed = [];
const token = 'b'.repeat(48);
const feedbackStore = new FeedbackStore();
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, GET' }); return res.end(); }
  if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Pair the extension' })); }
  if (req.url === '/health') return res.end(JSON.stringify({ configured: true, ok: true, classifierVersion: VERSION, feedback: feedbackStore.index() }));
  if (req.url === '/feedback/clear') return res.end(JSON.stringify({ feedback: feedbackStore.clear() }));
  if (!['/analyse-reply-v3','/feedback'].includes(req.url)) { res.writeHead(404); return res.end('{}'); }
  let body = ''; for await (const chunk of req) body += chunk;
  const parsed = JSON.parse(body); const text = parsed.text;
  if (req.url === '/feedback') return res.end(JSON.stringify({ feedback: feedbackStore.save(text, parsed.label) }));
  const manualDecision = feedbackStore.lookup(text);
  if (manualDecision) return res.end(JSON.stringify({ manualDecision, feedbackRevision: feedbackStore.revision }));
  analysed.push(text);
  if (text.includes('API_FAILURE')) { res.writeHead(503); return res.end(JSON.stringify({ error: 'TypeSafe request failed (HTTP 503). Replies remain visible.' })); }
  if (text.includes('SLOW_REPLY')) await new Promise(resolve => setTimeout(resolve, 800));
  const high = text.includes('SYNTHETIC_AI');
  return res.end(JSON.stringify({ signals: { aiStyle: high ? .96 : .1, boilerplate: high ? .95 : .15, disclosure: .01, ...(feedbackStore.entries.length ? { preference: text.includes('PREFERENCE_MATCH') ? .96 : .1 } : {}) }, model: 'test-fixture', feedbackRevision: feedbackStore.revision }));
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const extension = await mkdtemp(resolve('work/browser-extension-'));
await cp(resolve('dist/extension'), extension, { recursive: true, filter: source => !source.endsWith('local-connection.json') });
for (const file of ['background.js', 'manifest.json']) {
  const path = resolve(extension, file);
  await writeFile(path, (await readFile(path, 'utf8')).replaceAll('127.0.0.1:43127', `127.0.0.1:${server.address().port}`));
}
let context;
const profileDirectory = await mkdtemp(resolve(tmpdir(), 'quiet-feed-test-'));
try {
  context = await chromium.launchPersistentContext(profileDirectory, {
    channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`], viewport: { width: 1050, height: 1000 },
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).hostname;
  async function expectNoChargedAttempts(message) {
    let stable = 0;
    for (let n=0;n<60;n++) {
      const count=Number((await worker.evaluate(()=>chrome.storage.session.get('requests'))).requests || 0);
      stable=count===0?stable+1:0;
      if(stable>=4) return;
      await page.waitForTimeout(50);
    }
    assert.equal((await worker.evaluate(()=>chrome.storage.session.get('requests'))).requests || 0,0,message);
  }
  // Existing users may have selected Label Only or a different threshold.
  await worker.evaluate(() => chrome.storage.local.set({ settings: { enabled: true, mode: 'label', threshold: .65, limit: 100 } }));
  await context.route('https://www.linkedin.com/**', route => readFile('tests/feed.html', 'utf8').then(body => route.fulfill({ status: 200, contentType: 'text/html', body })));
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
  assert.equal(await popup.locator('input[type=range]').count(), 0);
  assert.equal(await popup.locator('input[name=mode]').count(), 0);
  assert.equal(await popup.getByText('Replies Checked', { exact: true }).count(), 1);
  await popup.locator('#connection').getByText('Filtering Posts', { exact: true }).waitFor();
  const page = await context.newPage(); await page.goto('https://www.linkedin.com/feed/');
  for (const post of ['promoted-legacy', 'promoted-sdui', 'promoted-image', 'promoted-body']) await page.locator(`#${post}.qf-collapsed`).waitFor();
  for (const section of ['videos-legacy', 'videos-sdui']) await page.locator(`#${section}.qf-videos-hidden`).waitFor({ state: 'attached' });
  assert.equal(await page.locator('#videos-legacy').isVisible(), false);
  assert.equal(await page.locator('#video-mention').isVisible(), true, 'quoting the module title does not hide an ordinary post');
  assert.equal(analysed.length, 0);
  for(const section of ['jobs-legacy','jobs-sdui','jobs-anonymous']) await page.locator(`#${section}.qf-jobs-hidden`).waitFor({state:'attached'});
  assert.equal(await page.locator('#jobs-legacy').isVisible(),false);
  assert.equal(await page.locator('#jobs-mention').isVisible(),true);
  await popup.locator('#hideRecommendedJobs').uncheck();
  await page.waitForFunction(()=>!document.querySelector('.qf-jobs-hidden'));
  assert.equal(await page.locator('#jobs-legacy').isVisible(),true);
  assert.equal(await page.locator('#jobs-anonymous').isVisible(),true,'the supplied anonymous layout also restores when disabled');
  assert.equal(await page.locator('#videos-legacy.qf-videos-hidden').count(),1,'jobs toggle does not disable video filtering');
  await popup.reload();
  assert.equal(await popup.locator('#hideRecommendedJobs').isChecked(),false,'jobs preference persists');
  await popup.locator('#hideRecommendedJobs').check();
  await page.locator('#jobs-sdui.qf-jobs-hidden').waitFor({state:'attached'});
  assert.equal(analysed.length,0,'jobs filtering needs no pairing or AI calls');
  // Posts stamped a week or more ago collapse locally and stay revealable.
  for (const post of ['old-sdui', 'old-legacy']) await page.locator(`#${post}.qf-collapsed`).waitFor();
  await page.locator('#old-sdui').getByText('Older than 7 days', { exact: true }).waitFor();
  assert.equal(await page.locator('#old-sdui .post-text').isVisible(), false);
  for (const post of ['recent-legacy', 'recent-repost', 'age-mention', 'original']) assert.equal(await page.locator(`#${post}.qf-collapsed`).count(), 0, `${post} is recent, reposted recently or undated`);
  await page.locator('#old-sdui').getByRole('button', { name: 'Show Post', exact: true }).click();
  assert.equal(await page.locator('#old-sdui .post-text').isVisible(), true);
  await page.locator('#old-sdui').getByRole('button', { name: 'Hide Post', exact: true }).click();
  await page.locator('#old-sdui.qf-collapsed').waitFor();
  // LinkedIn's real header stamp is a bare date; today's must stay, last month's must go.
  await page.evaluate(() => {
    const stamp = date => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    for (const [id, daysAgo] of [['dated-today', 0], ['dated-old', 40]]) {
      const card = document.createElement('div'); card.id = id; card.setAttribute('role', 'listitem'); card.setAttribute('componentkey', `update-card-focus${id}`);
      const header = document.createElement('p'), span = document.createElement('span');
      span.textContent = stamp(new Date(Date.now() - daysAgo * 86_400_000)); header.append(span);
      card.append(header, document.createTextNode('A dynamically loaded post.')); document.querySelector('main').append(card);
    }
  });
  await page.locator('#dated-old.qf-collapsed').waitFor();
  assert.equal(await page.locator('#dated-today.qf-collapsed').count(), 0);
  await page.locator('#dated-old > p > span').evaluate(el => { el.textContent = '4h'; });
  await page.waitForFunction(() => !document.querySelector('#dated-old.qf-collapsed'));
  // Opening a single post on purpose is not the feed: only the feed applies the age rule.
  await page.evaluate(() => history.pushState({}, '', '/posts/fixture'));
  await page.waitForFunction(() => !document.querySelector('#old-sdui.qf-collapsed'));
  assert.equal(await page.locator('#promoted-legacy.qf-collapsed').count(), 1, 'the promoted rule still applies off the feed');
  await page.evaluate(() => history.pushState({}, '', '/feed/'));
  await page.locator('#old-sdui.qf-collapsed').waitFor();
  // The same two rules are switchable in the feed, beneath LinkedIn's Sort by control.
  const filters = page.locator('#feed-sort > .qf-filter-host');
  await filters.getByText('Quiet Feed hides:', { exact: true }).waitFor();
  assert.equal(await page.locator('.qf-filter-host').count(), 1, 'one filter row, attached to the real Sort by control only');
  const promotedBox = filters.getByRole('checkbox', { name: 'Contains “promoted”' }), oldBox = filters.getByRole('checkbox', { name: 'Older than' }), ageSelect = filters.getByRole('combobox', { name: 'Post age' });
  assert.deepEqual([await promotedBox.isChecked(), await oldBox.isChecked(), await ageSelect.inputValue()], [true, true, '7']);
  // selectOption dispatches a synthetic event, which the row ignores by design; use real keys.
  const ages = ['7', '14', '30', '90'];
  async function chooseAge(target) {
    await ageSelect.focus();
    for (let steps = ages.indexOf(target) - ages.indexOf(await ageSelect.inputValue()); steps; steps -= Math.sign(steps)) await page.keyboard.press(steps > 0 ? 'ArrowDown' : 'ArrowUp');
  }
  await ageSelect.selectOption('90'); await page.waitForTimeout(600);
  assert.equal(await ageSelect.inputValue(), '7', 'a scripted age change is not saved');
  await chooseAge('30');
  await page.waitForFunction(() => !document.querySelector('#old-legacy.qf-collapsed'));
  await page.locator('#old-sdui').getByText('Older than 30 days', { exact: true }).waitFor();
  assert.equal((await worker.evaluate(() => chrome.storage.local.get('settings'))).settings.maxPostAgeDays, 30, 'the chosen age is saved');
  await page.reload();
  await page.locator('#old-sdui').getByText('Older than 30 days', { exact: true }).waitFor();
  assert.equal(await ageSelect.inputValue(), '30', 'the chosen age survives a reload');
  assert.equal(await page.locator('#old-legacy.qf-collapsed').count(), 0);
  await chooseAge('14');
  await page.locator('#old-legacy.qf-collapsed').waitFor();
  await promotedBox.uncheck();
  assert.equal(await page.locator('#promoted-legacy.qf-collapsed, #promoted-body.qf-collapsed').count(), 0, 'a choice applies at once, before the save returns');
  await page.waitForTimeout(3500);
  assert.equal(await promotedBox.isChecked(), false, 'a rescan never snaps an unticked rule back');
  assert.equal((await worker.evaluate(() => chrome.storage.local.get('settings'))).settings.hidePromoted, false);
  await filters.getByText('Contains “promoted”', { exact: true }).click();
  await page.locator('#promoted-legacy.qf-collapsed').waitFor();
  await promotedBox.focus(); await page.keyboard.press('Space');
  assert.equal(await page.locator('#promoted-legacy.qf-collapsed').count(), 0, 'label clicks and the space bar both work');
  assert.equal(await page.locator('#old-sdui.qf-collapsed').count(), 1, 'the promoted switch leaves the age rule alone');
  await promotedBox.check();
  await page.locator('#promoted-legacy.qf-collapsed').waitFor();
  await promotedBox.evaluate(box => { box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(600);
  assert.equal(await page.locator('#promoted-legacy.qf-collapsed').count(), 1, 'the website cannot switch a rule off with a synthetic event');
  assert.equal(await promotedBox.isChecked(), true);
  await promotedBox.evaluate(box => box.click());
  await page.waitForTimeout(600);
  assert.equal(await page.locator('#promoted-legacy.qf-collapsed').count(), 1, 'nor with a scripted click');
  assert.deepEqual([await promotedBox.isChecked(), (await worker.evaluate(() => chrome.storage.local.get('settings'))).settings.hidePromoted], [true, true]);
  assert.equal(await filters.locator('.error').innerText(), '');
  assert.ok((await filters.locator('.filters').boundingBox()).x - (await page.locator('#feed-sort').boundingBox()).x < 4, 'the row is a left-aligned box');
  await oldBox.uncheck();
  await page.waitForFunction(() => !document.querySelector('#old-sdui.qf-collapsed, #old-legacy.qf-collapsed'));
  await popup.reload();
  assert.equal(await popup.locator('#hideOldPosts').isChecked(), false, 'the popup reflects a choice made in the feed');
  await popup.locator('#hideRecommendedJobs').uncheck(); await popup.locator('#hideRecommendedJobs').check();
  assert.equal((await worker.evaluate(() => chrome.storage.local.get('settings'))).settings.maxPostAgeDays, 14, 'popup saves keep the age chosen in the feed');
  await oldBox.check(); await chooseAge('7');
  await page.locator('#old-sdui').getByText('Older than 7 days', { exact: true }).waitFor();
  await page.evaluate(() => history.pushState({}, '', '/posts/fixture'));
  await page.waitForFunction(() => document.querySelector('.qf-filter-host').hidden);
  await page.evaluate(() => history.pushState({}, '', '/feed/'));
  await filters.getByText('Quiet Feed hides:', { exact: true }).waitFor();
  await popup.reload();
  await popup.locator('#hideOldPosts').uncheck();
  await page.waitForFunction(() => !document.querySelector('#old-sdui.qf-collapsed, #old-legacy.qf-collapsed'));
  assert.equal(await page.locator('#old-sdui > .qf-host:not([hidden])').count(), 0, 'switching the age rule off removes its bar');
  assert.equal(await page.locator('#promoted-legacy.qf-collapsed').count(), 1, 'the age toggle does not disable promoted filtering');
  await popup.reload();
  assert.equal(await popup.locator('#hideOldPosts').isChecked(), false, 'older-posts preference persists');
  await popup.locator('#hideOldPosts').check();
  await page.locator('#old-legacy.qf-collapsed').waitFor();
  assert.equal(analysed.length,0,'age filtering needs no pairing or AI calls');
  // Suggested posts and posts shown for someone else's activity collapse by their header label.
  for (const [post, label] of [['suggested-sdui', 'Suggested post'], ['activity-sdui', 'Shown for someone else’s activity'], ['activity-legacy', 'Shown for someone else’s activity']]) await page.locator(`#${post}.qf-collapsed`).getByText(label, { exact: true }).waitFor();
  for (const post of ['loves-mention', 'bait-post', 'list-post', 'muted-post', 'muted-partial']) assert.equal(await page.locator(`#${post}.qf-collapsed`).count(), 0, `${post} stays by default`);
  const suggestedBox = filters.getByRole('checkbox', { name: 'Suggested', exact: true }), activityBox = filters.getByRole('checkbox', { name: 'Others’ activity' }), baitBox = filters.getByRole('checkbox', { name: 'Engagement bait' });
  assert.deepEqual([await suggestedBox.isChecked(), await activityBox.isChecked(), await baitBox.isChecked()], [true, true, false]);
  await suggestedBox.uncheck();
  assert.deepEqual([await page.locator('#suggested-sdui.qf-collapsed').count(), await page.locator('#activity-sdui.qf-collapsed').count()], [0, 1]);
  await suggestedBox.check(); await activityBox.uncheck();
  assert.deepEqual([await page.locator('#suggested-sdui.qf-collapsed').count(), await page.locator('#activity-sdui.qf-collapsed, #activity-legacy.qf-collapsed').count()], [1, 0]);
  await activityBox.check();
  // The format check is off until asked for, and judges layout only.
  await baitBox.check();
  await page.locator('#bait-post.qf-collapsed').getByText('Engagement-bait format', { exact: true }).waitFor();
  for (const post of ['list-post', 'original', 'loves-mention']) assert.equal(await page.locator(`#${post}.qf-collapsed`).count(), 0);
  await baitBox.uncheck();
  assert.equal(await page.locator('#bait-post.qf-collapsed').count(), 0);
  // Mute words and the right-rail switch live in the popup; the page cannot set them.
  await popup.reload();
  await popup.locator('#muteWords').fill('Webinar, crypto'); await popup.locator('#muteWords').blur();
  await page.locator('#muted-post.qf-collapsed').getByText('Contains muted word “webinar”', { exact: true }).waitFor();
  assert.equal(await page.locator('#muted-partial.qf-collapsed').count(), 0, 'a muted word matches whole words only');
  assert.deepEqual((await worker.evaluate(() => chrome.storage.local.get('settings'))).settings.muteWords, ['webinar', 'crypto']);
  await suggestedBox.uncheck(); await suggestedBox.check();
  assert.deepEqual((await worker.evaluate(() => chrome.storage.local.get('settings'))).settings.muteWords, ['webinar', 'crypto'], 'the feed row leaves mute words alone');
  await popup.locator('#muteWords').fill(''); await popup.locator('#muteWords').blur();
  await page.waitForFunction(() => !document.querySelector('#muted-post.qf-collapsed'));
  assert.equal(await page.locator('#rail-news').isVisible(), true, 'the right rail is untouched by default');
  await popup.locator('#hideSidebar').check();
  for (const module of ['rail-news', 'rail-puzzles']) await page.locator(`#${module}`).waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#rail-footer').isVisible(), true, 'only the named modules go');
  await popup.locator('#hideSidebar').uncheck();
  await page.locator('#rail-puzzles').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.qf-reply-host:not([hidden])').count(), 0, 'reply controls wait for a key or companion');
  assert.equal(analysed.length,0,'the new post filters need no pairing or AI calls');
  // Reproduce the real failure: unpaired/stale pairing attempts must not spend
  // the browser allowance when no inference request has reached the companion.
  for (let n = 0; n < 30; n++) {
    if ((await worker.evaluate(() => chrome.storage.session.get('lastError'))).lastError) break;
    await page.waitForTimeout(50);
  }
  await expectNoChargedAttempts('unpaired replies must not consume the allowance');
  await worker.evaluate(() => chrome.storage.local.set({ token: 'c'.repeat(48) }));
  await page.reload();
  for (let n = 0; n < 30; n++) {
    if (String((await worker.evaluate(() => chrome.storage.session.get('lastError'))).lastError).startsWith('Pair ')) break;
    await page.waitForTimeout(50);
  }
  await expectNoChargedAttempts('rejected pairing must not consume the allowance');
  assert.equal(analysed.length, 0);
  await popup.reload();
  assert.equal(await popup.locator('#token').isVisible(), true, 'pairing errors expose the reconnect control');
  await popup.locator('#token').fill(token); await popup.locator('#pair').click();
  await popup.getByText('Connected. Your feed is ready.', { exact: true }).waitFor();
  await page.locator('#ai-body.qf-reply-collapsed').waitFor({ state: 'attached' });
  for(let n=0;n<60&&!analysed.some(text=>text==='SYNTHETIC_AI: A powerful reminder to unlock our collective potential.');n++) await page.waitForTimeout(50);
  assert.ok(analysed.includes('SYNTHETIC_AI: A powerful reminder to unlock our collective potential.'),'off-screen loaded comments are checked without clicks');
  assert.ok(analysed.includes('Congratulations!'),'short comments are checked automatically too');
  assert.equal(await page.locator('#original > .qf-host').count(), 0, 'original post has no result box');
  assert.equal(await page.locator('#original > .post-text').isVisible(), true);
  assert.equal(await page.locator('#nested-body').isVisible(), true, 'a hidden parent body preserves nested replies');
  await page.locator('#ai-comment').getByRole('button', { name: 'Show Reply', exact: true }).click();
  assert.equal(await page.locator('#ai-body').isVisible(), true);
  await page.locator('#ai-comment').getByRole('button', { name: 'Hide Reply', exact: true }).click();
  await page.locator('#ai-body.qf-reply-collapsed').waitFor({ state: 'attached' });
  // Scroll the comment container; its body may already be collapsed.
  await page.locator('#sdui-comment').scrollIntoViewIfNeeded();
  await page.locator('#sdui-body.qf-reply-collapsed').waitFor({ state: 'attached' });
  await page.locator('#sdui-child-body.qf-reply-collapsed').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#sdui-parent').isVisible(), true);
  assert.equal(await page.locator('#human-body').getAttribute('class'), 'comments-comment-entity__content');
  assert.equal(await page.locator('#short-body').getAttribute('class'), 'update-components-text');
  assert.equal(await page.getByText('Why This Result', { exact: true }).count(), 0);
  assert.equal(analysed.filter(text => text === 'SYNTHETIC_AI: A powerful reminder to unlock our collective potential.').length, 1, 'duplicate SDUI wrappers do not duplicate requests');
  await page.screenshot({ path: 'work/replies-tested.png', fullPage: true });
  await popup.locator('#enabled').uncheck();
  await page.waitForFunction(() => !document.querySelector('.qf-collapsed, .qf-reply-collapsed, .qf-videos-hidden, .qf-jobs-hidden'));
  assert.equal(await page.locator('#videos-legacy').isVisible(), true, 'pause restores the video module');
  assert.equal(await page.locator('.qf-host:not([hidden]), .qf-reply-host:not([hidden])').count(), 0, 'pause removes result UI too');
  await popup.locator('#enabled').check();
  await page.locator('#ai-body.qf-reply-collapsed').waitFor({ state: 'attached' });
  await page.locator('#videos-legacy.qf-videos-hidden').waitFor({ state: 'attached' });
  // A dynamically inserted standalone module is removed without touching the feed.
  await page.evaluate(() => {
    const section = document.createElement('section'); section.id = 'videos-dynamic';
    const title = document.createElement('h2'); title.textContent = 'VIDEOS FOR YOU';
    section.append(title, document.createTextNode('More suggested videos')); document.querySelector('main').append(section);
  });
  await page.locator('#videos-dynamic.qf-videos-hidden').waitFor({ state: 'attached' });
  await page.locator('#videos-dynamic h2').evaluate(el => { el.textContent = 'Jobs recommended for you'; });
  await page.waitForFunction(() => !document.querySelector('#videos-dynamic.qf-videos-hidden'));
  await page.locator('#videos-dynamic.qf-jobs-hidden').waitFor({state:'attached'});
  await popup.locator('#hideRecommendedJobs').uncheck();
  await page.waitForFunction(()=>!document.querySelector('#videos-dynamic.qf-jobs-hidden'));
  await popup.locator('#hideRecommendedJobs').check();
  await page.locator('#videos-dynamic.qf-jobs-hidden').waitFor({state:'attached'});
  await page.locator('#videos-dynamic h2').evaluate(el=>{el.textContent='Other recommendations';});
  await page.waitForFunction(()=>!document.querySelector('#videos-dynamic.qf-jobs-hidden'));
  assert.equal(await page.locator('#original > .post-text').isVisible(), true);
  await page.locator('#promoted-sdui.qf-collapsed').waitFor();
  await page.locator('#promoted-sdui .badge').evaluate(el => { el.textContent = '2h'; });
  await page.waitForFunction(() => !document.querySelector('#promoted-sdui.qf-collapsed'));
  await page.locator('#promoted-sdui .badge').evaluate(el => { el.textContent = 'PROMOTED'; });
  await page.locator('#promoted-sdui.qf-collapsed').waitFor();
  // Expanded/edited comments must be reclassified independently.
  await page.locator('#ai-comment').scrollIntoViewIfNeeded();
  await page.locator('#ai-body').evaluate(el => { el.textContent = 'CONCRETE_REPLY changed: I checked the logs from Tuesday. The failed upload used the old endpoint; the new endpoint returned 200.'; });
  await page.waitForFunction(() => !document.querySelector('#ai-body.qf-reply-collapsed'));
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#ai-comment > .qf-reply-host:not([hidden])').count(), 0);
  // Dynamically loaded replies and cached duplicates.
  const dynamicText = 'SYNTHETIC_AI Dynamic: This is a powerful reminder to unlock meaningful impact and foster collaboration in an ever-changing landscape.';
  async function addReply(id, text) {
    await page.evaluate(({ id, text }) => {
      const root = document.createElement('div'); root.className = 'comments-comment-item'; root.id = id;
      const body = document.createElement('div'); body.className = 'update-components-text'; body.textContent = text; root.append(body); document.querySelector('#thread').append(root);
    }, { id, text });
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  }
  await addReply('dynamic', dynamicText); await page.locator('#dynamic .qf-reply-collapsed').waitFor({ state: 'attached' });
  await addReply('duplicate', dynamicText); await page.locator('#duplicate .qf-reply-collapsed').waitFor({ state: 'attached' });
  assert.equal(analysed.filter(text => text === dynamicText).length, 1);
  await page.locator('#error-comment').scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
  assert.equal(await page.locator('#error-body').isVisible(), true);
  // Session budget prevents new network calls but does not hide an unchecked reply.
  await worker.evaluate(() => chrome.storage.session.set({ requests: 100 }));
  await addReply('budget', 'SYNTHETIC_AI budget: A new reply that should remain readable when the request allowance has been used up for this session.');
  await page.waitForTimeout(600);
  assert.equal(analysed.some(text => text.includes('budget:')), false);
  assert.equal(await page.locator('#budget .update-components-text').isVisible(), true);
  await popup.reload(); await popup.getByText('Session limit reached.', { exact: false }).waitFor();
  if (await popup.locator('#settingsPanel').getAttribute('open') === null) await popup.locator('#settingsPanel summary').click();
  await popup.locator('#reset').click();
  await page.locator('#budget .qf-reply-collapsed').waitFor({ state: 'attached' });
  // A stale high-signal response must not conceal a comment edited during its request.
  await addReply('slow', 'SYNTHETIC_AI SLOW_REPLY: This intentionally delayed reply exercises stale-response handling when its text changes during analysis.');
  for (let n = 0; n < 30 && !analysed.some(text => text.includes('SLOW_REPLY')); n++) await page.waitForTimeout(50);
  assert.ok(analysed.some(text => text.includes('SLOW_REPLY')));
  await page.locator('#slow .update-components-text').evaluate(el => { el.textContent = 'CONCRETE_REPLY replacement: The train leaves at 08:15. I checked the station board twice and the platform is now number 4.'; });
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#slow .update-components-text').isVisible(), true);
  assert.equal(await page.locator('#slow .qf-reply-collapsed').count(), 0);
  assert.ok(analysed.every(text => !/ORIGINAL_|PRIVATE_|HIDDEN_AD_REPLY|HIDDEN_VIDEO_REPLY|Example Commenter/.test(text)), 'only individual visible reply text is transmitted');
  // User feedback works even on a very short reply and changes future decisions.
  const shortAnalysesBeforeFeedback = analysed.filter(text => text === 'Congratulations!').length;
  await page.locator('#short-comment').getByRole('button',{name:'Flag As Potentially AI',exact:true}).evaluate(button=>button.click());
  assert.equal(feedbackStore.entries.length,0,'the website cannot fabricate user feedback with synthetic clicks');
  await page.locator('#short-comment').getByRole('button', {name:'Flag As Potentially AI',exact:true}).click();
  await page.locator('#short-body.qf-reply-collapsed').waitFor({state:'attached'});
  assert.equal(analysed.filter(text=>text==='Congratulations!').length, shortAnalysesBeforeFeedback, 'a manual flag does not make a model call');
  await page.locator('#short-comment').getByText('Flagged By You',{exact:true}).waitFor();
  await page.reload();
  await page.locator('#short-body.qf-reply-collapsed').waitFor({state:'attached'});
  await page.locator('#short-comment').getByRole('button',{name:'Keep This Reply',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#short-body.qf-reply-collapsed'));
  await page.locator('#short-comment').getByText('Kept By You',{exact:true}).waitFor();
  await page.locator('#human-comment').getByRole('button',{name:'Flag As Potentially AI',exact:true}).click();
  await page.locator('#human-body.qf-reply-collapsed').waitFor({state:'attached'});
  await addReply('learned','PREFERENCE_MATCH: An unseen reply exercises how saved preferences influence the next judgement without asserting authorship.');
  await page.locator('#learned .qf-reply-collapsed').waitFor({state:'attached'});
  await page.locator('#learned').getByText('Matches Your Feedback',{exact:true}).waitFor();
  // A deliberate Keep must win over both a high model score and a saved flag.
  await page.locator('#sdui-comment').getByRole('button',{name:'Keep This Reply',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#sdui-body.qf-reply-collapsed'));
  await addReply('feedback-race','SYNTHETIC_AI SLOW_REPLY Feedback race: A delayed result must never override a keep decision made while inference is still running.');
  for(let n=0;n<30&&!analysed.some(t=>t.includes('Feedback race:'));n++) await page.waitForTimeout(50);
  await page.locator('#feedback-race').getByRole('button',{name:'Flag As Potentially AI',exact:true}).click();
  await page.locator('#feedback-race').getByRole('button',{name:'Keep This Reply',exact:true}).click();
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('#feedback-race .update-components-text').isVisible(),true);
  await page.locator('#feedback-race').getByText('Kept By You',{exact:true}).waitFor();
  await popup.reload();
  await popup.locator('#feedbackCounts').getByText('1 flagged · 3 kept',{exact:true}).waitFor({state:'attached'});
  await popup.getByText('Your Feedback',{exact:true}).click();
  popup.once('dialog',dialog=>dialog.accept()); await popup.locator('#clearFeedback').click();
  await popup.locator('#feedbackCounts').getByText('0 flagged · 0 kept',{exact:true}).waitFor();
  assert.equal(feedbackStore.entries.length,0);
  await page.waitForFunction(()=>!document.querySelector('#human-body.qf-reply-collapsed'));
  await popup.reload(); await popup.setViewportSize({ width: 370, height: 700 });
  await popup.screenshot({ path: 'work/popup-tested.png', fullPage: true });
  const stored = await worker.evaluate(() => chrome.storage.session.get(null));
  assert.equal(JSON.stringify(stored).includes('SYNTHETIC_AI'), false);
  // A stale token like the user's is repaired from verified local setup, without
  // requiring another manual paste. Missing setup still exercises manual pairing above.
  await writeFile(resolve(extension, 'local-connection.json'), JSON.stringify({ token }));
  await worker.evaluate(() => chrome.storage.local.set({ token: 'c'.repeat(48) }));
  await popup.reload();
  await popup.getByText('Connected & Filtering', { exact: true }).waitFor();
  assert.equal(await worker.evaluate(() => chrome.storage.local.get('token').then(data => data.token === 'b'.repeat(48))), true);
  await worker.evaluate(() => chrome.storage.local.set({ token: 'c'.repeat(48) }));
  await context.close();
  context = await chromium.launchPersistentContext(profileDirectory, {
    channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`], viewport: { width: 1050, height: 1000 },
  });
  [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  await context.route('https://www.linkedin.com/**', route => readFile('tests/feed.html', 'utf8').then(body => route.fulfill({ status: 200, contentType: 'text/html', body })));
  const recoveredPopup = await context.newPage();
  await recoveredPopup.goto(`chrome-extension://${id}/popup.html`);
  await recoveredPopup.getByText('Connected & Filtering', { exact: true }).waitFor();
  const recoveredPage = await context.newPage(); await recoveredPage.goto('https://www.linkedin.com/feed/');
  await recoveredPage.locator('#ai-body.qf-reply-collapsed').waitFor({ state: 'attached' });
  assert.equal(await worker.evaluate(() => chrome.storage.local.get('token').then(data => data.token === 'b'.repeat(48))), true, 'reload repairs the stale pairing before filtering');
  assert.equal(await recoveredPage.evaluate(async url => { try { return (await fetch(url)).ok; } catch { return false; } }, `chrome-extension://${id}/local-connection.json`), false, 'websites cannot read the local pairing file');
  console.log(JSON.stringify({ passed: true, fixtureRequests: analysed.length, checks: ['original posts never analysed or labelled', 'legacy and SDUI comments', 'nested replies preserved and independently filtered', 'short AI-style replies', 'duplicate-wrapper and text-cache deduplication', 'edit and stale-response handling', 'dynamic loading', 'show/hide reply', 'pause restores content and clears UI', 'no slider or Why This Result', 'promoted posts preserved', 'draft/message exclusion', 'API failures fail open', 'budget and reset', 'legacy settings migration', 'posts a week or older collapsed and revealable on the feed only', 'recent, recently reposted and undated posts preserved', 'older-posts toggle persists', 'feed filter row beneath Sort by: promoted and age switches, 7/14/30/90 day choice saved', 'synthetic page events cannot change filters', 'suggested and activity posts collapsed by header label', 'engagement-bait format opt-in', 'whole-word mute words', 'News and Puzzles modules removable', 'post filters work with no companion', 'legacy/SDUI/dynamic Videos for you modules removed', 'video-title mentions and neighbouring posts preserved', 'video section restored on pause or title change', 'missing and rejected pairing never consume allowance', 'automatic recovery from stale pairing', 'automatic connection after browser restart', 'local pairing file inaccessible to websites', 'trusted-click feedback only', 'short reply flags persist across reloads', 'keep corrections override model flags', 'future replies use saved preferences', 'late inference cannot override feedback', 'reset learning clears decisions'] }, null, 2));
} finally { await context?.close(); await new Promise(resolve => server.close(resolve)); }
