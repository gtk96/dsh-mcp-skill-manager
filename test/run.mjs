import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { testedRuntimeVersions } from '../compatibility.js';

const runtimeVersion = process.env.DSH_TEST_RUNTIME_VERSION || testedRuntimeVersions[0];
if (!testedRuntimeVersions.includes(runtimeVersion)) throw new Error(`DSH_TEST_RUNTIME_VERSION must be one of: ${testedRuntimeVersions.join(', ')}`);

const testRoot = dirname(fileURLToPath(import.meta.url));
const repo = resolve(testRoot, '..');
const fixture = resolve(testRoot, '.fixture');
mkdirSync(fixture, { recursive: true });

const sources = [
  ['index.js', 'host.mjs'],
  ['client.js', 'client.js'],
  ['discovery.js', 'discovery.js'],
  ['compatibility.js', 'compatibility.js'],
  ['mcp-config.js', 'mcp-config.js'],
  ['mcp-patch.js', 'mcp-patch.js'],
  ['mcp-write.js', 'mcp-write.js'],
  ['package.json', 'package.json'],
];
for (const [source, destination] of sources) copyFileSync(resolve(repo, source), resolve(fixture, destination));

const suites = ['regression.test.mjs', 'mcp-patch.test.mjs', 'mcp-config.test.mjs', 'mcp-write.test.mjs', 'skills.test.mjs', 'client.test.mjs', 'compatibility.test.mjs'];
for (const name of suites) copyFileSync(resolve(testRoot, name), resolve(fixture, name));

// The runtime version is read through `@deepseek-ai/dsh/package.json`; the fixture provides only that file.
const runtimeFixture = resolve(fixture, 'node_modules/@deepseek-ai/dsh');
mkdirSync(runtimeFixture, { recursive: true });
writeFileSync(resolve(runtimeFixture, 'package.json'), JSON.stringify({
  name: '@deepseek-ai/dsh', version: runtimeVersion, type: 'module',
  exports: { './package.json': './package.json' },
}) + '\n');

const bridgeFixture = resolve(fixture, 'node_modules/@deepseek-ai/dsh-mcp-client');
mkdirSync(bridgeFixture, { recursive: true });
writeFileSync(resolve(bridgeFixture, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-mcp-client', type: 'module', exports: './index.js' }) + '\n');
writeFileSync(resolve(bridgeFixture, 'index.js'), 'export const name = "fixture-mcp-bridge";\n');

await import(pathToFileURL(resolve(fixture, 'regression.test.mjs')).href);
for (const name of suites.slice(1)) {
  await import(pathToFileURL(resolve(fixture, name)).href);
}
const { writeReport } = await import(pathToFileURL(resolve(fixture, 'regression.test.mjs')).href);
await new Promise((done) => setTimeout(done, 50));
writeReport();
