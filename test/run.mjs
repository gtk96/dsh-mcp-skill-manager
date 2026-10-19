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
for (const [source, destination] of [['index.js', 'host.mjs'], ['client.js', 'client.js'], ['discovery.js', 'discovery.js'], ['compatibility.js', 'compatibility.js'], ['mcp-config.js', 'mcp-config.js'], ['managed-hooks.js', 'managed-hooks.js'], ['package.json', 'package.json']]) {
  copyFileSync(resolve(repo, source), resolve(fixture, destination));
}
for (const name of ['regression.test.mjs', 'session-discovery.test.mjs', 'compatibility.test.mjs', 'mcp-config.test.mjs', 'hooks.test.mjs']) {
  copyFileSync(resolve(testRoot, name), resolve(fixture, name));
}
const runtimeFixture = resolve(fixture, 'node_modules/@deepseek-ai/dsh');
mkdirSync(runtimeFixture, { recursive: true });
writeFileSync(resolve(runtimeFixture, 'package.json'), JSON.stringify({
  name: '@deepseek-ai/dsh', version: runtimeVersion, type: 'module',
  exports: { './package.json': './package.json' },
}) + '\n');
const bridgeFixture = resolve(fixture, 'node_modules/@deepseek-ai/dsh-mcp-client');
mkdirSync(bridgeFixture, { recursive: true });
writeFileSync(resolve(bridgeFixture, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-mcp-client', type: 'module', exports: './index.js' }) + '\n');
writeFileSync(resolve(bridgeFixture, 'index.js'), `export const name = 'fixture-mcp-bridge';
export const inject = ['fixtureMcp'];
export function apply(ctx, config) {
  ctx.fixtureMcp.start(config);
  ctx.effect(() => () => ctx.fixtureMcp.stop(config.serverName));
}
`);
const hooksFixture = resolve(fixture, 'node_modules/@deepseek-ai/dsh-hooks-claude-code');
mkdirSync(hooksFixture, { recursive: true });
writeFileSync(resolve(hooksFixture, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-hooks-claude-code', type: 'module', exports: './index.js' }) + '\n');
writeFileSync(resolve(hooksFixture, 'index.js'), `import { readFileSync } from 'node:fs';
export const name = 'fixture-hook-bridge';
export const inject = ['fixtureHooks'];
export function apply(ctx, config) {
  const content = JSON.parse(readFileSync(config.configPath, 'utf8'));
  ctx.fixtureHooks.start(content);
  ctx.effect(() => () => ctx.fixtureHooks.stop());
}
`);
await import(pathToFileURL(resolve(fixture, 'hooks.test.mjs')).href);
await import(pathToFileURL(resolve(fixture, 'session-discovery.test.mjs')).href);
await import(pathToFileURL(resolve(fixture, 'compatibility.test.mjs')).href);
