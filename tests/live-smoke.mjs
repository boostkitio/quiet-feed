import { createApp } from '../src/server.ts';
import { writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const token = randomBytes(24).toString('hex');
if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY must be present');
const app = createApp({ key: process.env.TYPESAFE_API_KEY, token, dailyLimit: 3 });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`;
const examples = [
  { name: 'assistant-residue-reply', text: 'As an AI language model, I do not have personal experiences, but I can provide a thoughtful LinkedIn reply: Your insights beautifully underscore the transformative power of authentic leadership. By fostering collaboration and embracing a growth mindset, we can collectively unlock meaningful impact in an ever-evolving landscape.' },
  { name: 'formulaic-engagement-reply', text: 'Absolutely! This is such a powerful reminder that true innovation is not just about technology, it is about people. Your perspective beautifully highlights the importance of fostering a culture of collaboration, embracing change, and unlocking collective potential. The intersection of purpose and progress is where real transformation happens. Thank you for sharing these invaluable insights!' },
  { name: 'specific-short-reply-control', text: 'Nice one, Sarah! Did you fix the timeout by moving the cleanup handler? Ours still fails after 30 seconds.' },
];
const results = [];
try {
  for (const example of examples) {
    const start = performance.now();
    const response = await fetch(base + '/analyse-reply-v3', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: example.text }) });
    const result = await response.json();
    results.push({ example: example.name, status: response.status, latencyMs: Math.round(performance.now() - start), ...result });
    if (!response.ok) break;
  }
  const health = await (await fetch(base + '/health', { headers: { Authorization: `Bearer ${token}` } })).json();
  const report = { testedAt: new Date().toISOString(), note: 'Synthetic integration smoke checks only. These are not a measured authorship-detection accuracy benchmark.', results, usage: health };
  await mkdir('work', { recursive: true });
  await writeFile('work/live-smoke.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (results.some(x => x.status !== 200)) process.exitCode = 1;
} finally { await new Promise(resolve => app.close(resolve)); }
