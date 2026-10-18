import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { Context } from '@deepseek-ai/cordis';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import semver from 'semver';
import * as plugin from './host.mjs';

const require = createRequire(import.meta.url);
const { updateVolatile } = createRequire(require.resolve('@deepseek-ai/cordis/package.json'))('@deepseek-ai/cosmokit');
const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const clone = (value) => structuredClone(value);
const tick = () => new Promise((done) => setImmediate(done));
const results = [];
const progress = resolve(root, 'test-progress.log');
writeFileSync(progress, 'isolated test module loaded\n');
const mark = (message) => appendFileSync(progress, message + '\n');
const hashes = {};
for (const [fixture, source] of [['host.mjs', 'index.js'], ['client.js', 'client.js'], ['discovery.js', 'discovery.js'], ['compatibility.js', 'compatibility.js'], ['managed-mcp.js', 'managed-mcp.js'], ['package.json', 'package.json']]) {
  const copy = readFileSync(resolve(root, fixture));
  assert.deepEqual(copy, readFileSync(resolve(repo, source)), 'Tested fixture must match the actual plugin source');
  hashes[source] = createHash('sha256').update(copy).digest('hex');
}

async function check(name, run) {
  mark('scheduled: ' + name);
  const outcome = { name, status: 'pending' };
  const failed = (error) => {
    outcome.status = 'failed';
    outcome.error = String(error.message);
  };
  await test(name, { timeout: 8000 }, async (t) => {
    mark('started: ' + name);
    const guarded = {
      after(callback) {
        t.after(async () => {
          try { await callback(); }
          catch (error) { failed(error); throw error; }
        });
      },
    };
    try {
      await run(guarded);
      mark('body passed: ' + name);
      if (outcome.status !== 'failed') outcome.status = 'passed';
    } catch (error) {
      mark('body failed: ' + name);
      failed(error);
      throw error;
    }
  });
  if (outcome.status === 'pending') failed(new Error('Test did not complete'));
  results.push(outcome);
  mark('settled: ' + name);
}

function writeReport() {
  writeFileSync(resolve(root, 'results.json'), JSON.stringify({
    packageVersion: JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8')).version,
    nodeVersion: process.version,
    fixtureRuntimeVersion: JSON.parse(readFileSync(resolve(root, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).version,
    sourceSha256: hashes,
    framework: { cordis: '4.0.4', react: '18.3.1', renderer: 'react-test-renderer' },
    isolation: 'In-process fixtures only; no active DSH API, Profile, window, process control, or network requests',
    passed: results.filter((r) => r.status === 'passed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    runnerExitCode: process.exitCode ?? 0,
    results,
  }, null, 2) + '\n');
}

async function fixture(options = {}) {
  const ctx = new Context();
  const tools = new Map();
  const routes = new Map();
  const runtime = new Map();
  const trace = { edits: 0, registrations: 0, rollbacks: 0, snapshots: [], lookups: [], toolScopes: [], sessionLists: 0 };
  const agents = new Map((options.agents ?? []).map((agent) => [agent.id, agent]));
  const definitions = (scope) => {
    const values = new Map([...tools.values(), ...(options.globalTools ?? [])].map((tool) => [tool.name, tool]));
    for (const tool of options.scopedTools?.[scope?.id] ?? []) values.set(tool.name, tool);
    for (const name of options.hidden?.[scope?.id] ?? []) values.delete(name);
    return values;
  };
  const skillRows = (lookup) => options.skillRows?.[lookup.scope?.id ?? 'profile'] ?? [];
  const inherited = clone(options.inherited ?? {});
  let override = clone(options.override ?? {
    maps: { A: { demo: { command: 'fixture-a' } }, B: { demo: { command: 'fixture-b' } } },
    unrelated: { keep: true },
  });
  const entry = { id: 'include:fixture', options: { id: 'fixture', name: 'fixture-plugin', config: clone(options.current ?? override) } };
  const rows = [{ entry, inherited, get override() { return clone(override); } }];
  const configEditor = {
    configuration: () => rows,
    async edit(target, change) {
      if (target === managerEntry) {
        const next = change(clone(target.options.config), {});
        trace.edits++;
        target.options.config = clone(next);
        updateVolatile(fiber.config.managedServers, plugin.Config(next).managedServers);
        const self = Object.create(fiber.ctx);
        self[Context.filter] = (owner) => owner.fiber === fiber;
        fiber.ctx.emit(self, 'loader/volatile-update', [['managedServers']]);
        return;
      }
      assert.equal(target, entry);
      trace.edits++;
      const next = change(clone(entry.options.config), clone(inherited));
      entry.options.config = clone(next);
      override = clone(next);
    },
  };
  const skills = {
    async snapshot(lookup) {
      trace.snapshots.push(lookup);
      if (options.snapshot) return options.snapshot({ runtime, trace, lookup });
      return { skills: [...skillRows(lookup), ...runtime.values()].map((v) => ({ ...v })), complete: true };
    },
    async get(name, lookup) {
      trace.lookups.push(lookup);
      if (options.get) return options.get({ name, runtime, trace, lookup });
      return skillRows(lookup).find((skill) => skill.name === name) ?? runtime.get(name);
    },
    register(value) {
      trace.registrations++;
      runtime.set(value.name, { ...value });
      let live = true;
      return () => {
        if (!live) return;
        live = false;
        trace.rollbacks++;
        runtime.delete(value.name);
      };
    },
  };
  const connection = {
    fetch: {
      register(route) {
        assert.equal(routes.has(route.path), false, 'Routes must not register twice');
        routes.set(route.path, route);
        return () => { routes.delete(route.path); };
      },
    },
  };
  ctx.reflect.provide('configEditor', configEditor);
  ctx.reflect.provide('skills', skills);
  ctx.reflect.provide('tools', {
    register(tool) {
      assert.equal(tools.has(tool.name), false, 'Tools must not register twice');
      tools.set(tool.name, tool);
      return () => { tools.delete(tool.name); };
    },
    schemas(scope) {
      trace.toolScopes.push(scope?.id ?? null);
      return [...definitions(scope).values()].map(({ name }) => ({ name, description: 'Fixture tool', parameters: { type: 'object' } }));
    },
    get(name, scope) { return definitions(scope).get(name); },
  });
  if (options.agents !== undefined) {
    ctx.reflect.provide('agents', { list: () => [...agents.values()], get: (id) => agents.get(id) });
    ctx.reflect.provide('sessionQuery', {
      async listSessions() {
        trace.sessionLists++;
        return clone(options.records ?? [...agents.values()].map((agent) => ({ header: agent.session.header })));
      },
      readSession() { throw new Error('Discovery must not read conversation logs'); },
    });
  }
  if (options.presets) ctx.reflect.provide('agentPresets', {
    serviceFor: (agent, name) => options.services?.[agent.id]?.[name],
    composedPreset: (context) => context?.preset,
    compositionInventory: async () => options.inventory ?? [],
  });
  let managerEntry;
  const bridgeRuns = new Map();
  const bridgeTrace = { starts: [], stops: [] };
  ctx.reflect.provide('fixtureMcp', {
    start(config) { bridgeRuns.set(config.serverName, config); bridgeTrace.starts.push(config.serverName); },
    stop(name) { bridgeRuns.delete(name); bridgeTrace.stops.push(name); },
  });
  let removeConnection;
  if (options.web !== false) removeConnection = ctx.reflect.provide('connection', connection);
  const fiber = await ctx.plugin(plugin, { mcpConfigPath: 'maps.A', managedServers: options.managedServers ?? {} });
  if (options.managed) {
    managerEntry = { id: 'include:mcp-skill-manager', fiber, options: { id: 'mcp-skill-manager', name: 'dsh-mcp-skill-manager', config: { mcpConfigPath: 'maps.A', managedServers: clone(options.managedServers ?? {}) } } };
    rows.push({ entry: managerEntry, inherited: {}, override: {} });
  }
  await tick();
  const exec = (extra = {}) => ({ signal: new AbortController().signal, ...extra });
  const call = (name, args, extra) => tools.get(name).execute(args, exec(extra));
  const rpc = async (method, payload = {}, signal) => {
    const endpoint = 'mcp-skill-manager.' + method;
    const route = routes.get('/api/' + endpoint);
    assert.ok(route, 'Requested isolated route must be registered');
    const request = new Request('https://fixture.invalid/api/' + endpoint, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'fixture-request', method: endpoint, payload }),
    });
    const response = await route.fetch(request);
    const envelope = await response.json();
    assert.equal(envelope.type, 'server-response');
    assert.equal(envelope.rpcId, 'fixture-request');
    return envelope.result;
  };
  return {
    ctx, fiber, tools, routes, runtime, trace, entry, inherited, rows, skills, agents, managerEntry, bridgeRuns, bridgeTrace,
    call, rpc,
    async attachWeb() { removeConnection = ctx.reflect.provide('connection', connection); await tick(); await tick(); },
    async detachWeb() { if (removeConnection) { await removeConnection(); removeConnection = undefined; } await tick(); },
    async close() { await fiber.dispose(); await fiber.await(); },
  };
}

function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children ?? []).map(text).join('');
}

async function page(t, host, intercept, sessionRows = {}) {
  let exports;
  let Page;
  const disposers = [];
  const requests = [];
  const styles = new Set();
  const document = {
    createElement: () => { const element = { dataset: {}, textContent: '', remove() { styles.delete(element); } }; return element; },
    head: { appendChild: (element) => styles.add(element) },
  };
  const sandbox = {
    window: { __ModuleLoader__: { load: (registration) => {
      assert.equal(registration.id, 'dsh-mcp-skill-manager');
      exports = registration.factory((id) => { assert.equal(id, 'react'); return React; });
    } } },
    document,
    console,
  };
  vm.runInNewContext(readFileSync(resolve(root, 'client.js'), 'utf8'), sandbox, { filename: 'isolated-client.js' });
  const connection = { rpc: { async call(channel, endpoint, args) {
    assert.equal(channel, '/api');
    const method = endpoint.slice('mcp-skill-manager.'.length);
    requests.push({ method, args: clone(args) });
    if (intercept) {
      const result = intercept(method, args);
      if (result !== undefined) return result;
    }
    return host.rpc(method, args);
  } } };
  exports.apply({
    connection,
    effect(setup) { const dispose = setup(); if (dispose) disposers.push(dispose); return dispose; },
    slots: {
      inject(name, setup) { assert.equal(name, 'settings.section'); const dispose = setup(); if (dispose) disposers.push(dispose); return dispose; },
      register(options, component) { assert.equal(options.id, 'mcp-skill-manager'); Page = component; return () => {}; },
    },
  });
  assert.ok(Page);
  let renderer;
  await act(async () => { renderer = Renderer.create(React.createElement(Page, { useSessions: (selector) => selector({ byId: sessionRows }) })); await tick(); });
  t.after(async () => {
    await act(async () => { renderer.unmount(); });
    for (const dispose of disposers.reverse()) dispose();
    assert.equal(styles.size, 0);
  });
  return {
    renderer, requests,
    button(label) { return renderer.root.findAllByType('button').find((node) => text(node) === label); },
    path() { return renderer.root.findByProps({ placeholder: 'mcp.servers' }); },
    async click(label) {
      const button = this.button(label);
      assert.ok(button, 'Expected button: ' + label);
      assert.equal(!!button.props.disabled, false, 'Button must be enabled: ' + label);
      await act(async () => { await button.props.onClick(); await tick(); });
    },
    async setPath(value) { await act(async () => { this.path().props.onChange({ currentTarget: { value } }); }); },
    alerts() { return renderer.root.findAllByProps({ role: 'alert' }).map(text); },
    content() { return text(renderer.root); },
    mutations() { return requests.filter(({ method }) => ['mcp.retry', 'mcp.add', 'mcp.upsert', 'mcp.remove', 'skills.register', 'skills.unregister'].includes(method)); },
  };
}

await check('Host activates without Web and registers its tools using real Cordis', async (t) => {
  const host = await fixture({ web: false });
  t.after(() => host.close());
  assert.equal(host.fiber.state, 2);
  assert.deepEqual([...host.tools.keys()].sort(), ['dsh_manage_mcp_servers', 'dsh_manage_skills']);
  assert.equal(host.routes.size, 0);
});

await check('Optional Web arrival and removal do not stop Host tools or leak routes', async (t) => {
  const host = await fixture({ web: false });
  t.after(() => host.close());
  await host.attachWeb();
  assert.equal(host.routes.size, 13);
  await host.detachWeb();
  assert.equal(host.routes.size, 0);
  assert.equal(host.tools.size, 2);
  await host.attachWeb();
  assert.equal(host.routes.size, 13);
});

await check('Disposal removes owned routes, tools and Runtime Skills', async () => {
  const host = await fixture();
  await host.call('dsh_manage_skills', { action: 'register', name: 'fixture-skill', description: 'Fixture', content: 'Fixture instructions' });
  assert.equal(host.runtime.size, 1);
  await host.close();
  assert.equal(host.routes.size, 0);
  assert.equal(host.tools.size, 0);
  assert.equal(host.runtime.size, 0);
});

await check('Catalog uses effective Loader config, true row identity and blank-path fallback', async (t) => {
  const host = await fixture({ inherited: { maps: { A: { obsolete: {} } } }, override: { maps: { A: { overridden: {} } } }, current: { maps: { A: { actual: { command: 'fixture-command' } } } } });
  t.after(() => host.close());
  const value = await host.call('dsh_manage_mcp_servers', { action: 'list', configPath: '  ' });
  assert.equal(value.configPath, 'maps.A');
  assert.deepEqual(value.entries[0].entry, { id: 'include:fixture', patchId: 'fixture', name: 'fixture-plugin' });
  assert.deepEqual(Object.keys(value.entries[0].servers), ['actual']);
  assert.equal(value.entries[0].servers.actual.values.command, '[configured]');
});

await check('Ambiguous config names reject edits without touching fixture data', async (t) => {
  const host = await fixture();
  t.after(() => host.close());
  host.rows.push({ entry: { id: 'include:other', options: { id: 'other', name: 'fixture-plugin', config: {} } }, inherited: {}, override: {} });
  await assert.rejects(host.call('dsh_manage_mcp_servers', { action: 'upsert', entryId: 'fixture-plugin', name: 'demo', definition: {} }), /Multiple config entries/);
  assert.equal(host.trace.edits, 0);
});

await check('Override removal restores inherited definition and preserves other fixture fields', async (t) => {
  const inherited = { maps: { A: { demo: { command: 'inherited-fixture' } } } };
  const host = await fixture({ inherited });
  t.after(() => host.close());
  const value = await host.call('dsh_manage_mcp_servers', { action: 'remove', entryId: 'fixture', name: 'demo' });
  assert.equal(value.inheritedRemains, true);
  assert.deepEqual(host.entry.options.config.maps.A.demo, inherited.maps.A.demo);
  assert.equal(host.entry.options.config.maps.B.demo.command, 'fixture-b');
  assert.deepEqual(host.entry.options.config.unrelated, { keep: true });
});

await check('External provider TypeErrors are sanitized at both tool and RPC boundaries', async (t) => {
  const host = await fixture({ snapshot: () => { throw new TypeError('fixture-provider-detail'); } });
  t.after(() => host.close());
  await assert.rejects(host.call('dsh_manage_skills', { action: 'list' }), (error) => !error.message.includes('fixture-provider-detail'));
  const result = await host.rpc('skills.list');
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result).includes('fixture-provider-detail'), false);
});

await check('Malformed RPC envelopes are rejected before provider or config calls', async (t) => {
  const host = await fixture();
  t.after(() => host.close());
  const endpoint = 'mcp-skill-manager.skills.register';
  const route = host.routes.get('/api/' + endpoint);
  const request = new Request('https://fixture.invalid/api/' + endpoint, { method: 'POST', body: JSON.stringify({ type: 'wrong', rpcId: 'fixture', method: endpoint }) });
  assert.equal((await route.fetch(request)).status, 400);
  assert.equal(host.trace.registrations, 0);
  assert.equal(host.trace.edits, 0);
});

await check('Skill discovery receives the actual Agent scope and session cwd', async (t) => {
  const host = await fixture();
  t.after(() => host.close());
  const agent = { session: { header: { cwd: '/fixture/project' } } };
  const value = await host.call('dsh_manage_skills', { action: 'list' }, { agent });
  assert.equal(value.scope, 'agent');
  assert.equal(host.trace.snapshots[0].scope, agent);
  assert.equal(host.trace.snapshots[0].cwd, '/fixture/project');
  assert.equal(value.complete, true);
});

await check('Incomplete initial Skill discovery prevents any Runtime registration', async (t) => {
  const host = await fixture({ snapshot: () => ({ skills: [], complete: false }) });
  t.after(() => host.close());
  await assert.rejects(host.call('dsh_manage_skills', { action: 'register', name: 'fixture-skill', description: 'Fixture', content: 'Fixture' }), /incomplete/);
  assert.equal(host.trace.registrations, 0);
  assert.equal(host.runtime.size, 0);
});

await check('Incomplete post-registration discovery rolls back and clears pending name', async (t) => {
  let incomplete = true;
  const host = await fixture({ snapshot: ({ runtime, trace }) => ({ skills: [...runtime.values()], complete: !(incomplete && trace.registrations > 0) }) });
  t.after(() => host.close());
  const args = { action: 'register', name: 'fixture-skill', description: 'Fixture', content: 'Fixture' };
  await assert.rejects(host.call('dsh_manage_skills', args), /rolled back/);
  assert.equal(host.runtime.size, 0);
  assert.equal(host.trace.rollbacks, 1);
  incomplete = false;
  assert.equal((await host.call('dsh_manage_skills', args)).persisted, false);
});

await check('Cancellation during registration rolls back the borrowed Skill', async (t) => {
  const controller = new AbortController();
  const host = await fixture({ get: ({ name, runtime }) => { const value = runtime.get(name); controller.abort(); return value; } });
  t.after(() => host.close());
  await assert.rejects(host.call('dsh_manage_skills', { action: 'register', name: 'fixture-skill', description: 'Fixture', content: 'Fixture' }, { signal: controller.signal }));
  assert.equal(host.runtime.size, 0);
  assert.equal(host.trace.rollbacks, 1);
});

await check('React page loads through the real in-process Host RPC envelopes', async (t) => {
  const host = await fixture();
  t.after(() => host.close());
  const ui = await page(t, host);
  assert.equal(ui.path().props.value, 'maps.A');
  assert.equal(ui.alerts().length, 0);
  assert.equal(ui.button('移除').props.disabled, false);
  assert.equal(ui.mutations().length, 0);
});

await check('Changing A to B locks old cards; only a successful B read permits removal of B', async (t) => {
  const host = await fixture();
  t.after(() => host.close());
  const ui = await page(t, host);
  await ui.click('移除');
  assert.ok(ui.button('确认移除'));
  await ui.setPath('maps.B');
  assert.equal(ui.button('确认移除'), undefined);
  assert.equal(ui.button('移除').props.disabled, true);
  assert.equal(ui.button('编辑 override').props.disabled, true);
  assert.equal(ui.button('新增 MCP server').props.disabled, true);
  assert.equal(ui.mutations().length, 0);
  await ui.click('读取配置');
  await ui.click('移除');
  await ui.click('确认移除');
  const removal = ui.mutations().find(({ method }) => method === 'mcp.remove');
  assert.equal(removal.args.configPath, 'maps.B');
  assert.equal(host.entry.options.config.maps.A.demo.command, 'fixture-a');
  assert.equal(Object.hasOwn(host.entry.options.config.maps.B, 'demo'), false);
});

await check('Clearing the path closes an old edit form and cannot fall back to another write target', async (t) => {
  const host = await fixture();
  t.after(() => host.close());
  const ui = await page(t, host);
  await ui.click('编辑 override');
  assert.equal(ui.renderer.root.findAllByType('form').length, 1);
  await ui.setPath('');
  assert.equal(ui.renderer.root.findAllByType('form').length, 0);
  assert.equal(ui.button('移除').props.disabled, true);
  assert.equal(ui.button('新增 MCP server').props.disabled, true);
  assert.equal(ui.mutations().length, 0);
});

await check('A response arriving after path input changed does not authorize that new path', async (t) => {
  const host = await fixture();
  t.after(() => host.close());
  let release;
  const pending = new Promise((done) => { release = done; });
  let intercepted = false;
  const ui = await page(t, host, (method) => {
    if (method === 'mcp.catalog' && !intercepted) { intercepted = true; return pending; }
  });
  await ui.setPath('maps.B');
  await act(async () => { release(await host.rpc('mcp.catalog')); await tick(); });
  assert.equal(ui.path().props.value, 'maps.B');
  assert.equal(ui.button('移除').props.disabled, true);
  assert.equal(ui.mutations().length, 0);
});

await check('Malformed catalog results show an error rather than enabling empty catalog writes', async (t) => {
  const host = await fixture();
  t.after(() => host.close());
  const ui = await page(t, host, (method) => method === 'mcp.catalog' ? { ok: true, value: {} } : undefined);
  assert.ok(ui.alerts().some((value) => value.includes('返回格式无效')));
  assert.equal(ui.button('新增 MCP server').props.disabled, true);
});

await check('Incomplete Skill discovery is displayed as incomplete, not confirmed empty', async (t) => {
  const host = await fixture({ snapshot: () => ({ skills: [], complete: false }) });
  t.after(() => host.close());
  const ui = await page(t, host);
  await ui.click('Skills');
  assert.ok(ui.content().includes('Skill 发现尚未完成'));
  assert.equal(ui.content().includes('当前 Profile 全局目录没有可见 Skill'), false);
});

await check('Both optional DSH peers accept verified baselines with default semver prerelease rules', async () => {
  const manifest = JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8'));
  for (const name of ['@deepseek-ai/dsh', '@deepseek-ai/dsh-mcp-client']) {
    const range = manifest.peerDependencies[name];
    for (const version of ['0.2.0-rc.2', '0.2.1-rc.2', '0.2.1-rc.3']) assert.equal(semver.satisfies(version, range), true, `${name}: ${version}`);
    assert.equal(semver.satisfies('0.1.9', range), false);
    assert.equal(manifest.peerDependenciesMeta[name].optional, true);
  }
});

export { check, fixture, page, writeReport, tick, clone };
if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await tick();
  writeReport();
}
