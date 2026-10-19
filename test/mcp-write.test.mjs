import assert from 'node:assert/strict';
import { check, fixture, MCP_CLIENT } from './regression.test.mjs';
import { parsePatch } from './mcp-patch.js';

const PATCH = `# Keep this header. It documents the profile and must survive every write.
- insert:
    - id: mcp-base
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: base
        transport: stdio
        command: !!js process.cwd()
        args: []
`;

const base = () => ({
  patch: PATCH,
  base: [{ id: 'mcp-bundle', name: MCP_CLIENT, config: { serverName: 'bundle', transport: 'streamable-http', url: 'https://bundle.invalid/mcp' }, loaded: 'ok' }],
});

const insertedIds = (host) => {
  const rows = [];
  for (const block of parsePatch(host.profile.readPatch()).toJS()) {
    if (Array.isArray(block?.insert)) rows.push(...block.insert.map((row) => row.id));
  }
  return rows;
};

await check('Creating a server writes one insert row, reconciles, and leaves comments intact', async (t) => {
  const host = await fixture(base());
  t.after(() => host.close());
  const result = await host.rpc('mcp.create', { serverName: 'github', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value.entryId, 'mcp-github');
  assert.equal(result.value.application, 'applied');
  assert.deepEqual(insertedIds(host), ['mcp-base', 'mcp-github']);
  assert.equal(host.profile.readPatch().includes('id: mcp-github'), true);
  assert.deepEqual(host.profile.trace.reconciles, [['mcp-github']]);
  const text = host.profile.readPatch();
  assert.match(text, /# Keep this header/);
  assert.match(text, /command: !!js process\.cwd\(\)/);
  const created = host.profile.entries.get('mcp-github');
  assert.equal(created.options.config.serverName, 'github');
  assert.equal(created.options.config.args[1], '@modelcontextprotocol/server-github');
  const listed = (await host.rpc('mcp.discover')).value.servers.find((row) => row.entryId === 'mcp-github');
  assert.equal(listed.source, 'profile');
  assert.equal(listed.removable, true);
});

await check('A duplicate server name is refused before anything is written', async (t) => {
  const host = await fixture(base());
  t.after(() => host.close());
  const before = host.profile.readPatch();
  for (const serverName of ['bundle', 'base']) {
    const result = await host.rpc('mcp.create', { serverName, transport: 'stdio', command: 'npx' });
    assert.equal(result.ok, false, serverName);
    assert.match(result.error.message, /已被其他 MCP 条目使用/);
  }
  assert.equal(host.profile.readPatch(), before, 'Refused writes must leave the file untouched');
});

await check('A rejected reconciliation restores the previous file byte for byte', async (t) => {
  const host = await fixture({ ...base(), failReconcile: ['fixture rejection'] });
  t.after(() => host.close());
  const before = host.profile.readPatch();
  const result = await host.rpc('mcp.create', { serverName: 'doomed', transport: 'stdio', command: 'npx' });
  assert.equal(result.ok, false);
  assert.match(result.error.message, /已恢复原配置/);
  assert.equal(host.profile.readPatch(), before, 'The rollback must restore the exact previous bytes');
  assert.equal(host.profile.entries.has('mcp-doomed'), false);
});

await check('Without HMR the write persists and reports restart-required', async (t) => {
  const host = await fixture({ ...base(), hmr: false });
  t.after(() => host.close());
  const result = await host.rpc('mcp.create', { serverName: 'later', transport: 'streamable-http', url: 'https://later.invalid/mcp' });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value.application, 'restart-required');
  assert.deepEqual(insertedIds(host), ['mcp-base', 'mcp-later']);
  assert.equal(host.profile.trace.reconciles.length, 0);
});

await check('Removing an inserted server deletes its row and keeps the file header', async (t) => {
  const host = await fixture(base());
  t.after(() => host.close());
  const removed = await host.rpc('mcp.remove', { entryId: 'mcp-base' });
  assert.equal(removed.ok, true, JSON.stringify(removed));
  assert.equal(removed.value.removed, 'insert');
  assert.deepEqual(insertedIds(host), []);
  assert.match(host.profile.readPatch(), /# Keep this header/);
  assert.equal(host.profile.entries.has('mcp-base'), false);
});

await check('Removing an inserted server also drops the override written while it existed', async (t) => {
  const host = await fixture(base());
  t.after(() => host.close());
  assert.equal((await host.rpc('mcp.set-enabled', { entryId: 'mcp-base', enabled: false })).ok, true);
  assert.match(host.profile.readPatch(), /disabled: true/, 'The toggle must leave an override behind');
  const removed = await host.rpc('mcp.remove', { entryId: 'mcp-base' });
  assert.equal(removed.ok, true, JSON.stringify(removed));
  assert.equal(removed.value.removed, 'insert');
  assert.deepEqual(insertedIds(host), []);
  assert.equal(host.profile.readPatch().includes('mcp-base'), false, 'No override may outlive the row it addressed');
  assert.equal(host.profile.entries.has('mcp-base'), false);
});

await check('Removing an inserted server also drops a config override written by an edit', async (t) => {
  const host = await fixture(base());
  t.after(() => host.close());
  assert.equal((await host.rpc('mcp.update', { entryId: 'mcp-base', patch: { toolCallTimeoutMs: 5000 } })).ok, true);
  assert.match(host.profile.readPatch(), /toolCallTimeoutMs: 5000/, 'The edit must leave a config override behind');
  const removed = await host.rpc('mcp.remove', { entryId: 'mcp-base' });
  assert.equal(removed.ok, true, JSON.stringify(removed));
  assert.equal(removed.value.removed, 'insert');
  assert.deepEqual(insertedIds(host), []);
  assert.equal(host.profile.readPatch().includes('mcp-base'), false, 'No override may outlive the row it addressed');
  assert.equal(host.profile.entries.has('mcp-base'), false);
});

await check('Removing a server another layer owns writes a disable override instead', async (t) => {
  const host = await fixture(base());
  t.after(() => host.close());
  const removed = await host.rpc('mcp.remove', { entryId: 'mcp-bundle' });
  assert.equal(removed.ok, true, JSON.stringify(removed));
  assert.equal(removed.value.removed, 'disabled');
  assert.equal(host.profile.readPatch().includes("id: mcp-bundle"), true);
  const blocks = parsePatch(host.profile.readPatch()).toJS();
  assert.deepEqual(blocks.at(-1), { id: 'mcp-bundle', name: MCP_CLIENT, disabled: true });
  assert.equal(host.profile.entries.get('mcp-bundle').disabled, true);
  const listed = (await host.rpc('mcp.discover')).value.servers.find((row) => row.entryId === 'mcp-bundle');
  assert.equal(listed.source, 'bundle');
  assert.equal(listed.removable, false);
  assert.equal(listed.disabled, true);
});

await check('Enabling and disabling a bundled server toggles one override row', async (t) => {
  const host = await fixture(base());
  t.after(() => host.close());
  const off = await host.rpc('mcp.set-enabled', { entryId: 'mcp-bundle', enabled: false });
  assert.equal(off.ok, true, JSON.stringify(off));
  assert.equal(off.value.application, 'applied');
  assert.equal(host.profile.entries.get('mcp-bundle').disabled, true);
  const on = await host.rpc('mcp.set-enabled', { entryId: 'mcp-bundle', enabled: true });
  assert.equal(on.ok, true, JSON.stringify(on));
  assert.deepEqual(host.profile.trace.reconciles.at(-1), ['mcp-bundle']);
  assert.equal(host.profile.entries.get('mcp-bundle').disabled, false);
  const overrides = parsePatch(host.profile.readPatch()).toJS().filter((block) => block.id === 'mcp-bundle');
  assert.equal(overrides.length, 1, 'One override row is rewritten, not duplicated');
  assert.equal(overrides[0].disabled, false);
});

await check('A write refused by the owner check never reaches the patch file', async (t) => {
  const host = await fixture({ ...base(), admitDenied: true });
  t.after(() => host.close());
  const before = host.profile.readPatch();
  for (const [method, args] of [
    ['mcp.create', { serverName: 'nope', transport: 'stdio', command: 'npx' }],
    ['mcp.set-enabled', { entryId: 'mcp-bundle', enabled: false }],
    ['mcp.remove', { entryId: 'mcp-base' }],
  ]) {
    const result = await host.rpc(method, args);
    assert.equal(result.error.code, 'MCP_SKILL_MANAGER_FORBIDDEN', method);
  }
  assert.equal(host.profile.readPatch(), before);
});

await check('A session id is refused: these writes address the profile', async (t) => {
  const host = await fixture(base());
  t.after(() => host.close());
  const before = host.profile.readPatch();
  const result = await host.rpc('mcp.create', { sessionId: 'fixture', serverName: 'x', transport: 'stdio', command: 'npx' });
  assert.equal(result.ok, false);
  assert.match(result.error.message, /session id is not accepted/);
  assert.equal(host.profile.readPatch(), before, 'Refused writes must leave the file untouched');
});

await check('Updating a bundled entry writes a profile override and can be reset', async (t) => {
  const host = await fixture(base());
  t.after(() => host.close());
  const updated = await host.rpc('mcp.update', { entryId: 'mcp-bundle', patch: { toolCallTimeoutMs: 60000, reconnect: { maxAttempts: 3 } } });
  assert.equal(updated.ok, true, JSON.stringify(updated));
  assert.equal(host.profile.entries.get('mcp-bundle').options.config.toolCallTimeoutMs, 60000);
  assert.equal(host.profile.entries.get('mcp-bundle').options.config.reconnect.maxAttempts, 3);
  assert.equal(host.profile.entries.get('mcp-bundle').options.config.url, 'https://bundle.invalid/mcp', 'Untouched fields survive');
  const listed = (await host.rpc('mcp.discover')).value.servers.find((row) => row.entryId === 'mcp-bundle');
  assert.equal(listed.overridden, true);
  const reset = await host.rpc('mcp.reset', { entryId: 'mcp-bundle' });
  assert.equal(reset.ok, true, JSON.stringify(reset));
  assert.equal(host.profile.entries.get('mcp-bundle').options.config.toolCallTimeoutMs, undefined);
  const after = (await host.rpc('mcp.discover')).value.servers.find((row) => row.entryId === 'mcp-bundle');
  assert.equal(after.overridden, false);
  assert.equal((await host.rpc('mcp.reset', { entryId: 'mcp-bundle' })).value.changed, false);
});

await check('Editing is refused for a disabled entry and for a non-MCP entry', async (t) => {
  const host = await fixture({ ...base(), patch: `${PATCH}- id: mcp-base\n  name: '@deepseek-ai/dsh-mcp-client'\n  disabled: true\n` });
  t.after(() => host.close());
  host.profile.addBase({ id: 'plain', name: 'fixture-plugin', config: {}, loaded: 'ok' });
  const disabled = await host.rpc('mcp.update', { entryId: 'mcp-base', patch: { toolCallTimeoutMs: 1000 } });
  assert.equal(disabled.ok, false);
  assert.match(disabled.error.message, /先启用/);
  const plain = await host.rpc('mcp.update', { entryId: 'plain', patch: { toolCallTimeoutMs: 1000 } });
  assert.equal(plain.ok, false);
  assert.match(plain.error.message, /不是 MCP/);
  assert.equal(host.profile.trace.edits, 0);
});

await check('A save merges against the live config so concurrent writes survive', async (t) => {
  const host = await fixture(base());
  t.after(() => host.close());
  const editor = host.ctx.get('configEditor');
  const original = editor.edit;
  editor.edit = async (entry, change) => {
    entry.options.config = {
      ...entry.options.config,
      headers: { 'X-Other-Writer': 'kept' },
      reconnect: { enabled: true, initialDelayMs: 900, maxDelayMs: 4000, maxAttempts: 7 },
    };
    await original(entry, change);
  };
  t.after(() => { editor.edit = original; });
  const result = await host.rpc('mcp.update', { entryId: 'mcp-bundle', patch: { toolCallTimeoutMs: 60000 } });
  assert.equal(result.ok, true, JSON.stringify(result));
  const config = host.profile.entries.get('mcp-bundle').options.config;
  assert.equal(config.headers['X-Other-Writer'], 'kept');
  assert.equal(config.reconnect.maxAttempts, 7);
  assert.equal(config.toolCallTimeoutMs, 60000);
});

await check('An unpublished atomic-write helper falls back to the local implementation', async (t) => {
  const host = await fixture(base());
  t.after(() => host.close());
  const locked = await import('./mcp-write.js');
  assert.equal(typeof locked.createMcpPatch, 'function');
  // The fixture runtime publishes no `@deepseek-ai/dsh-atomic-write`, so this write already used the fallback.
  const result = await host.rpc('mcp.set-enabled', { entryId: 'mcp-base', enabled: false });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(host.profile.entries.get('mcp-base').disabled, true);
});
