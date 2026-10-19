import assert from 'node:assert/strict';
import { check } from './regression.test.mjs';
import { describeConfig, normalizeNewServer, normalizePatch } from './mcp-config.js';

const httpConfig = () => ({
  serverName: 'probe',
  transport: 'streamable-http',
  url: 'http://127.0.0.1:8767/mcp',
  headers: { Authorization: 'Bearer stored' },
  toolCallTimeoutMs: 120000,
  failOnStartupError: false,
  reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 5000, maxAttempts: 10 },
});
const stdioConfig = () => ({
  serverName: 'probe',
  transport: 'stdio',
  command: 'probe-command',
  args: ['--flag'],
  cwd: '',
  env: { PROBE_TOKEN: 'stored-token' },
  toolCallTimeoutMs: 120000,
});

await check('A patch may change transport fields, shared fields and reconnect only', () => {
  const current = httpConfig();
  assert.equal(normalizePatch(current, { url: 'https://example.invalid/mcp' }).url, 'https://example.invalid/mcp');
  assert.deepEqual(normalizePatch(current, { failOnStartupError: true }), { failOnStartupError: true });
  for (const patch of [{ serverName: 'other' }, { transport: 'stdio' }, { command: 'rm' }, { unknownField: 1 }]) {
    assert.throws(() => normalizePatch(current, patch), undefined, JSON.stringify(patch));
  }
  assert.throws(() => normalizePatch(current, { url: 'not-a-url' }), /http/);
  assert.throws(() => normalizePatch(current, {}), /可应用的修改/);
});

await check('Stdio patches accept args, cwd and partial credentials', () => {
  const current = stdioConfig();
  assert.deepEqual(normalizePatch(current, { args: ['--a', 'b'] }).args, ['--a', 'b']);
  assert.equal(normalizePatch(current, { cwd: '/tmp/work' }).cwd, '/tmp/work');
  assert.equal(normalizePatch(current, { cwd: '' }).cwd, '', 'An empty cwd clears the field');
  assert.throws(() => normalizePatch(current, { args: ['ok', 3] }), /args\[1\]/);
});

await check('A credential map replaces strings, deletes with null and keeps untouched keys', () => {
  const current = stdioConfig();
  const next = normalizePatch(current, { env: { PROBE_TOKEN: 'next', EXTRA: 'x' } });
  assert.deepEqual(next.env, { PROBE_TOKEN: 'next', EXTRA: 'x' });
  const removed = normalizePatch(current, { env: { PROBE_TOKEN: null } });
  assert.deepEqual(removed.env, {}, 'null deletes the stored key');
  assert.throws(() => normalizePatch(current, { env: { 'bad key': 'x' } }), /无效/);
});

await check('Reconnect merges over the current definition', () => {
  const current = httpConfig();
  const next = normalizePatch(current, { reconnect: { maxAttempts: 3 } });
  assert.deepEqual(next.reconnect, { enabled: true, initialDelayMs: 500, maxDelayMs: 5000, maxAttempts: 3 });
  assert.throws(() => normalizePatch(current, { reconnect: { unknown: 1 } }), /reconnect\.unknown/);
});

await check('A new server definition validates its name, transport and endpoint', () => {
  assert.deepEqual(normalizeNewServer({ serverName: 'github', transport: 'stdio', command: 'npx', args: ['-y', 'x'] }), {
    serverName: 'github',
    transport: 'stdio',
    config: { serverName: 'github', transport: 'stdio', command: 'npx', args: ['-y', 'x'] },
  });
  const remote = normalizeNewServer({ serverName: 'remote', transport: 'streamable-http', url: 'https://example.invalid/mcp' });
  assert.equal(remote.config.url, 'https://example.invalid/mcp');
  assert.throws(() => normalizeNewServer({ serverName: 'bad name', transport: 'stdio', command: 'x' }), /serverName/);
  assert.throws(() => normalizeNewServer({ serverName: 'x', transport: 'sse', command: 'x' }), /transport/);
  assert.throws(() => normalizeNewServer({ serverName: 'x', transport: 'stdio', command: '' }), /command/);
  assert.throws(() => normalizeNewServer({ serverName: 'x', transport: 'streamable-http', url: 'ftp://x' }), /http/);
  assert.throws(() => normalizeNewServer({ serverName: 'x', transport: 'stdio', command: 'x', id: 'mine' }), /id/);
  assert.throws(() => normalizeNewServer({ serverName: 'x', transport: 'stdio', command: 'x', name: 'other' }), /模块名/);
});

await check('The read model exposes fields and credential names, never values', () => {
  const described = describeConfig(stdioConfig());
  assert.equal(described.transport, 'stdio');
  assert.equal(described.fields.command, 'probe-command');
  assert.deepEqual(described.fields.args, ['--flag']);
  assert.deepEqual(described.credentialKeys, ['PROBE_TOKEN']);
  assert.equal(described.credentials, 'env');
  assert.equal(JSON.stringify(described).includes('stored-token'), false, 'A stored credential must never reach the page');
  const http = describeConfig(httpConfig());
  assert.equal(http.credentials, 'headers');
  assert.deepEqual(http.credentialKeys, ['Authorization']);
  assert.equal(JSON.stringify(http).includes('Bearer stored'), false);
});

await check('A !!js field is described as an expression and never as a value', () => {
  const described = describeConfig({ serverName: 'p', transport: 'stdio', command: { __jsExpr: 'process.cwd()' } });
  assert.deepEqual(described.fields.command, { expression: 'process.cwd()' });
});
