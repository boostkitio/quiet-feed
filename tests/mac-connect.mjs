import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { connectPairing } from '../mac/connect.mjs';

const base = resolve('work', `mac-connect-${randomUUID()}`);
const state = resolve(base, 'state');
const extension = resolve(base, 'extension');
await mkdir(state, { recursive: true });
await mkdir(extension, { recursive: true });
const token = 'd'.repeat(48);
await writeFile(resolve(state, 'pairing-token'), token);
let valid = false;
let requests = 0;
const server = http.createServer((req, res) => {
  requests++;
  assert.equal(req.url, '/health');
  assert.equal(req.headers.authorization, `Bearer ${token}`);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: valid, configured: valid }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const healthUrl = `http://127.0.0.1:${server.address().port}/health`;
try {
  await assert.rejects(connectPairing(state, extension, { healthUrl, attempts: 1 }), /did not become ready/);
  await assert.rejects(readFile(resolve(extension, 'local-connection.json')), { code: 'ENOENT' });
  // An unconfigured companion must not publish a pairing file.
  valid = true;
  await connectPairing(state, extension, { healthUrl, attempts: 1 });
  assert.deepEqual(JSON.parse(await readFile(resolve(extension, 'local-connection.json'), 'utf8')), { token });
  assert.equal(requests, 2);
  console.log('Passed: Mac pairing writes only after authenticated, configured health and never stores an API key in the extension.');
} finally {
  await new Promise(resolve => server.close(resolve));
}
