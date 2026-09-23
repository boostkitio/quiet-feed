import { BUILD_VERSION, DEFAULTS, PREFERENCE_THRESHOLD, cleanSettings, flagged, type FeedbackLabel, type Settings, type Verdict } from './shared.ts';
import { POSTS, COMMENTS, EXCLUDED, containsPromoted, replyNodes, replyText, videoRecommendationSections, jobRecommendationSections } from './dom.ts';

type Base = { revealed: boolean; host: HTMLElement; signature: string };
type Reply = Base & { text: string; verdict?: Verdict; visible: boolean; pending: boolean; failed: boolean; saving?: boolean; error?: string; feedbackGeneration: number };
type Post = Base & { promoted: boolean };
const replies = new Map<HTMLElement, Reply>();
const posts = new Map<HTMLElement, Post>();
const videoSections = new Set<HTMLElement>();
const jobSections = new Set<HTMLElement>();
let config: Settings = DEFAULTS;
let running = false;
let workerCompatible = false;
const supported = () => /^\/(feed(?:\/|$)|posts\/|in\/)/.test(location.pathname);
const styles = `:host{display:block;font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#385247}:host([hidden]){display:none!important}*{box-sizing:border-box}.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0}.post{padding:10px 14px}span{font-weight:500}button{font:600 12px "Segoe UI",sans-serif;cursor:pointer;background:transparent;color:#315d48;border:1px solid #cedbd1;border-radius:6px;padding:5px 9px;white-space:nowrap}button:hover{background:#edf4ed}button:focus-visible{outline:2px solid #315d48;outline-offset:3px}`;
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) { const record = replies.get(entry.target as HTMLElement); if (record) record.visible = entry.isIntersecting; }
  void processQueue();
}, { rootMargin: '200px' });

function newHost(kind: 'post' | 'reply'): HTMLElement {
  const host = document.createElement(kind === 'post' ? 'div' : 'span');
  host.className = kind === 'post' ? 'qf-host' : 'qf-reply-host';
  host.hidden = true; host.attachShadow({ mode: 'open' });
  return host;
}
function render(record: Base, show: boolean, hide: boolean, kind: 'post' | 'reply', toggle: () => void) {
  record.host.hidden = !show;
  const signature = JSON.stringify([show, hide, kind]);
  if (signature === record.signature) return;
  record.signature = signature;
  const shadow = record.host.shadowRoot!; shadow.replaceChildren();
  if (!show) return;
  const style = document.createElement('style'); style.textContent = styles;
  const bar = document.createElement('span'); bar.className = kind === 'post' ? 'bar post' : 'bar';
  const label = document.createElement('span');
  label.textContent = kind === 'post' ? 'Contains “promoted”' : 'Likely AI Reply';
  const button = document.createElement('button');
  button.textContent = `${hide ? 'Show' : 'Hide'} ${kind === 'post' ? 'Post' : 'Reply'}`;
  button.setAttribute('aria-expanded', String(!hide)); button.addEventListener('click', toggle);
  bar.append(label, button); shadow.append(style, bar);
}
function paintPost(root: HTMLElement, record: Post) {
  const show = config.enabled && supported() && record.promoted;
  const hide = show && !record.revealed;
  root.classList.toggle('qf-collapsed', hide);
  if (show && record.host.parentElement !== root) root.prepend(record.host);
  render(record, show, hide, 'post', () => { record.revealed = !record.revealed; paintPost(root, record); });
}
function paintReply(body: HTMLElement, record: Reply) {
  const active = config.enabled && supported() && workerCompatible;
  const matched = Boolean(record.verdict && flagged(record.verdict));
  const hide = active && matched && !record.revealed;
  record.host.classList.toggle('qf-optional-feedback', !matched && !record.verdict?.manualDecision);
  body.parentElement?.classList.add('qf-feedback-area');
  // Only collapse this body: keep the author, controls and nested conversation.
  body.classList.toggle('qf-reply-collapsed', hide);
  if (active) {
    if (matched && (record.host.parentElement !== body.parentElement || record.host.nextSibling !== body)) body.before(record.host);
    else if (!matched && (record.host.parentElement !== body.parentElement || record.host.previousSibling !== body)) body.after(record.host);
  }
  record.host.hidden = !active;
  const signature = JSON.stringify([active, matched, hide, record.verdict?.manualDecision, record.verdict?.signals?.preference, record.saving, record.error]);
  if (signature === record.signature) return;
  record.signature = signature;
  const shadow = record.host.shadowRoot!; shadow.replaceChildren();
  if (!active) return;
  const style = document.createElement('style'); style.textContent = styles + '.feedback{justify-content:flex-end;padding:2px 0}.feedback button{border:0;padding:2px;font-size:11px;color:#6b7b71;font-weight:400}.actions{display:flex;gap:7px;flex-wrap:wrap}.error{display:block;color:#8a402a;font-size:11px}';
  const bar = document.createElement('span'); bar.className = matched ? 'bar' : 'bar feedback';
  const actions = document.createElement('span'); actions.className = 'actions';
  if (matched) {
    const label = document.createElement('span');
    label.textContent = record.verdict?.manualDecision === 'potential-ai' ? 'Flagged By You' : (record.verdict?.signals?.preference ?? 0) >= PREFERENCE_THRESHOLD ? 'Matches Your Feedback' : 'Likely AI Reply';
    const reveal = document.createElement('button'); reveal.textContent = hide ? 'Show Reply' : 'Hide Reply'; reveal.setAttribute('aria-expanded', String(!hide));
    reveal.addEventListener('click', () => { record.revealed = !record.revealed; paintReply(body, record); });
    actions.append(reveal); bar.append(label);
  } else if (record.verdict?.manualDecision === 'keep') {
    const label = document.createElement('span'); label.textContent = 'Kept By You'; bar.append(label);
  }
  const feedback = document.createElement('button');
  feedback.textContent = record.saving ? 'Saving…' : matched ? 'Keep This Reply' : 'Flag As Potentially AI';
  feedback.disabled = Boolean(record.saving);
  feedback.addEventListener('click', event => { if (event.isTrusted) void saveFeedback(body, record, matched ? 'keep' : 'potential-ai'); });
  actions.append(feedback); bar.append(actions); shadow.append(style, bar);
  if (record.error) { const error = document.createElement('span'); error.className = 'error'; error.setAttribute('role','status'); error.textContent = record.error; shadow.append(error); }
}
async function saveFeedback(body: HTMLElement, record: Reply, label: FeedbackLabel) {
  if (!workerCompatible) return;
  if (record.saving) return;
  record.saving = true; record.error = ''; paintReply(body, record);
  const submitted = replyText(body);
  record.text = submitted;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'feedback', text: submitted, label });
    if (response.error) throw new Error(response.error);
    if (replyText(body) === submitted) { record.verdict = response.verdict; record.feedbackGeneration++; record.revealed = false; record.failed = false; }
  } catch (error) { record.error = error instanceof Error ? error.message : 'Feedback could not be saved. Try again.'; }
  finally { record.saving = false; paintReply(body, record); }
}
function scan() {
  const currentJobSections = new Set(supported() ? jobRecommendationSections() : []);
  for (const section of jobSections) {
    if (!currentJobSections.has(section)) { section.classList.remove('qf-jobs-hidden'); jobSections.delete(section); }
  }
  for (const section of currentJobSections) {
    jobSections.add(section); section.classList.toggle('qf-jobs-hidden', config.enabled && config.hideRecommendedJobs);
  }
  const currentVideoSections = new Set(supported() ? videoRecommendationSections() : []);
  for (const section of videoSections) {
    if (!currentVideoSections.has(section)) { section.classList.remove('qf-videos-hidden'); videoSections.delete(section); }
  }
  for (const section of currentVideoSections) {
    videoSections.add(section); section.classList.toggle('qf-videos-hidden', config.enabled);
  }
  if (!supported()) {
    for (const [root, record] of posts) paintPost(root, record);
    for (const [body, record] of replies) paintReply(body, record);
    return;
  }
  for (const [root, record] of posts) {
    if (!root.isConnected) { record.host.remove(); posts.delete(root); continue; }
    const promoted = containsPromoted(root);
    if (promoted !== record.promoted) { record.promoted = promoted; record.revealed = false; }
    paintPost(root, record);
  }
  for (const root of document.querySelectorAll<HTMLElement>(POSTS)) {
    if (posts.has(root) || root.parentElement?.closest(POSTS) || !root.closest('main') || root.closest(EXCLUDED)) continue;
    if (!containsPromoted(root)) continue;
    const record: Post = { promoted: true, revealed: false, host: newHost('post'), signature: '' };
    posts.set(root, record); paintPost(root, record);
  }
  for (const [body, record] of replies) {
    if (!body.isConnected || !body.closest(COMMENTS) || body.closest(EXCLUDED)) {
      body.classList.remove('qf-reply-collapsed'); record.host.remove(); observer.unobserve(body); replies.delete(body); continue;
    }
    const text = replyText(body);
    if (text !== record.text) { record.text = text; record.verdict = undefined; record.revealed = false; record.failed = false; record.error = ''; record.feedbackGeneration++; }
    paintReply(body, record);
  }
  for (const body of replyNodes()) {
    if (replies.has(body)) continue;
    const text = replyText(body);
    if (!text) continue;
    const record: Reply = { text, revealed: false, visible: false, pending: false, failed: false, host: newHost('reply'), signature: '', feedbackGeneration: 0 };
    replies.set(body, record); paintReply(body, record);
    observer.observe(body);
  }
  void processQueue();
}
async function processQueue() {
  if (running || !config.enabled || !supported() || !workerCompatible) return;
  running = true;
  try {
    for (const [body, record] of replies) {
      if (!config.enabled || !supported()) break;
      if (!body.isConnected || body.closest('.qf-collapsed, .qf-videos-hidden, .qf-jobs-hidden') || record.verdict || record.failed || record.pending || record.saving || !record.text) continue;
      record.pending = true;
      const submitted = record.text;
      const generation = record.feedbackGeneration;
      try {
        const response = await chrome.runtime.sendMessage({ type: 'analyse', kind: 'reply', text: submitted });
        if (replyText(body) !== submitted) { record.text = replyText(body); record.verdict = undefined; }
        else if (generation !== record.feedbackGeneration) { /* A newer explicit choice wins. */ }
        else if (response?.verdict) record.verdict = response.verdict;
        else record.failed = true;
      } catch { record.failed = true; }
      finally { record.pending = false; paintReply(body, record); }
    }
  } finally { running = false; }
}
chrome.runtime.onMessage.addListener(message => {
  if (message.type === 'settingsChanged') {
    config = message.settings;
    for (const record of replies.values()) record.failed = false;
    scan();
  }
  if (message.type === 'retry') { for (const record of replies.values()) record.failed = false; scan(); }
  if (message.type === 'feedbackChanged') {
    for (const [body, record] of replies) if (record.text === message.text && replyText(body) === message.text) {
      record.feedbackGeneration++; record.verdict = { manualDecision: message.label, feedbackRevision: message.revision }; record.revealed = false; record.failed = false; paintReply(body, record);
    }
  }
  if (message.type === 'feedbackReset') {
    for (const record of replies.values()) { record.feedbackGeneration++; record.verdict = undefined; record.revealed = false; record.failed = false; }
    scan();
  }
});
let debounce: ReturnType<typeof setTimeout>;
const mutations = new MutationObserver(changes => {
  if (changes.every(change => (change.target as Element).closest?.('.qf-host, .qf-reply-host') || (change.type === 'childList' && [...change.addedNodes, ...change.removedNodes].every(node => node instanceof Element && node.matches('.qf-host, .qf-reply-host'))))) return;
  clearTimeout(debounce); debounce = setTimeout(scan, 250);
});
void chrome.runtime.sendMessage({ type: 'settings' }).then(response => {
  if (response?.settings) config = cleanSettings(response.settings);
  workerCompatible = response?.build === BUILD_VERSION;
  document.documentElement.dataset.quietFeedBuild = BUILD_VERSION;
  document.documentElement.dataset.quietFeedWorkerBuild = response?.build || 'legacy';
  mutations.observe(document.body, { childList: true, subtree: true, characterData: true }); scan();
}).catch(() => {});
window.addEventListener('popstate', scan);
setInterval(scan, 3000);
