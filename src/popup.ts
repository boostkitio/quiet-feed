import { BUILD_VERSION, DEFAULTS, cleanMuteWords, type Settings } from './shared.ts';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let config = DEFAULTS;
async function send(message: unknown) { const result = await chrome.runtime.sendMessage(message); if (result?.error) throw new Error(result.error); return result; }
function showError(error: unknown) { $('message').textContent = error instanceof Error ? error.message : 'Unable to save. Please try again.'; }
async function status() {
  const state = await chrome.runtime.sendMessage({ type: 'status' });
  if (state.error && !state.settings) throw new Error(state.error);
  const updateNeeded = state.build !== BUILD_VERSION;
  if (updateNeeded) {
    $('connection').textContent = 'Update Ready';
    $('connectionDetail').textContent = 'Open chrome://extensions, click Reload on Quiet Feed, then refresh LinkedIn. The new page controls need the updated background worker.';
    for (const control of document.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')) control.disabled = true;
    return;
  }
  config = state.settings;
  $<HTMLInputElement>('enabled').checked = config.enabled;
  $<HTMLInputElement>('hideRecommendedJobs').checked = config.hideRecommendedJobs;
  $<HTMLInputElement>('hideOldPosts').checked = config.hideOldPosts;
  $<HTMLInputElement>('hideSidebar').checked = config.hideSidebar;
  $<HTMLInputElement>('muteWords').value = config.muteWords.join(', ');
  $<HTMLInputElement>('limit').value = String(config.limit);
  $('analysed').textContent = String(state.session.analysed || 0);
  $('remaining').textContent = String(Math.max(0, config.limit - (state.session.requests || 0)));
  $('feedbackCounts').textContent = `${state.feedback?.potentialAI || 0} flagged · ${state.feedback?.kept || 0} kept`;
  $<HTMLButtonElement>('clearFeedback').disabled = !(state.feedback?.potentialAI || state.feedback?.kept);
  const online = state.health?.configured;
  const direct = Boolean(state.health?.direct);
  // Post filters need nothing else. Reply checking is an optional extra, so its absence is not an error.
  const optional = !state.health && /^(Connect |Companion offline)/.test(state.error || '');
  const needsAttention = Boolean(online && config.enabled && state.session.lastError);
  $('dot').classList.toggle('online', Boolean((online && !needsAttention) || (optional && config.enabled)));
  $('connection').textContent = online ? (config.enabled ? (needsAttention ? 'Connected · Needs Attention' : direct ? 'Filtering Posts & Replies' : 'Connected & Filtering') : 'Connected · Paused')
    : state.health ? 'API Key Needed' : optional ? (config.enabled ? 'Filtering Posts' : 'Paused') : 'Connect Your Companion';
  $('connectionDetail').textContent = needsAttention ? state.session.lastError : online ? (direct ? 'Using your TypeSafe key. Open a comment thread to begin.' : 'TypeSafe is ready. Open a comment thread to begin.')
    : optional ? 'Post filters are working. To also hide AI-style replies, add a TypeSafe key under AI Reply Filter.' : (state.error || 'Set your TypeSafe API key and restart the companion.');
  $<HTMLButtonElement>('removeKey').hidden = !direct;
  $<HTMLInputElement>('apiKey').placeholder = direct ? 'A key is saved in this browser' : 'Paste your TypeSafe key';
  // Connection errors are already shown prominently above the controls.
  $('message').textContent = '';
  if (!optional && (!state.paired && !direct || !online || needsAttention)) $<HTMLDetailsElement>('settingsPanel').open = true;
}
async function save() {
  const next: Partial<Settings> = {
    enabled: $<HTMLInputElement>('enabled').checked,
    hideRecommendedJobs: $<HTMLInputElement>('hideRecommendedJobs').checked,
    hideOldPosts: $<HTMLInputElement>('hideOldPosts').checked,
    hideSidebar: $<HTMLInputElement>('hideSidebar').checked,
    muteWords: cleanMuteWords($<HTMLInputElement>('muteWords').value),
    limit: Number($<HTMLInputElement>('limit').value),
  };
  config = (await send({ type: 'save', settings: next })).settings;
  $('message').textContent = 'Saved. Open LinkedIn tabs update automatically.';
}
for (const id of ['enabled', 'hideRecommendedJobs', 'hideOldPosts', 'hideSidebar', 'muteWords', 'limit']) $(id).addEventListener('change', () => { void save().catch(showError); });
$('pair').addEventListener('click', async () => {
  const button = $<HTMLButtonElement>('pair'); button.disabled = true;
  try { await send({ type: 'pair', token: $<HTMLInputElement>('token').value }); $<HTMLInputElement>('token').value = ''; await status(); $('message').textContent = 'Connected. Your feed is ready.'; }
  catch (e) { showError(e); } finally { button.disabled = false; }
});
$('saveKey').addEventListener('click', async () => {
  const button = $<HTMLButtonElement>('saveKey'); button.disabled = true;
  try { await send({ type: 'saveKey', key: $<HTMLInputElement>('apiKey').value }); $<HTMLInputElement>('apiKey').value = ''; await status(); $('message').textContent = 'Key saved. Reply checking is on.'; }
  catch (e) { showError(e); } finally { button.disabled = false; }
});
$('removeKey').addEventListener('click', () => { void send({ type: 'removeKey' }).then(status).then(() => { $('message').textContent = 'Key removed from this browser.'; }).catch(showError); });
$('reset').addEventListener('click', () => { void send({ type: 'reset' }).then(status).catch(showError); });
$('clearFeedback').addEventListener('click', () => {
  if (confirm('Clear your saved reply feedback? Future checks will use the default rules again.')) void send({ type: 'clearFeedback' }).then(status).catch(showError);
});
void status().catch(showError);
