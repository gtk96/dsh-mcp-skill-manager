import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { Context } from '@deepseek-ai/cordis';
import './compatibility.test.mjs';
import { check, fixture, page, tick, writeReport } from './regression.test.mjs';
import { normalizeServer, createManagedMcp } from './managed-mcp.js';
import runtime from '@deepseek-ai/dsh/package.json' with { type: 'json' };

const stdio = (command = 'fixture-command') => ({ transport: 'stdio', command, args: ['fixture-script'] });
const http = { transport: 'streamable-http', url: 'http://fixture.invalid/mcp' };
const settle = async () => { await tick(); await tick(); };
const add = (host, serverName, definition = stdio(), signal) => host.rpc('mcp.add', { serverName, definition }, signal);
const field = (ui, label) => ui.renderer.root.findByProps({ 'aria-label': label });
async function fill(ui, values) {
  await act(async () => { for (const [label, value] of Object.entries(values)) field(ui, label).props.onChange({ currentTarget: { value } }); });
}
async function submit(ui) {
  await act(async () => { await field(ui, '新增 MCP').props.onSubmit({ preventDefault() {} }); await tick(); });
}

await check('Manual MCP validation accepts only supported transports and variable references', async () => {
  assert.equal(normalizeServer('fixture-stdio', stdio()).transport, 'stdio');
  assert.equal(normalizeServer('fixture-http', http).transport, 'streamable-http');
  for (const [name, definition] of [
    ['bad name', stdio()], ['__proto__', stdio()], ['ok', { transport: 'stdio' }],
    ['ok', { ...stdio(), args: {} }], ['ok', { ...stdio(), env: { TOKEN: 'fixture-value' } }],
    ['ok', { ...http, url: 'ftp://fixture.invalid/mcp' }], ['ok', { ...http, url: 'http://fixture.invalid/mcp?mode=1' }],
    ['ok', { ...http, headers: {} }], ['ok', { ...stdio(), envFromEnv: { VAR: 'not a variable' } }],
  ]) assert.throws(() => normalizeServer(name, definition));
});

await check('Manual stdio save persists configuration and mounts the bridge without reloading manager routes', async (t) => {
  const host = await fixture({ managed: true }); t.after(() => host.close());
  assert.equal((await host.rpc('mcp.managed')).value.writable, true);
  const routes = [...host.routes.values()];
  const result = await add(host, 'manual-stdio');
  await settle();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value.saved, true);
  assert.equal(result.value.connectionState, 'unknown');
  assert.deepEqual(host.managerEntry.options.config.managedServers['manual-stdio'], normalizeServer('manual-stdio', stdio()));
  assert.equal(host.bridgeRuns.get('manual-stdio').command, 'fixture-command');
  assert.deepEqual([...host.routes.values()], routes);
  assert.equal(host.trace.edits, 1);
  assert.equal((await host.rpc('mcp.discover')).value.configured.some((row) => row.serverName === 'manual-stdio' && row.kind === 'managed-config'), true);
});

await check('Adding a second MCP preserves the first connection identity and does not reconnect it', async (t) => {
  const host = await fixture({ managed: true }); t.after(() => host.close());
  assert.equal((await add(host, 'first')).ok, true); await settle();
  const first = host.bridgeRuns.get('first');
  assert.equal((await add(host, 'second', http)).ok, true); await settle();
  assert.equal(host.bridgeRuns.get('first'), first);
  assert.deepEqual(host.bridgeTrace.starts, ['first', 'second']);
  assert.deepEqual(host.bridgeTrace.stops, []);
  assert.equal((await host.rpc('mcp.managed')).value.servers.length, 2);
});

await check('Stored MCP definitions are loaded on activation and owned connections are released on disposal', async () => {
  const host = await fixture({ managed: true, managedServers: { restored: normalizeServer('restored', stdio()) } });
  await settle();
  assert.equal(host.bridgeRuns.has('restored'), true);
  assert.equal(host.trace.edits, 0);
  await host.close();
  assert.equal(host.bridgeRuns.size, 0);
  assert.deepEqual(host.bridgeTrace.stops, ['restored']);
  assert.equal(host.routes.size, 0);
});

await check('Duplicate managed and native names never overwrite configuration', async (t) => {
  const host = await fixture({ managed: true }); t.after(() => host.close());
  assert.equal((await add(host, 'duplicate')).ok, true);
  const before = structuredClone(host.managerEntry.options.config);
  assert.equal((await add(host, 'duplicate', stdio('other-command'))).ok, false);
  host.rows.push({ entry: { id: 'include:native', options: { id: 'native', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'native-name' } } } });
  assert.equal((await add(host, 'native-name')).ok, false);
  assert.deepEqual(host.managerEntry.options.config, before);
  assert.equal(host.trace.edits, 1);
});

await check('Concurrent same-name additions commit only one definition', async (t) => {
  const host = await fixture({ managed: true }); t.after(() => host.close());
  const results = await Promise.all([add(host, 'concurrent'), add(host, 'concurrent')]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(host.trace.edits, 1);
  await settle();
  assert.deepEqual(host.bridgeTrace.starts, ['concurrent']);
});

await check('Environment references resolve only in memory and never appear in catalog or persisted values', async (t) => {
  const key = 'DSH_MANUAL_MCP_FIXTURE_VALUE';
  const previous = process.env[key];
  process.env[key] = 'fixture-placeholder';
  t.after(() => { if (previous === undefined) Reflect.deleteProperty(process.env, key); else process.env[key] = previous; });
  const host = await fixture({ managed: true }); t.after(() => host.close());
  const result = await add(host, 'refs', { ...http, headersFromEnv: { 'X-Fixture': key } });
  await settle();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(host.bridgeRuns.get('refs').headers['X-Fixture'], 'fixture-placeholder');
  assert.equal(JSON.stringify(host.managerEntry.options.config).includes('fixture-placeholder'), false);
  const catalog = JSON.stringify((await host.rpc('mcp.managed')).value);
  assert.equal(catalog.includes('fixture-placeholder'), false);
  assert.equal(catalog.includes('fixture.invalid'), false);
});

await check('A missing environment reference fails before persistence and without echoing inputs', async (t) => {
  const host = await fixture({ managed: true }); t.after(() => host.close());
  const result = await add(host, 'missing-ref', { ...http, headersFromEnv: { 'X-Fixture': 'DSH_MCP_FIXTURE_MISSING_VARIABLE' } });
  assert.equal(result.ok, false);
  assert.match(result.error.message, /缺少环境变量/);
  assert.equal(host.trace.edits, 0);
  assert.equal(host.bridgeTrace.starts.length, 0);
});

await check('Unknown owner and Agent view cannot write managed MCP configuration', async (t) => {
  const noOwner = await fixture(); t.after(() => noOwner.close());
  assert.equal((await noOwner.rpc('mcp.managed')).value.writable, false);
  assert.equal((await add(noOwner, 'no-owner')).ok, false);
  const host = await fixture({ managed: true }); t.after(() => host.close());
  const result = await host.rpc('mcp.add', { sessionId: 'fixture-session', serverName: 'scoped', definition: stdio() });
  assert.equal(result.ok, false);
  assert.equal(host.trace.edits + noOwner.trace.edits, 0);
});

await check('Untested runtime cannot add managed MCP even through direct RPC', async (t) => {
  const previous = runtime.version; runtime.version = '0.2.1-alpha.4';
  t.after(() => { runtime.version = previous; });
  const host = await fixture({ managed: true }); t.after(() => host.close());
  assert.equal((await add(host, 'future')).error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
  assert.equal(host.trace.edits, 0);
});

await check('Cancellation during queued managed configuration save leaves definitions and connections unchanged', async (t) => {
  const host = await fixture({ managed: true }); t.after(() => host.close());
  const edit = host.ctx.get('configEditor').edit;
  let entered; let release;
  const arrival = new Promise((done) => { entered = done; });
  const gate = new Promise((done) => { release = done; });
  host.ctx.get('configEditor').edit = async (entry, change) => { entered(); await gate; return edit(entry, change); };
  const controller = new AbortController();
  const pending = add(host, 'cancelled', stdio(), controller.signal);
  await arrival; controller.abort(); release();
  assert.equal((await pending).ok, false);
  assert.deepEqual(host.managerEntry.options.config.managedServers, {});
  assert.equal(host.trace.edits, 0);
  assert.equal(host.bridgeTrace.starts.length, 0);
});

await check('Main MCP page offers a stdio form that saves without a map path', async (t) => {
  const host = await fixture({ managed: true }); t.after(() => host.close());
  const ui = await page(t, host);
  assert.equal(ui.button('新增 MCP').props.disabled, false);
  await ui.click('新增 MCP');
  await fill(ui, { 'MCP Server 名称': 'ui-stdio', 'MCP 启动命令': 'fixture-command', 'MCP 参数': '["fixture-script"]' });
  await submit(ui); await settle();
  assert.equal(host.managerEntry.options.config.managedServers['ui-stdio'].transport, 'stdio');
  assert.equal(ui.mutations().filter((row) => row.method === 'mcp.add').length, 1);
  assert.ok(ui.content().includes('连接状态仍为未知'));
});

await check('HTTP form saves HTTP configuration and hides stdio fields', async (t) => {
  const host = await fixture({ managed: true }); t.after(() => host.close());
  const ui = await page(t, host);
  await ui.click('新增 MCP');
  await fill(ui, { 'MCP 传输方式': 'streamable-http' });
  assert.equal(ui.renderer.root.findAllByProps({ 'aria-label': 'MCP 启动命令' }).length, 0);
  await fill(ui, { 'MCP Server 名称': 'ui-http', 'MCP HTTP 地址': 'http://fixture.invalid/mcp' });
  await submit(ui); await settle();
  assert.equal(host.managerEntry.options.config.managedServers['ui-http'].transport, 'streamable-http');
  assert.equal(host.bridgeRuns.has('ui-http'), true);
  assert.ok(ui.content().includes('MCP 配置已保存'));
  assert.deepEqual(ui.alerts(), []);
});

await check('Malformed argument JSON never reaches the add RPC', async (t) => {
  const host = await fixture({ managed: true }); t.after(() => host.close());
  const ui = await page(t, host);
  await ui.click('新增 MCP');
  await fill(ui, { 'MCP Server 名称': 'bad-json', 'MCP 启动命令': 'fixture-command', 'MCP 参数': '{}' });
  await submit(ui);
  assert.ok(ui.alerts().some((message) => message.includes('JSON 格式无效')));
  assert.equal(ui.mutations().length, 0);
});

await check('Generic mapping writes cannot bypass validation of managed configuration', async (t) => {
  const host = await fixture({ managed: true }); t.after(() => host.close());
  for (const action of ['upsert', 'remove']) {
    const args = { entryId: host.managerEntry.id, configPath: 'managedServers', name: 'bypass', definition: stdio() };
    assert.equal((await host.rpc(`mcp.${action}`, args)).ok, false);
    await assert.rejects(host.call('dsh_manage_mcp_servers', { ...args, action }));
  }
  assert.equal(host.trace.edits, 0);
});

await check('Config owner resolution accepts an alias with the same active Fiber identity', async (t) => {
  const host = await fixture({ managed: true }); t.after(() => host.close());
  host.managerEntry.options.name = 'fixture-module-alias';
  assert.equal((await add(host, 'aliased-owner')).ok, true);
});

await check('Failed local configuration reports a safe reason and retries without touching healthy instances', async (t) => {
  const key = 'DSH_MCP_RETRY_FIXTURE_VALUE'; const previous = process.env[key];
  Reflect.deleteProperty(process.env, key);
  t.after(() => { if (previous === undefined) Reflect.deleteProperty(process.env, key); else process.env[key] = previous; });
  const host = await fixture({ managed: true, managedServers: {
    healthy: normalizeServer('healthy', stdio()),
    retryable: normalizeServer('retryable', { ...http, headersFromEnv: { 'X-Fixture': key } }),
  } }); t.after(() => host.close());
  await settle();
  const first = host.bridgeRuns.get('healthy');
  const failed = (await host.rpc('mcp.managed')).value.servers.find((row) => row.serverName === 'retryable');
  assert.equal(failed.phase, 'failed'); assert.match(failed.error, /缺少环境变量/);
  const ui = await page(t, host);
  process.env[key] = 'fixture-placeholder';
  await ui.click('重试加载 MCP'); await settle();
  assert.equal(host.bridgeRuns.has('retryable'), true);
  assert.equal(host.bridgeRuns.get('healthy'), first);
  assert.deepEqual(host.bridgeTrace.stops, []);
  assert.equal(host.trace.edits, 0);
  assert.equal(JSON.stringify((await host.rpc('mcp.managed')).value).includes('fixture-placeholder'), false);
  assert.equal((await host.rpc('mcp.retry', { serverName: 'healthy' })).ok, false);
});

await check('A definition removed during bridge import cannot start the stale server', async () => {
  const bridge = await import('@deepseek-ai/dsh-mcp-client');
  const ctx = new Context(); const starts = [];
  ctx.reflect.provide('fixtureMcp', { start: (value) => starts.push(value.serverName), stop() {} });
  let desired = { stale: normalizeServer('stale', stdio()) }; let manager;
  let entered; let release;
  const arrival = new Promise((done) => { entered = done; });
  const gate = new Promise((done) => { release = done; });
  const fiber = ctx.plugin({ name: 'fixture-delayed-bridge', apply(child) {
    manager = createManagedMcp(child, { managedServers: { get: () => desired } }, {}, () => { entered(); return gate; });
  } });
  await arrival;
  desired = {}; release(bridge);
  await manager.sync(); await settle();
  assert.deepEqual(starts, []);
  await fiber.dispose(); await fiber.await();
});

await check('One cleanup failure does not stop other connections and exposes only a safe diagnostic', async () => {
  let desired = { broken: normalizeServer('broken', stdio()), keep: normalizeServer('keep', stdio()) };
  const fibers = new Map(); let cleanup; let fail = true;
  const ctx = { fiber: {}, configEditor: { configuration: () => [] }, on() {}, effect(fn) { cleanup = fn(); },
    plugin(plugin) {
      const name = plugin.name.slice('managed-mcp-'.length);
      const fiber = { state: 2, async dispose() { if (name === 'broken' && fail) throw new Error('fixture-private-dispose-detail'); }, async await() {} };
      fibers.set(name, fiber); return fiber;
    },
  };
  const manager = createManagedMcp(ctx, { managedServers: { get: () => desired } }, {}, async () => ({ apply() {} }));
  await manager.sync();
  const keep = fibers.get('keep');
  desired = { keep: desired.keep, added: normalizeServer('added', stdio()) };
  await manager.sync();
  assert.equal(fibers.get('keep'), keep); assert.equal(fibers.has('added'), true);
  const catalog = manager.catalog();
  assert.equal(catalog.servers.find((row) => row.serverName === 'broken').phase, 'failed');
  assert.equal(JSON.stringify(catalog).includes('fixture-private-dispose-detail'), false);
  fail = false;
  await manager.sync();
  assert.equal(manager.catalog().servers.some((row) => row.serverName === 'broken'), false);
  await cleanup();
});

await check('Disposal while bridge loading is pending cannot create a late child instance', async () => {
  let cleanup; let entered; let release; let starts = 0;
  const arrival = new Promise((done) => { entered = done; });
  const gate = new Promise((done) => { release = done; });
  const ctx = { fiber: {}, configEditor: { configuration: () => [] }, on() {}, effect(fn) { cleanup = fn(); }, plugin() { starts++; throw new Error('late creation'); } };
  createManagedMcp(ctx, { managedServers: { get: () => ({ pending: normalizeServer('pending', stdio()) }) } }, {}, () => { entered(); return gate; });
  await arrival;
  const closing = cleanup();
  release({ apply() {} });
  await closing;
  assert.equal(starts, 0);
});

await tick();
writeReport();
