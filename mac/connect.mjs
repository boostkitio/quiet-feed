import { readFile, writeFile, rename, chmod, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function connectPairing(stateDir, extensionDir, { healthUrl = 'http://127.0.0.1:43127/health', attempts = 20, delayMs = 1000 } = {}) {
  if (!stateDir || !extensionDir) throw new Error('Quiet Feed paths missing.');
  const tokenFile = join(stateDir, 'pairing-token');
  let health;
  let token;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      token = (await readFile(tokenFile, 'utf8')).trim();
      if (!/^[a-f0-9]{48}$/.test(token)) throw new Error('Pairing token unavailable.');
      const response = await fetch(healthUrl, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(1500), redirect: 'error',
      });
      if (!response.ok) throw new Error('Companion pairing failed.');
      health = await response.json();
      if (health.ok && health.configured) break;
    } catch { /* LaunchAgent may still be starting. */ }
    if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  if (!health?.ok || !health.configured) throw new Error('Companion did not become ready. Check the QuietFeed log in Library/Application Support.');
  const file = join(extensionDir, 'local-connection.json');
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ token }), { mode: 0o600 });
    await rename(temporary, file);
    await chmod(file, 0o600);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  return { ok: true, configured: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await connectPairing(...process.argv.slice(2));
  console.log('Quiet Feed is connected. Your TypeSafe key stays in macOS Keychain.');
}
