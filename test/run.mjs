import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testRoot = dirname(fileURLToPath(import.meta.url));
const repo = resolve(testRoot, '..');
const fixture = resolve(testRoot, '.fixture');
mkdirSync(fixture, { recursive: true });
for (const [source, destination] of [['index.js', 'host.mjs'], ['client.js', 'client.js'], ['discovery.js', 'discovery.js']]) {
  copyFileSync(resolve(repo, source), resolve(fixture, destination));
}
for (const name of ['regression.test.mjs', 'session-discovery.test.mjs']) {
  copyFileSync(resolve(testRoot, name), resolve(fixture, name));
}
await import(pathToFileURL(resolve(fixture, 'session-discovery.test.mjs')).href);
