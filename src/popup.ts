import { BUILD_VERSION, DEFAULTS, type Settings } from './shared.ts';
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
  $<HTMLInputElement>('limit').value = String(config.limit);
  $('analysed').textContent = String(state.session.analysed || 0);
  $('remaining').textContent = String(Math.max(0, config.limit - (state.session.requests || 0)));
  $('feedbackCounts').textContent = `${state.feedback?.potentialAI || 0} flagged · ${state.feedback?.kept || 0} kept`;
  $<HTMLButtonElement>('clearFeedback').disabled = !(state.feedback?.potentialAI || state.feedback?.kept);
  const online = state.health?.configured;
  const needsAttention = Boolean(online && config.enabled && state.session.lastError);
  $('dot').classList.toggle('online', Boolean(online && !needsAttention));
  $('connection').textContent = online ? (config.enabled ? (needsAttention ? 'Connected · Needs Attention' : 'Connected & Filtering') : 'Connected · Paused') : (state.health ? 'API Key Needed' : 'Connect Your Companion');
  $('connectionDetail').textContent = needsAttention ? state.session.lastError : online ? 'TypeSafe is ready. Open a comment thread to begin.' : (state.error || 'Set your TypeSafe API key and restart the companion.');
  // Connection errors are already shown prominently above the controls.
  $('message').textContent = '';
  if (!state.paired || !online || needsAttention) $<HTMLDetailsElement>('settingsPanel').open = true;
}
async function save() {
  const next: Settings = {
    enabled: $<HTMLInputElement>('enabled').checked,
    hideRecommendedJobs: $<HTMLInputElement>('hideRecommendedJobs').checked,
    limit: Number($<HTMLInputElement>('limit').value),
  };
  await send({ type: 'save', settings: next }); config = next;
  $('message').textContent = 'Saved. Open comments update automatically.';
}
for (const id of ['enabled', 'hideRecommendedJobs', 'limit']) $(id).addEventListener('change', () => { void save().catch(showError); });
$('pair').addEventListener('click', async () => {
  const button = $<HTMLButtonElement>('pair'); button.disabled = true;
  try { await send({ type: 'pair', token: $<HTMLInputElement>('token').value }); $<HTMLInputElement>('token').value = ''; await status(); $('message').textContent = 'Connected. Your feed is ready.'; }
  catch (e) { showError(e); } finally { button.disabled = false; }
});
$('reset').addEventListener('click', () => { void send({ type: 'reset' }).then(status).catch(showError); });
$('clearFeedback').addEventListener('click', () => {
  if (confirm('Clear your saved reply feedback? Future checks will use the default rules again.')) void send({ type: 'clearFeedback' }).then(status).catch(showError);
});
void status().catch(showError);
