import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testRoot = dirname(fileURLToPath(import.meta.url));
const repo = resolve(testRoot, '..');
const fixture = resolve(testRoot, '.fixture');
mkdirSync(fixture, { recursive: true });
for (const [source, destination] of [['index.js', 'host.mjs'], ['client.js', 'client.js'], ['discovery.js', 'discovery.js'], ['compatibility.js', 'compatibility.js'], ['package.json', 'package.json']]) {
  copyFileSync(resolve(repo, source), resolve(fixture, destination));
}
for (const name of ['regression.test.mjs', 'session-discovery.test.mjs', 'compatibility.test.mjs']) {
  copyFileSync(resolve(testRoot, name), resolve(fixture, name));
}
const runtimeFixture = resolve(fixture, 'node_modules/@deepseek-ai/dsh');
mkdirSync(runtimeFixture, { recursive: true });
writeFileSync(resolve(runtimeFixture, 'package.json'), JSON.stringify({
  name: '@deepseek-ai/dsh', version: '0.2.0-rc.2', type: 'module',
  exports: { './package.json': './package.json' },
}) + '\n');
await import(pathToFileURL(resolve(fixture, 'compatibility.test.mjs')).href);
