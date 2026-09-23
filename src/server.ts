import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { API, MAX_TEXT, MIN_TEXT, VERSION, makeRequest, normalise, parseVerdict, type Verdict } from './shared.ts';
import { FeedbackStore } from './feedback.ts';

export type AppOptions = { key: string; token: string; model?: string; fetcher?: typeof fetch; dailyLimit?: number; feedback?: FeedbackStore };
export function createApp(options: AppOptions) {
  const feedback = options.feedback ?? new FeedbackStore();
  const cache = new Map<string, { result: Verdict; time: number }>();
  const pending = new Map<string, Promise<Verdict>>();
  let used = 0, day = new Date().toISOString().slice(0, 10), active = 0, cooldown = 0;
  const stats = { requests: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0 };
  const diagnostics = { receivedAnalyses: 0, authFailures: 0, originFailures: 0, outdatedRequests: 0, lastFailure: '' };
  const tokenMatches = (provided: string) => {
    const a = Buffer.from(provided), b = Buffer.from(options.token);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  async function evaluate(text: string): Promise<Verdict> {
    const manualDecision = feedback.lookup(text);
    if (manualDecision) return { manualDecision, feedbackRevision: feedback.revision };
    const revision = feedback.revision;
    const examples = feedback.examples();
    const key = createHash('sha256').update(VERSION + ':' + revision + ':' + text).digest('hex');
    const cached = cache.get(key);
    if (cached && Date.now() - cached.time < 24 * 3600000) { stats.cacheHits++; return { ...cached.result, cached: true }; }
    if (pending.has(key)) return pending.get(key)!;
    const today = new Date().toISOString().slice(0, 10);
    if (today !== day) { day = today; used = 0; }
    if (used >= (options.dailyLimit ?? 500)) throw new Error('Daily limit reached. Try again tomorrow.');
    if (Date.now() < cooldown) throw new Error('TypeSafe is cooling down after a rate limit. Try again in a minute.');
    if (active >= 2) throw new Error('Companion busy. Try again shortly.');
    used++; active++; stats.requests++;
    const task = (async () => {
      try {
        const response = await (options.fetcher ?? fetch)('https://api.typesafe.ai/v1/systemone', {
          method: 'POST', headers: { Authorization: `Bearer ${options.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(makeRequest(text, options.model, examples)), signal: AbortSignal.timeout(25000), redirect: 'error',
        });
        if (response.status === 429 || response.status === 529) { cooldown = Date.now() + 60000; throw new Error('TypeSafe rate limit. Try again in a minute.'); }
        if (response.status === 401 || response.status === 403) throw new Error('TypeSafe rejected the API key. Update it on this computer.');
        if (!response.ok) throw new Error(`TypeSafe request failed (HTTP ${response.status}). Replies remain visible.`);
        const payload = await response.json() as Record<string, unknown>;
        const verdict = { ...parseVerdict(payload, examples.length > 0), feedbackRevision: revision };
        const usage = payload.usage as { input_tokens?: number; output_tokens?: number } | undefined;
        stats.inputTokens += Number(usage?.input_tokens) || 0;
        stats.outputTokens += Number(usage?.output_tokens) || 0;
        cache.set(key, { result: verdict, time: Date.now() });
        if (cache.size > 1000) cache.delete(cache.keys().next().value!);
        const latestDecision = feedback.lookup(text);
        return latestDecision ? { manualDecision: latestDecision, feedbackRevision: feedback.revision } : verdict;
      } finally { active--; pending.delete(key); }
    })();
    pending.set(key, task);
    return task;
  }
  return http.createServer(async (req, res) => {
    const send = (status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
    // Exact loopback host prevents DNS rebinding. No web origin can read or invoke this API.
    if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host ?? '')) return send(403, { error: 'Host not allowed' });
    const origin = req.headers.origin;
    if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) { diagnostics.originFailures++; diagnostics.lastFailure = 'origin'; return send(403, { error: 'Origin not allowed' }); }
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' }); return res.end(); }
    if (!tokenMatches((req.headers.authorization ?? '').replace(/^Bearer /, ''))) { diagnostics.authFailures++; diagnostics.lastFailure = 'pairing'; return send(401, { error: 'Pair the extension with the companion code.' }); }
    if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true, configured: Boolean(options.key), classifierVersion: VERSION, feedback: feedback.index(), ...stats, diagnostics, remaining: Math.max(0, (options.dailyLimit ?? 500) - used) });
    if (req.method === 'POST' && req.url === '/feedback/clear') {
      try { return send(200, { feedback: feedback.clear() }); }
      catch { return send(503, { error: 'Feedback could not be saved. Your previous feedback is unchanged.' }); }
    }
    // Reject requests from old post-filtering bundles after a companion update.
    if (req.method !== 'POST' || !['/analyse-reply-v3', '/feedback'].includes(req.url ?? '')) { diagnostics.outdatedRequests++; diagnostics.lastFailure = 'endpoint'; return send(404, { error: 'Companion endpoint changed. Reload Quiet Feed and refresh LinkedIn.' }); }
    if (req.url === '/analyse-reply-v3') diagnostics.receivedAnalyses++;
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return send(415, { error: 'JSON required' });
    try {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) { size += chunk.length; if (size > 60000) { send(413, { error: 'Reply too long' }); req.destroy(); return; } chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (typeof body.text !== 'string') return send(400, { error: 'Reply text required' });
      const text = normalise(body.text);
      if (req.url === '/feedback') {
        if (!text || text.length > MAX_TEXT || !['potential-ai','keep'].includes(body.label)) return send(400, { error: 'Invalid feedback' });
        try { return send(200, { feedback: feedback.save(text, body.label) }); }
        catch { return send(503, { error: 'Feedback could not be saved. Your previous feedback is unchanged.' }); }
      }
      if ((text.length < MIN_TEXT && !feedback.lookup(text)) || text.length > MAX_TEXT) return send(400, { error: 'Reply length is outside the supported range' });
      if (!options.key && !feedback.lookup(text)) return send(503, { error: 'Set TYPESAFE_API_KEY on this computer and restart the companion.' });
      return send(200, await evaluate(text));
    } catch (error) {
      if (error instanceof SyntaxError) return send(400, { error: 'Invalid JSON' });
      const message = error instanceof Error ? error.message : '';
      // Never return upstream response bodies, request headers, or credentials.
      const safe = /^(Daily limit|TypeSafe|Companion busy|Invalid TypeSafe)/.test(message) ? message : 'Analysis unavailable. Replies remain visible.';
      return send(503, { error: safe });
    }
  });
}

export function start() {
  const stateDir = process.env.QUIET_FEED_STATE_DIR || join(process.env.LOCALAPPDATA || process.cwd(), 'QuietFeed');
  mkdirSync(stateDir, { recursive: true });
  const tokenFile = join(stateDir, 'pairing-token');
  let token: string;
  try { token = readFileSync(tokenFile, 'utf8').trim(); if (!/^[a-f0-9]{48}$/.test(token)) throw new Error('invalid'); }
  catch { token = randomBytes(24).toString('hex'); writeFileSync(tokenFile, token, { mode: 0o600 }); }
  const app = createApp({ key: process.env.TYPESAFE_API_KEY ?? '', token, model: process.env.TYPESAFE_MODEL || 'jev-latest', feedback: new FeedbackStore(join(stateDir, 'feedback.json')) });
  app.requestTimeout = 30000;
  app.on('error', (error: NodeJS.ErrnoException) => { console.error(error.code === 'EADDRINUSE' ? 'Quiet Feed is already running on port 43127.' : 'Unable to start the local companion.'); process.exitCode = 1; });
  app.listen(43127, '127.0.0.1', () => console.log(`Quiet Feed companion running at ${API}. Pairing code is in ${tokenFile}.`));
  return app;
}
