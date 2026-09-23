import { build } from 'esbuild';
import { cp, mkdir, readFile } from 'node:fs/promises';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
await mkdir('dist/extension', { recursive: true });
await cp('extension', 'dist/extension', { recursive: true });
for (const name of ['background', 'popup', 'content']) {
  await build({ entryPoints: [`src/${name}.ts`], outfile: `dist/extension/${name}.js`, bundle: true, format: name === 'background' ? 'esm' : 'iife', target: 'chrome120', define: { __QUIET_FEED_BUILD__: JSON.stringify(version) } });
}
await build({ entryPoints: ['src/server-entry.ts'], outfile: 'dist/server.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node24' });
console.log('Built extension code and companion. Use scripts/package.ps1 for releases excluding private local connection files.');
