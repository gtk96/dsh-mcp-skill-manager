import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { check, fixture, page, text, MCP_CLIENT } from './regression.test.mjs';

const server = (serverName, id) => ({
  id: id ?? 'mcp-' + serverName,
  name: MCP_CLIENT,
  config: { serverName, transport: 'stdio', command: 'fixture' },
  loaded: 'ok',
});

const base = (extra = {}) => ({
  patch: '[]\n',
  base: [server('alpha')],
  globalTools: [{ name: 'mcp__alpha__query' }, { name: 'mcp__alpha__delete' }],
  ...extra,
});

/** A fixture whose profile directory holds the guard state file, isolated in a temp dir. */
async function guarded(extra = {}) {
  const host = await fixture(base(extra));
  return host;
}

/** The state file the fixture's profile writes when `profileContext.dir` is set. */
const stateFile = (host) => join(host.profile.context.dir, '.mcp-skill-manager', 'tool-guards.json');

await check('A guarded tool denies its call with a message that tells the model what not to do', async (t) => {
  const host = await guarded();
  t.after(() => host.close());
  assert.equal(host.guardedCall('mcp__alpha__query'), undefined, 'An unguarded call must run');
  const result = await host.rpc('mcp.set-tool-disabled', { toolName: 'mcp__alpha__query', disabled: true });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value.changed, true);
  assert.equal(result.value.disabled, true);
  const reason = host.guardedCall('mcp__alpha__query');
  assert.match(reason, /disabled/);
  assert.match(reason, /Do not retry/, 'The denial must steer the model away from a retry loop');
  assert.equal(host.guardedCall('mcp__alpha__delete'), undefined, 'Only the named tool is guarded');
});

await check('The deny list persists beside the profile, not in the composition', async (t) => {
  const host = await guarded();
  t.after(() => host.close());
  await host.rpc('mcp.set-tool-disabled', { toolName: 'mcp__alpha__query', disabled: true });
  const file = stateFile(host);
  assert.equal(existsSync(file), true, 'The state file must be written under the profile directory');
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(saved.disabled, ['mcp__alpha__query']);
  // Writing the patch would reconcile the Loader and reload this plugin on every toggle.
  assert.equal(host.profile.readPatch(), '[]\n', 'Guarding a tool must not rewrite the composition');
  assert.equal(host.profile.trace.reconciles.length, 0);
});

await check('A profile directory makes the deny list reload with the plugin', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-guards-'));
  const file = join(dir, '.mcp-skill-manager', 'tool-guards.json');
  mkdirSync(join(dir, '.mcp-skill-manager'), { recursive: true });
  writeFileSync(file, JSON.stringify({ version: 1, disabled: ['mcp__alpha__query'] }));
  const host = await fixture({ ...base(), profileDir: dir });
  t.after(() => host.close());
  // The store reads the file at construction, so the guard is armed without any RPC.
  assert.match(host.guardedCall('mcp__alpha__query'), /disabled/);
  const listed = (await host.rpc('mcp.discover')).value;
  assert.deepEqual(listed.guardedTools, ['mcp__alpha__query']);
  assert.equal(listed.servers[0].guardedCount, 1, 'The live alpha row carries both fixture tools');
});

await check('A malformed or hand-edited state file guards only well-formed MCP names', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-guards-'));
  mkdirSync(join(dir, '.mcp-skill-manager'), { recursive: true });
  writeFileSync(join(dir, '.mcp-skill-manager', 'tool-guards.json'), JSON.stringify({
    version: 1,
    // `bash` is not an MCP tool name; the guard must not deny a built-in tool from a hand edit.
    disabled: ['mcp__alpha__query', 'bash', '../../etc/passwd', 42],
  }));
  const host = await fixture({ ...base(), profileDir: dir });
  t.after(() => host.close());
  assert.match(host.guardedCall('mcp__alpha__query'), /disabled/);
  assert.equal(host.guardedCall('bash'), undefined, 'Only mcp__ names may be written into the list');
  assert.deepEqual((await host.rpc('mcp.discover')).value.guardedTools, ['mcp__alpha__query']);
});

await check('A corrupt state file is ignored instead of disabling every tool', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-guards-'));
  mkdirSync(join(dir, '.mcp-skill-manager'), { recursive: true });
  writeFileSync(join(dir, '.mcp-skill-manager', 'tool-guards.json'), '{ not json');
  const host = await fixture({ ...base(), profileDir: dir });
  t.after(() => host.close());
  assert.equal(host.guardedCall('mcp__alpha__query'), undefined);
  assert.deepEqual((await host.rpc('mcp.discover')).value.guardedTools, []);
  assert.equal((await host.rpc('mcp.set-tool-disabled', { toolName: 'mcp__alpha__query', disabled: true })).ok, true);
});

await check('Only MCP tool names may be guarded, and unguarding is idempotent', async (t) => {
  const host = await guarded();
  t.after(() => host.close());
  for (const toolName of ['bash', 'mcp__alpha', 'mcp__alpha__', 'mcp__a b__x', '']) {
    const result = await host.rpc('mcp.set-tool-disabled', { toolName, disabled: true });
    assert.equal(result.ok, false, toolName);
    assert.match(result.error.message, /MCP 工具|工具名/);
  }
  assert.equal((await host.rpc('mcp.set-tool-disabled', { toolName: 'mcp__alpha__query', disabled: 'yes' })).ok, false);
  const first = await host.rpc('mcp.set-tool-disabled', { toolName: 'mcp__alpha__query', disabled: true });
  assert.equal(first.value.changed, true);
  const again = await host.rpc('mcp.set-tool-disabled', { toolName: 'mcp__alpha__query', disabled: true });
  assert.equal(again.value.changed, false, 'Repeating a state must not rewrite the file');
  const off = await host.rpc('mcp.set-tool-disabled', { toolName: 'mcp__alpha__query', disabled: false });
  assert.equal(off.value.changed, true);
  assert.equal(host.guardedCall('mcp__alpha__query'), undefined);
  assert.deepEqual(JSON.parse(readFileSync(stateFile(host), 'utf8')).disabled, []);
});

await check('Disabling a tool needs an owner session and a tested runtime', async (t) => {
  const denied = await fixture(base({ admitDenied: true }));
  t.after(() => denied.close());
  const forbidden = await denied.rpc('mcp.set-tool-disabled', { toolName: 'mcp__alpha__query', disabled: true });
  assert.equal(forbidden.error.code, 'MCP_SKILL_MANAGER_FORBIDDEN');
  assert.equal(denied.guardedCall('mcp__alpha__query'), undefined);

  const noApi = await fixture(base({ guardAPI: false }));
  t.after(() => noApi.close());
  const unsupported = await noApi.rpc('mcp.set-tool-disabled', { toolName: 'mcp__alpha__query', disabled: true });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
  assert.match(unsupported.error.message, /tools\.guard/);
  const status = (await noApi.rpc('compatibility.status')).value;
  assert.equal(status.writes.guards, false);
  assert.equal(status.writes.mcp, true, 'A missing guard must not disable MCP server editing');
});

await check('Unloading the plugin lifts its guard', async (t) => {
  const host = await fixture(base());
  await host.rpc('mcp.set-tool-disabled', { toolName: 'mcp__alpha__query', disabled: true });
  assert.match(host.guardedCall('mcp__alpha__query'), /disabled/);
  await host.close();
  // The fixture's guard table drops the entry with the plugin's effect.
  assert.equal(host.guardedCall('mcp__alpha__query'), undefined);
});

await check('The page lists tools with a call toggle and reports the denial rule', async (t) => {
  const host = await fixture(base());
  t.after(() => host.close());
  const ui = await page(t, host);
  const content = ui.content();
  assert.ok(content.includes('mcp__alpha__query'), 'Tool names must be listed');
  assert.ok(content.includes('停用调用'), 'An enabled tool offers the disable action');
  assert.match(content, /官方 MCP 桥没有提供隐藏单个工具的接口/, 'The page must state what guarding does and does not do');
  await ui.click('停用调用');
  const [sent] = ui.mutations().filter(({ method }) => method === 'mcp.set-tool-disabled');
  assert.ok(sent, 'mcp.set-tool-disabled must be sent');
  assert.equal(sent.args.toolName, 'mcp__alpha__query');
  assert.equal(sent.args.disabled, true);
  assert.match(ui.statuses().join(' '), /已停用该工具的调用/);
  assert.ok(ui.content().includes('恢复调用'), 'The row now offers the inverse action');
  assert.match(ui.content(), /已停用调用/, 'The guarded row is marked');
  assert.equal(ui.logged.length, 0);
});

await check('The page hides the call toggle when the runtime publishes no guard', async (t) => {
  const host = await fixture(base({ guardAPI: false }));
  t.after(() => host.close());
  const ui = await page(t, host);
  assert.equal(ui.button('停用调用'), undefined);
  assert.match(ui.content(), /tools\.guard/);
  assert.equal(ui.mutations().length, 0);
});

await check('A tool guarded before the page loads renders as already disabled', async (t) => {
  const host = await fixture(base());
  t.after(() => host.close());
  assert.equal((await host.rpc('mcp.set-tool-disabled', { toolName: 'mcp__alpha__query', disabled: true })).ok, true);
  const ui = await page(t, host);
  assert.match(ui.content(), /已停用调用/);
  // The guarded tool offers the inverse action; its unguarded sibling keeps the disabling one.
  const rows = ui.renderer.root.findAll((node) => node.type === 'li'
    && node.props.className?.includes('dsh-msm-tool'));
  const labelsFor = (tool) => {
    const row = rows.find((node) => text(node).startsWith(tool));
    assert.ok(row, 'Expected a row for ' + tool);
    return row.findAllByType('button').map((button) => button.children.filter((child) => typeof child === 'string').join(''));
  };
  assert.deepEqual(labelsFor('mcp__alpha__query'), ['恢复调用']);
  assert.deepEqual(labelsFor('mcp__alpha__delete'), ['停用调用']);
});
