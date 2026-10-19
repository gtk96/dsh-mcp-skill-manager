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
  assert.equal(host.bridgeRuns.get('manual-stdio').failOnStartupError, true);
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
  assert.equal(host.bridgeRuns.get('second').failOnStartupError, true);
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
  assert.equal(ui.button('添加托管 MCP').props.disabled, false);
  await ui.click('添加托管 MCP');
  await fill(ui, { 'MCP Server 名称': 'ui-stdio', 'MCP 启动命令': 'fixture-command', 'MCP 参数': '["fixture-script"]' });
  await submit(ui); await settle();
  assert.equal(host.managerEntry.options.config.managedServers['ui-stdio'].transport, 'stdio');
  assert.equal(ui.mutations().filter((row) => row.method === 'mcp.add').length, 1);
  assert.ok(ui.content().includes('连接状态仍为未知'));
});

await check('HTTP form saves HTTP configuration and hides stdio fields', async (t) => {
  const host = await fixture({ managed: true }); t.after(() => host.close());
  const ui = await page(t, host);
  await ui.click('添加托管 MCP');
  await fill(ui, { 'MCP 传输方式': 'streamable-http' });
  assert.equal(ui.renderer.root.findAllByProps({ 'aria-label': 'MCP 启动命令' }).length, 0);
  await fill(ui, { 'MCP Server 名称': 'ui-http', 'MCP HTTP 地址': 'http://fixture.invalid/mcp' });
  await submit(ui); await settle();
  assert.equal(host.managerEntry.options.config.managedServers['ui-http'].transport, 'streamable-http');
  assert.equal(host.bridgeRuns.has('ui-http'), true);
  assert.ok(ui.content().includes('MCP 配置已保存'));
  // The saved Server exposes no tools in this fixture, so the empty-Server warning is the only alert.
  assert.ok(ui.alerts().every((message) => message.includes('没有任何工具')));
});

await check('Malformed argument JSON never reaches the add RPC', async (t) => {
  const host = await fixture({ managed: true }); t.after(() => host.close());
  const ui = await page(t, host);
  await ui.click('添加托管 MCP');
  await fill(ui, { 'MCP Server 名称': 'bad-json', 'MCP 启动命令': 'fixture-command', 'MCP 参数': '{}' });
  await submit(ui);
  assert.ok(ui.alerts().some((message) => message.includes('JSON 格式无效')));
  assert.equal(ui.mutations().length, 0);
});

await check('Reconnecting a native MCP row rewrites only its bookkeeping field', async (t) => {
  const host = await fixture();
  t.after(() => host.close());
  const native = { id: 'include:mcp-native', options: { id: 'mcp-native', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'native', transport: 'streamable-http', url: 'http://fixture.invalid/mcp', headers: {} } } };
  host.rows.push({ entry: native, inherited: {}, override: {} });
  const before = structuredClone(native.options.config);
  const first = await host.rpc('mcp.reconnect', { entryId: 'include:mcp-native' });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.value.attempt, 1);
  const after = native.options.config;
  assert.equal(after.serverName, before.serverName);
  assert.equal(after.url, before.url);
  assert.deepEqual(after.headers, before.headers);
  assert.equal(after.mcpManagerReconnect.attempt, 1);
  const second = await host.rpc('mcp.reconnect', { entryId: 'include:mcp-native' });
  assert.equal(second.value.attempt, 2, 'Each reconnect must change the field so DSH remounts the row');
});

await check('Reconnect refuses a managed row and a caller that is not the owner', async (t) => {
  const managedHost = await fixture({ managed: true }); t.after(() => managedHost.close());
  const managed = await managedHost.rpc('mcp.reconnect', { entryId: managedHost.managerEntry.id });
  assert.equal(managed.ok, false);
  assert.match(managed.error.message, /托管|重试加载/);

  const denied = await fixture({ admitDenied: true });
  t.after(() => denied.close());
  const native = { id: 'include:mcp-native', options: { id: 'mcp-native', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'native', transport: 'streamable-http', url: 'http://fixture.invalid/mcp' } } };
  denied.rows.push({ entry: native, inherited: {}, override: {} });
  const refused = await denied.rpc('mcp.reconnect', { entryId: 'include:mcp-native' });
  assert.equal(refused.error.code, 'MCP_SKILL_MANAGER_FORBIDDEN');
  assert.equal(denied.trace.edits, 0);
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

await check('Settings groups tools only when exactly one configured Server name matches', async (t) => {
  const host = await fixture({ managed: true }); t.after(() => host.close());
  const discovered = (await host.rpc('mcp.discover')).value;
  const configured = ['foo', 'foo', 'foo__bar', 'clean'].map((serverName, index) => ({
    serverName, entryId: `fixture-${index}`, kind: 'profile-config',
  }));
  const candidates = ['mcp__foo__bar__ping', 'mcp__foo__ping', 'mcp__clean__ping', 'mcp__other__ping']
    .map((name) => ({ name, definitionView: 'profile' }));
  const ui = await page(t, host, (method) => method === 'mcp.discover'
    ? { ok: true, value: { ...discovered, configured, candidates, tools: candidates } } : undefined);
  const groups = ui.renderer.root.findAllByType('details');
  const group = (label) => groups.find((item) => item.findByType('summary').children.join('').startsWith(label));
  assert.equal(group('foo（'), undefined);
  assert.match(group('foo__bar（').findByType('summary').children.join(''), /0 个候选工具/);
  assert.match(group('clean（').findByType('summary').children.join(''), /1 个候选工具/);
  const unassociated = group('未关联 Server（');
  assert.match(unassociated.findByType('summary').children.join(''), /3 个工具 · 2 条配置/);
  const displayed = (node) => typeof node === 'string' ? node : node.children.map(displayed).join('');
  const unassociatedText = displayed(unassociated);
  assert.ok(unassociatedText.includes('mcp__foo__bar__ping'));
  assert.ok(unassociatedText.includes('mcp__foo__ping'));
  assert.ok(unassociatedText.includes('mcp__other__ping'));
  assert.equal(displayed(group('clean（')).includes('mcp__other__ping'), false);
});

await check("Settings leaves tools unmatched when unique Server names overlap", async (t) => {
  const host = await fixture({ managed: true }); t.after(() => host.close());
  const discovered = (await host.rpc("mcp.discover")).value;
  const configured = ["bar", "bar__baz"].map((serverName, index) => ({
    serverName, entryId: "fixture-" + index, kind: "profile-config",
  }));
  const candidates = [{ name: "mcp__bar__baz__ping", definitionView: "profile" }];
  const ui = await page(t, host, (method) => method === "mcp.discover"
    ? { ok: true, value: { ...discovered, configured, candidates, tools: candidates } } : undefined);
  const groups = ui.renderer.root.findAllByType("details");
  const group = (label) => groups.find((item) => item.findByType("summary").children.join("").startsWith(label));
  assert.match(group("bar\uff08").findByType("summary").children.join(""), /0 \u4e2a\u5019\u9009\u5de5\u5177/);
  assert.match(group("bar__baz\uff08").findByType("summary").children.join(""), /0 \u4e2a\u5019\u9009\u5de5\u5177/);
  const unassociated = group("\u672a\u5173\u8054 Server\uff08");
  assert.match(unassociated.findByType("summary").children.join(""), /1 \u4e2a\u5de5\u5177 \u00b7 0 \u6761\u914d\u7f6e/);
  const displayed = (node) => typeof node === "string" ? node : node.children.map(displayed).join("");
  assert.ok(displayed(unassociated).includes("mcp__bar__baz__ping"));
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

await check('Async bridge startup failure is redacted and retry preserves healthy Cordis fibers without editing config', async () => {
  const desired = {
    healthy: normalizeServer('healthy', stdio()),
    retryable: normalizeServer('retryable', stdio()),
  };
  const starts = []; const stops = []; let fail = true; let edits = 0;
  const ctx = new Context(); let manager; let owner;
  ctx.reflect.provide('configEditor', {
    configuration: () => [{ entry: owner }],
    async edit() { edits++; throw new Error('Retry must not edit configuration'); },
  });
  const bridge = { async apply(child, actual) {
    starts.push(actual.serverName);
    if (actual.serverName === 'retryable' && fail) {
      fail = false;
      await tick();
      // The native bridge reports an initial connection failure only in strict startup mode.
      if (actual.failOnStartupError) throw new Error('fixture-private-bridge-detail');
      return;
    }
    child.effect(() => () => { stops.push(actual.serverName); });
  } };
  const fiber = ctx.plugin({ name: 'fixture-async-bridge-owner', apply(child) {
    owner = { fiber: child.fiber };
    manager = createManagedMcp(child, { managedServers: { get: () => desired } },
      { async assertWrite() {} }, async () => bridge);
  } });
  try {
    await fiber.await(); await manager.sync();
    const failed = manager.catalog().servers.find((row) => row.serverName === 'retryable');
    assert.equal(failed.phase, 'failed');
    assert.equal(failed.error, '本地 MCP 加载失败，请检查官方桥接器。');
    assert.equal(JSON.stringify(manager.catalog()).includes('fixture-private-bridge-detail'), false);
    assert.deepEqual(starts, ['healthy', 'retryable']);
    assert.deepEqual(stops, []);
    const signal = new AbortController().signal;
    await assert.rejects(manager.retry({ serverName: 'healthy' }, signal), /只允许重试/);
    await manager.retry({ serverName: 'retryable' }, signal);
    assert.deepEqual(starts, ['healthy', 'retryable', 'retryable']);
    assert.deepEqual(stops, []);
    assert.equal(manager.catalog().servers.find((row) => row.serverName === 'retryable').phase, 'declared');
    assert.equal(edits, 0);
  } finally {
    await fiber.dispose(); await fiber.await();
  }
  assert.deepEqual(stops.sort(), ['healthy', 'retryable']);
});

await check('A removed or replaced definition during bridge startup releases its stale fiber', async () => {
  for (const replacement of [false, true]) {
    let desired = { stale: normalizeServer('stale', stdio()) };
    const starts = []; const stops = []; let entered; let release; let manager;
    const arrival = new Promise((resolve) => { entered = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    const ctx = new Context();
    const bridge = { async apply(child, actual) {
      const id = `${actual.serverName}:${actual.command}`;
      starts.push(id);
      child.effect(() => () => { stops.push(id); });
      if (id === 'stale:fixture-command') { entered(); await gate; }
    } };
    const fiber = ctx.plugin({ name: `fixture-stale-startup-${replacement}`, apply(child) {
      manager = createManagedMcp(child, { managedServers: { get: () => desired } },
        {}, async () => bridge, { startupTimeoutMs: 300, cleanupTimeoutMs: 100 });
    } });
    try {
      await fiber.await(); await arrival;
      desired = {
        ...(replacement ? { stale: normalizeServer('stale', stdio('replacement-command')) } : {}),
        healthy: normalizeServer('healthy', stdio()),
      };
      release(); await manager.sync();
      assert.equal(stops.filter((id) => id === 'stale:fixture-command').length, 1);
      assert.equal(starts.filter((id) => id === 'healthy:fixture-command').length, 1);
      assert.equal(starts.filter((id) => id === 'stale:replacement-command').length, Number(replacement));
      assert.equal(manager.catalog().servers.some((row) => row.serverName === 'stale'), replacement);
    } finally {
      release();
      await fiber.dispose(); await fiber.await();
    }
  }
});

await check('Pending bridge startup bounds the queue, quarantines its name, and leaves healthy connections reusable', async () => {
  let desired = { stalled: normalizeServer('stalled', stdio()), healthy: normalizeServer('healthy', stdio()) };
  const starts = []; const stops = []; let release; let edits = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const ctx = new Context(); let manager; let owner;
  ctx.reflect.provide('configEditor', {
    configuration: () => [{ entry: owner }],
    async edit(entry, change) {
      assert.equal(entry, owner);
      edits++;
      desired = change({ managedServers: desired }).managedServers;
    },
  });
  const bridge = { async apply(child, actual) {
    starts.push(actual.serverName);
    if (actual.serverName === 'stalled' && starts.filter((name) => name === 'stalled').length === 1) await gate;
    child.effect(() => () => { stops.push(actual.serverName); });
  } };
  const fiber = ctx.plugin({ name: 'fixture-pending-bridge-owner', apply(child) {
    owner = { fiber: child.fiber };
    manager = createManagedMcp(child, { managedServers: { get: () => desired } },
      { async assertWrite() {} }, async () => bridge, { startupTimeoutMs: 30, cleanupTimeoutMs: 30 });
  } });
  try {
    await fiber.await();
    await manager.sync();
    assert.deepEqual(starts, ['stalled', 'healthy']);
    assert.match(manager.catalog().servers.find((row) => row.serverName === 'stalled').error, /启动超时/);
    const healthy = starts.filter((name) => name === 'healthy').length;
    assert.equal((await manager.add({ serverName: 'added', definition: stdio() }, new AbortController().signal)).saved, true);
    assert.deepEqual(starts, ['stalled', 'healthy', 'added']);
    assert.equal(edits, 1);
    await assert.rejects(manager.retry({ serverName: 'stalled' }, new AbortController().signal), /清理超时/);
    assert.equal(starts.filter((name) => name === 'stalled').length, 1);
    assert.equal(starts.filter((name) => name === 'healthy').length, healthy);
    assert.deepEqual(stops, []);
    release(); await tick(); await tick();
    await manager.retry({ serverName: 'stalled' }, new AbortController().signal);
    assert.equal(starts.filter((name) => name === 'stalled').length, 2);
    assert.equal(starts.filter((name) => name === 'healthy').length, healthy);
    assert.equal(edits, 1);
  } finally {
    release();
    await fiber.dispose(); await fiber.await();
  }
  assert.deepEqual(stops.sort(), ['added', 'healthy', 'stalled']);
});

await check('A permanently pending bridge import bounds sync and save without mounting stale servers', async () => {
  const desired = { pending: normalizeServer('pending', stdio()), second: normalizeServer('second', stdio()) };
  const ctx = new Context(); let manager; let edits = 0; let imports = 0;
  ctx.reflect.provide('configEditor', {
    configuration: () => [{ entry: { fiber: manager?.ctxFiber } }],
    async edit() { edits++; },
  });
  const fiber = ctx.plugin({ name: 'fixture-pending-bridge-import', apply(child) {
    manager = createManagedMcp(child, { managedServers: { get: () => desired } },
      { async assertWrite() {} }, () => { imports++; return new Promise(() => {}); }, { startupTimeoutMs: 25 });
    manager.ctxFiber = child.fiber;
  } });
  try {
    await fiber.await(); await manager.sync();
    assert.equal(imports, 1);
    assert.equal(manager.catalog().servers.length, 2);
    assert.equal(manager.catalog().servers.every((row) => /加载超时/.test(row.error)), true);
    await assert.rejects(manager.add({ serverName: 'new', definition: stdio() }, new AbortController().signal), /加载超时/);
    assert.equal(imports, 2);
    assert.equal(edits, 0);
  } finally {
    await fiber.dispose(); await fiber.await();
  }
});

await check('A timed-out bridge import cannot replace a later healthy bridge', async () => {
  const desired = { delayed: normalizeServer('delayed', stdio()), healthy: normalizeServer('healthy', stdio()) };
  const starts = []; const stale = []; let release; let calls = 0; let manager;
  const gate = new Promise((resolve) => { release = resolve; });
  const ctx = new Context();
  const current = { apply(child, actual) { starts.push(actual.serverName); child.effect(() => () => {}); } };
  const old = { apply(child, actual) { stale.push(actual.serverName); child.effect(() => () => {}); } };
  const fiber = ctx.plugin({ name: 'fixture-late-bridge-import', apply(child) {
    manager = createManagedMcp(child, { managedServers: { get: () => desired } },
      { async assertWrite() {} }, () => ++calls === 1 ? gate : current, { startupTimeoutMs: 25 });
  } });
  try {
    await fiber.await(); await manager.sync();
    assert.deepEqual(starts, []);
    assert.equal(calls, 1);
    assert.equal(manager.catalog().servers.find((row) => row.serverName === 'delayed').phase, 'failed');
    assert.equal(manager.catalog().servers.find((row) => row.serverName === 'healthy').phase, 'failed');
    await manager.retry({ serverName: 'delayed' }, new AbortController().signal);
    await manager.retry({ serverName: 'healthy' }, new AbortController().signal);
    release(old); await tick();
    assert.deepEqual(starts, ['delayed', 'healthy']);
    assert.deepEqual(stale, []);
    assert.equal(calls, 2);
  } finally {
    release(old);
    await fiber.dispose(); await fiber.await();
  }
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
      plugin.apply({ plugin() { return { async await() {} }; } });
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
