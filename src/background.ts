import { API, BUILD_VERSION, DEFAULTS, EMPTY_FEEDBACK, FEED_FILTER_KEYS, MAX_TEXT, MIN_TEXT, VERSION, cleanSettings, normalise, type FeedbackIndex, type Settings, type Verdict } from './shared.ts';

const ready = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
]).then(async () => {
  await restoreLocalPairing();
  const previous = await chrome.storage.session.get('classifierVersion');
  if (previous.classifierVersion !== VERSION) {
    await chrome.storage.session.set({ classifierVersion: VERSION, cache: {}, analysed: 0, requests: 0, lastError: '' });
  }
  await chrome.storage.local.set({ settings: await settings() });
});
let queue = Promise.resolve();
class CompanionError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
async function settings(): Promise<Settings> { return cleanSettings((await chrome.storage.local.get('settings')).settings as Partial<Settings> | undefined); }
// Callers send only the fields they own, so the popup and the feed filter row never overwrite each other.
async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const config = cleanSettings({ ...(await settings()), ...patch });
  await chrome.storage.local.set({ settings: config });
  await broadcast({ type: 'settingsChanged', settings: config });
  return config;
}
async function feedbackIndex(): Promise<FeedbackIndex> { return ((await chrome.storage.local.get('feedbackIndex')).feedbackIndex as FeedbackIndex) || EMPTY_FEEDBACK; }
async function syncFeedback(index: FeedbackIndex | undefined) {
  if (!index || !Number.isSafeInteger(index.revision) || !index.decisions) return;
  const previous = await feedbackIndex();
  await chrome.storage.local.set({ feedbackIndex: index });
  if (previous.revision !== index.revision) await chrome.storage.session.set({ cache: {} });
}
async function digestText(text: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))).map(x => x.toString(16).padStart(2, '0')).join('');
}
async function restoreLocalPairing(): Promise<boolean> {
  try {
    // Written by the local launcher, never shipped in a release or exposed via
    // web_accessible_resources. Contains only the loopback pairing token.
    const file = await fetch(chrome.runtime.getURL('local-connection.json'), { cache: 'no-store' });
    if (!file.ok) return false;
    const local = await file.json();
    if (typeof local.token !== 'string' || !/^[a-f0-9]{48}$/.test(local.token)) return false;
    const check = await fetch(API + '/health', { headers: { Authorization: `Bearer ${local.token}` }, signal: AbortSignal.timeout(3000), redirect: 'error' });
    if (!check.ok) return false;
    const health = await check.json();
    if (health.classifierVersion !== VERSION) return false;
    await syncFeedback(health.feedback);
    await chrome.storage.local.set({ token: local.token });
    const previous = await chrome.storage.session.get('lastError');
    if (/^(Pair |Connect )/.test(String(previous.lastError || ''))) await chrome.storage.session.set({ lastError: '' });
    return true;
  } catch { return false; }
}
async function companion(path: string, body?: unknown) {
  let { token } = await chrome.storage.local.get('token');
  if (!token && await restoreLocalPairing()) token = (await chrome.storage.local.get('token')).token;
  if (!token) throw new CompanionError('Connect the companion from the extension settings.', 401);
  const request = () => fetch(API + path, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(28000), redirect: 'error',
  });
  let response = await request();
  if (response.status === 401 && await restoreLocalPairing()) {
    token = (await chrome.storage.local.get('token')).token;
    response = await request();
  }
  const data = await response.json();
  if (!response.ok) throw new CompanionError(data.error || 'Companion unavailable. Replies remain visible.', response.status);
  if (path === '/health' && data.classifierVersion !== VERSION) throw new Error('Companion update needed. Run Stop Quiet Feed, then Start Quiet Feed.');
  if (path === '/health') await syncFeedback(data.feedback);
  return data;
}
function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /^(Connect |Pair |TypeSafe |Daily limit|Companion |Set TYPESAFE|Analysis unavailable|Session limit|Filtering paused|Reply |Feedback |Invalid )/.test(message)
    ? message : 'Companion offline. Start Quiet Feed on this computer; replies remain visible.';
}
async function analyse(raw: string) {
  const config = await settings();
  if (!config.enabled) throw new Error('Filtering paused.');
  if (typeof raw !== 'string' || raw.length > MAX_TEXT) throw new Error('Reply length is outside the supported range');
  const text = normalise(raw);
  const id = await digestText(text);
  const feedback = await feedbackIndex();
  if (feedback.decisions[id]) return { manualDecision: feedback.decisions[id], feedbackRevision: feedback.revision };
  if (text.length < MIN_TEXT) return { skipped: true, feedbackRevision: feedback.revision };
  const digest = `${VERSION}:${feedback.revision}:${id}`;
  const stored = await chrome.storage.session.get(['cache', 'analysed', 'requests']);
  const cache = (stored.cache || {}) as Record<string, Verdict>;
  if (cache[digest]) return cache[digest];
  if (Number(stored.requests || 0) >= config.limit) throw new Error('Session limit reached. Reset the session in the extension to continue.');
  await chrome.storage.session.set({ requests: Number(stored.requests || 0) + 1 });
  let result: Verdict;
  try { result = await companion('/analyse-reply-v3', { text }); }
  catch (error) {
    // These local rejections occur before inference. Network/time-out/provider
    // failures remain counted because their upstream billing state is uncertain.
    if (error instanceof CompanionError && [401, 403, 404].includes(error.status)) {
      const current = await chrome.storage.session.get('requests');
      await chrome.storage.session.set({ requests: Math.max(0, Number(current.requests || 0) - 1) });
    }
    throw error;
  }
  const latestFeedback = await feedbackIndex();
  if (latestFeedback.decisions[id]) result = { manualDecision: latestFeedback.decisions[id], feedbackRevision: latestFeedback.revision };
  if (latestFeedback.revision === feedback.revision) {
    cache[digest] = result;
    await chrome.storage.session.set({ cache: Object.fromEntries(Object.entries(cache).slice(-500)) });
  }
  const current = await chrome.storage.session.get('analysed');
  await chrome.storage.session.set({ analysed: Number(current.analysed || 0) + 1, lastError: '' });
  return result;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  const source = sender.url || '';
  const popup = source === chrome.runtime.getURL('popup.html');
  const linkedinHost = source.startsWith('https://www.linkedin.com/');
  const linkedin = /^https:\/\/www\.linkedin\.com\/(feed(?:\/|$)|posts\/|in\/)/.test(source);
  const task = async () => {
    await ready;
    if (message.type === 'settings' && (popup || linkedinHost)) return { settings: await settings(), build: BUILD_VERSION };
    if (message.type === 'analyse' && message.kind === 'reply' && linkedin) return { verdict: await analyse(message.text) };
    if (message.type === 'feedback' && linkedin) {
      if (typeof message.text !== 'string' || !normalise(message.text) || message.text.length > MAX_TEXT || !['potential-ai','keep'].includes(message.label)) throw new Error('Invalid feedback');
      const text = normalise(message.text);
      const result = await companion('/feedback', { text, label: message.label });
      await syncFeedback(result.feedback);
      await broadcast({ type: 'feedbackChanged', text, label: message.label, revision: result.feedback.revision });
      return { verdict: { manualDecision: message.label, feedbackRevision: result.feedback.revision }, feedback: result.feedback };
    }
    if (message.type === 'saveFilters' && linkedin) {
      const patch: Record<string, unknown> = {};
      for (const key of FEED_FILTER_KEYS) patch[key] = message.settings?.[key];
      return { settings: await saveSettings(patch) };
    }
    if (!popup) throw new Error('Invalid extension request');
    if (message.type === 'status') {
      const local = await chrome.storage.local.get('token');
      const session = await chrome.storage.session.get(['analysed', 'requests', 'lastError']);
      let health = null, error = '';
      try { health = await companion('/health'); } catch (e) { error = safeError(e); }
      return { settings: await settings(), paired: Boolean(local.token), session, health, error, feedback: await feedbackIndex(), build: BUILD_VERSION };
    }
    if (message.type === 'save') return { settings: await saveSettings(message.settings) };
    if (message.type === 'pair') {
      if (typeof message.token !== 'string' || !/^[a-f0-9]{48}$/.test(message.token.trim())) throw new Error('Invalid pairing code. Copy the code from Start Quiet Feed.');
      const previous = (await chrome.storage.local.get('token')).token;
      await chrome.storage.local.set({ token: message.token.trim() });
      try { await companion('/health'); } catch (e) { if (previous) await chrome.storage.local.set({ token: previous }); else await chrome.storage.local.remove('token'); throw e; }
      await chrome.storage.session.set({ lastError: '' });
      await retryTabs();
      return { ok: true };
    }
    if (message.type === 'reset') {
      await chrome.storage.session.set({ analysed: 0, requests: 0, lastError: '' });
      await retryTabs();
      return { ok: true };
    }
    if (message.type === 'clearFeedback') {
      const result = await companion('/feedback/clear', {});
      await syncFeedback(result.feedback);
      await broadcast({ type: 'feedbackReset' });
      return { feedback: result.feedback };
    }
    throw new Error('Invalid extension request');
  };
  // Serialise analysis across tabs so the request budget survives concurrent arrivals.
  const job = message.type === 'analyse' ? queue.then(task) : task();
  if (message.type === 'analyse') queue = job.then(() => {}, () => {});
  job.then(respond).catch(async error => {
    const message = safeError(error);
    await chrome.storage.session.set({ lastError: message });
    respond({ error: message });
  });
  return true;
});
async function retryTabs() {
  await broadcast({ type: 'retry' });
}
async function broadcast(message: unknown) {
  for (const tab of await chrome.tabs.query({ url: 'https://www.linkedin.com/*' })) {
    if (tab.id) chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  }
}
chrome.runtime.onInstalled.addListener(() => { chrome.storage.local.get('settings').then(data => { if (!data.settings) return chrome.storage.local.set({ settings: DEFAULTS }); }); });
