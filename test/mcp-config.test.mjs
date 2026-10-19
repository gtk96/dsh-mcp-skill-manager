import assert from 'node:assert/strict';
import runtimeFixture from '@deepseek-ai/dsh/package.json' with { type: 'json' };
import { check, fixture, page, writeReport } from './regression.test.mjs';
import { describeConfig, normalizePatch, REDACTED } from './mcp-config.js';

const MCP_CLIENT = '@deepseek-ai/dsh-mcp-client';
const httpConfig = () => ({ serverName: 'probe', transport: 'streamable-http', url: 'http://127.0.0.1:8767/mcp', headers: {}, toolCallTimeoutMs: 120000, failOnStartupError: false, reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 5000, maxAttempts: 10 } });
const stdioConfig = () => ({ serverName: 'probe', transport: 'stdio', command: 'probe-command', args: ['--flag'], env: { PROBE_TOKEN: '[secret]' }, toolCallTimeoutMs: 120000 });

function pushNative(host, config, { inherited = {} } = {}) {
  const row = { entry: { id: 'include:mcp-probe', options: { id: 'mcp-probe', name: MCP_CLIENT, config } }, inherited, override: {} };
  host.rows.push(row);
  return row;
}

await check('A page patch may change supported HTTP fields and nothing else', () => {
  const current = httpConfig();
  assert.equal(normalizePatch(current, { url: 'https://example.invalid/mcp' }).url, 'https://example.invalid/mcp');
  assert.deepEqual(normalizePatch(current, { failOnStartupError: true }), { failOnStartupError: true });
  for (const patch of [{ serverName: 'other' }, { transport: 'stdio' }, { command: 'rm' }, { unknownField: 1 }]) {
    assert.throws(() => normalizePatch(current, patch), undefined, JSON.stringify(patch));
  }
  assert.throws(() => normalizePatch(current, { url: 'not-a-url' }), /http/);
  assert.throws(() => normalizePatch(current, {}), /可应用的修改/);
});

await check('A stdio patch keeps stored credentials unless a real value replaces them', () => {
  const current = stdioConfig();
  const kept = normalizePatch(current, { env: { PROBE_TOKEN: REDACTED } });
  assert.equal(kept.env.PROBE_TOKEN, '[secret]', 'The stored value must survive a redacted round trip');
  const replaced = normalizePatch(current, { env: { PROBE_TOKEN: 'next' } });
  assert.equal(replaced.env.PROBE_TOKEN, 'next');
  assert.throws(() => normalizePatch(current, { env: { 'bad key': 'x' } }));
});

await check('Editing a native MCP entry rewrites only the patch through the Loader', async (t) => {
  const host = await fixture(); t.after(() => host.close());
  const row = pushNative(host, httpConfig());
  const before = structuredClone(row.entry.options.config);
  const result = await host.rpc('mcp.update', { entryId: 'include:mcp-probe', patch: { toolCallTimeoutMs: 60000, reconnect: { maxAttempts: 3 } } });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.value.fields, ['toolCallTimeoutMs', 'reconnect']);
  const after = row.entry.options.config;
  assert.equal(after.toolCallTimeoutMs, 60000);
  assert.equal(after.reconnect.maxAttempts, 3);
  assert.equal(after.reconnect.maxDelayMs, before.reconnect.maxDelayMs, 'Untouched reconnect fields survive');
  assert.equal(after.url, before.url);
  assert.equal(host.trace.edits, 1);
});

await check('Editing refuses an inherited definition and a non-MCP entry', async (t) => {
  const host = await fixture(); t.after(() => host.close());
  pushNative(host, httpConfig(), { inherited: { url: 'http://127.0.0.1:1/mcp' } });
  const inherited = await host.rpc('mcp.update', { entryId: 'include:mcp-probe', patch: { toolCallTimeoutMs: 1000 } });
  assert.equal(inherited.ok, false);
  assert.match(inherited.error.message, /继承层/);

  const plain = { id: 'include:not-mcp', options: { id: 'not-mcp', name: 'fixture-plugin', config: {} } };
  host.rows.push({ entry: plain, inherited: {}, override: {} });
  const notMcp = await host.rpc('mcp.update', { entryId: 'include:not-mcp', patch: { toolCallTimeoutMs: 1000 } });
  assert.equal(notMcp.ok, false);
  assert.match(notMcp.error.message, /不是 MCP/);
  assert.equal(host.trace.edits, 0);
});

await check('Editing a native MCP entry needs the confirming owner', async (t) => {
  const host = await fixture({ admitDenied: true }); t.after(() => host.close());
  pushNative(host, httpConfig());
  const refused = await host.rpc('mcp.update', { entryId: 'include:mcp-probe', patch: { toolCallTimeoutMs: 1000 } });
  assert.equal(refused.error.code, 'MCP_SKILL_MANAGER_FORBIDDEN');
  assert.equal(host.trace.edits, 0);
});

await check('A concurrent write between catalogue read and save is not overwritten', async (t) => {
  const host = await fixture(); t.after(() => host.close());
  const row = pushNative(host, httpConfig());
  const editor = host.ctx.get('configEditor');
  const original = editor.edit;
  // Another writer changes credentials and reconnect settings after the catalogue read, before this save lands.
  editor.edit = async (entry, change) => {
    entry.options.config = {
      ...entry.options.config,
      headers: { 'X-Other-Writer': 'kept' },
      reconnect: { enabled: true, initialDelayMs: 900, maxDelayMs: 4000, maxAttempts: 7 },
    };
    const next = change(structuredClone(entry.options.config), {});
    host.trace.edits++;
    entry.options.config = next;
  };
  t.after(() => { editor.edit = original; });
  const result = await host.rpc('mcp.update', { entryId: 'include:mcp-probe', patch: { toolCallTimeoutMs: 60000 } });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(row.entry.options.config.headers['X-Other-Writer'], 'kept', 'A concurrent credential write must survive');
  assert.equal(row.entry.options.config.reconnect.maxAttempts, 7, 'A concurrent reconnect write must survive');
  assert.equal(row.entry.options.config.toolCallTimeoutMs, 60000);
});

await check('A save refuses an entry that became inherited before the callback ran', async (t) => {
  const host = await fixture(); t.after(() => host.close());
  pushNative(host, httpConfig());
  const editor = host.ctx.get('configEditor');
  const original = editor.edit;
  editor.edit = async (entry, change) => {
    host.trace.edits++;
    change(structuredClone(entry.options.config), { url: 'http://inherited.invalid/mcp' });
  };
  t.after(() => { editor.edit = original; });
  const result = await host.rpc('mcp.update', { entryId: 'include:mcp-probe', patch: { toolCallTimeoutMs: 1000 } });
  assert.equal(result.ok, false);
  assert.match(result.error.message, /继承层/);
});

await check('The read model exposes editable fields and credential names only', () => {
  const described = describeConfig(stdioConfig());
  assert.equal(described.transport, 'stdio');
  assert.equal(described.fields.command, 'probe-command');
  assert.deepEqual(described.envKeys, ['PROBE_TOKEN']);
  assert.equal(JSON.stringify(described).includes('[secret]'), false, 'A stored credential must never reach the page');
});

await check('A configured Server with no tools is reported instead of looking healthy', async (t) => {
  const host = await fixture(); t.after(() => host.close());
  pushNative(host, httpConfig());
  const discovered = (await host.rpc('mcp.discover')).value;
  assert.ok(Array.isArray(discovered.emptyServers));
  assert.deepEqual(discovered.emptyServers, ['probe'], 'The fixture registers no probe tool, so it must be reported');
  const row = discovered.configured.find((item) => item.serverName === 'probe');
  assert.equal(row.failOnStartupError, false);
  assert.equal(row.editable.transport, 'streamable-http');
  assert.equal(row.inherited, false);
});

await check('Settings groups tools only when exactly one configured Server name matches', async (t) => {
  const host = await fixture(); t.after(() => host.close());
  const discovered = (await host.rpc('mcp.discover')).value;
  const configured = ['foo', 'foo', 'foo__bar', 'clean'].map((serverName, index) => ({ serverName, entryId: `fixture-${index}`, kind: 'profile-config' }));
  const candidates = ['mcp__foo__bar__ping', 'mcp__foo__ping', 'mcp__clean__ping', 'mcp__other__ping'].map((name) => ({ name, definitionView: 'profile' }));
  const ui = await page(t, host, (method) => method === 'mcp.discover'
    ? { ok: true, value: { ...discovered, configured, candidates, tools: candidates } } : undefined);
  const groups = ui.renderer.root.findAllByType('details');
  const group = (label) => groups.find((item) => item.findByType('summary').children.join('').startsWith(label));
  assert.equal(group('foo（'), undefined);
  assert.match(group('foo__bar（').findByType('summary').children.join(''), /0 个候选工具/);
  assert.match(group('clean（').findByType('summary').children.join(''), /1 个候选工具/);
});

await check('Settings leaves tools unmatched when unique Server names overlap', async (t) => {
  const host = await fixture(); t.after(() => host.close());
  const discovered = (await host.rpc('mcp.discover')).value;
  const configured = ['bar', 'bar__baz'].map((serverName, index) => ({ serverName, entryId: `fixture-${index}`, kind: 'profile-config' }));
  const candidates = [{ name: 'mcp__bar__baz__ping', definitionView: 'profile' }];
  const ui = await page(t, host, (method) => method === 'mcp.discover'
    ? { ok: true, value: { ...discovered, configured, candidates, tools: candidates } } : undefined);
  const groups = ui.renderer.root.findAllByType('details');
  const group = (label) => groups.find((item) => item.findByType('summary').children.join('').startsWith(label));
  assert.match(group('bar（').findByType('summary').children.join(''), /0 个候选工具/);
  assert.match(group('bar__baz（').findByType('summary').children.join(''), /0 个候选工具/);
});

writeReport();
