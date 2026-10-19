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
  let projectedSessions = sessionRows;
  const makePage = () => React.createElement(Page, { useSessions: (selector) => selector({ byId: projectedSessions }) });
  await act(async () => { renderer = Renderer.create(makePage()); await tick(); });
  t.after(async () => {
    await act(async () => { renderer.unmount(); });
    for (const dispose of disposers.reverse()) dispose();
    assert.equal(styles.size, 0);
  });
  return {
    renderer, requests,
    async setSessionRows(next) { projectedSessions = next; await act(async () => { renderer.update(makePage()); await tick(); }); },
    button(label) { return renderer.root.findAllByType('button').find((node) => text(node) === label); },
    async click(label) {
      const button = this.button(label);
      assert.ok(button, 'Expected button: ' + label);
      assert.equal(!!button.props.disabled, false, 'Button must be enabled: ' + label);
      await act(async () => { await button.props.onClick(); await tick(); });
    },
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

await check('Plugin unload releases a Runtime Skill while post-registration discovery is pending', async () => {
  let releaseObserved;
  const observed = new Promise((resolve) => { releaseObserved = resolve; });
  let snapshots = 0;
  const host = await fixture({
    snapshot: ({ runtime }) => ++snapshots === 2 ? observed : { skills: [...runtime.values()], complete: true },
  });
  const registering = host.call('dsh_manage_skills', { action: 'register', name: 'late-skill', description: 'Late', content: 'Fixture instructions' });
  await tick();
  assert.equal(snapshots, 2);
  assert.equal(host.runtime.size, 1);
  const saved = [...host.runtime.values()];
  await host.close();
  assert.equal(host.runtime.size, 0);
  releaseObserved({ skills: saved, complete: true });
  await assert.rejects(registering);
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
  const catalog = await host.call('dsh_manage_mcp_servers', { action: 'list', configPath: 'maps.A' });
  const revision = catalog.entries[0].servers.demo.revision;
  const value = await host.call('dsh_manage_mcp_servers', { action: 'remove', entryId: 'fixture', name: 'demo', expectedRevision: revision });
  assert.equal(value.inheritedRemains, true);
  assert.deepEqual(host.entry.options.config.maps.A.demo, inherited.maps.A.demo);
  assert.equal(host.entry.options.config.maps.B.demo.command, 'fixture-b');
  assert.deepEqual(host.entry.options.config.unrelated, { keep: true });
});

await check('Removing an overridden Server rejects missing and stale revisions', async (t) => {
  const host = await fixture();
  t.after(() => host.close());
  const catalog = await host.call('dsh_manage_mcp_servers', { action: 'list', configPath: 'maps.A' });
  const oldRevision = catalog.entries[0].servers.demo.revision;
  await assert.rejects(host.call('dsh_manage_mcp_servers', { action: 'remove', entryId: 'fixture', name: 'demo' }), /lacks a revision/);
  host.entry.options.config.maps.A.demo.command = 'new-definition';
  await assert.rejects(host.call('dsh_manage_mcp_servers', { action: 'remove', entryId: 'fixture', name: 'demo', expectedRevision: oldRevision }), /changed or lacks a revision/);
  assert.equal(host.entry.options.config.maps.A.demo.command, 'new-definition');
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

await check('Runtime Skill registration preserves body whitespace and rejects blank bodies', async (t) => {
  const host = await fixture(); t.after(() => host.close());
  const content = '\n  indented line\n\n';
  const args = { action: 'register', name: 'spaced-skill', description: 'Fixture', content };
  assert.equal((await host.call('dsh_manage_skills', args)).persisted, false);
  assert.equal(host.runtime.get('spaced-skill').content, content);
  assert.equal((await host.rpc('skills.get', { name: 'spaced-skill' })).value.skill.content, content);
  await assert.rejects(host.call('dsh_manage_skills', { ...args, name: 'blank-skill', content: ' \n\t' }), /required/);
  assert.equal(host.runtime.has('blank-skill'), false);
});

await check('A shadowed Runtime Skill cannot be offered or removed as an external Skill', async (t) => {
  const shadow = [];
  const host = await fixture({ skillRows: { profile: shadow } }); t.after(() => host.close());
  await host.call('dsh_manage_skills', { action: 'register', name: 'shared-skill', description: 'Fixture', content: 'Fixture instructions' });
  shadow.push({ name: 'shared-skill', description: 'External', content: 'External instructions', source: 'project', provider: 'fixture-project' });
  const rows = (await host.rpc('skills.list')).value.skills;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'project');
  assert.equal(rows[0].canUnregister, false);
  const denied = await host.rpc('skills.unregister', { name: 'shared-skill' });
  assert.equal(denied.ok, false);
  assert.equal(host.runtime.has('shared-skill'), true);
  shadow.pop();
  assert.equal((await host.rpc('skills.list')).value.skills.find((row) => row.source === 'runtime').canUnregister, true);
  assert.equal((await host.rpc('skills.unregister', { name: 'shared-skill' })).value.changed, true);
  assert.equal(host.runtime.has('shared-skill'), false);
});

await check('Concurrent unregistration cannot dispose one Runtime Skill twice', async (t) => {
  let gated = false;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const host = await fixture({ get: ({ name, runtime }) => gated ? gate.then(() => runtime.get(name)) : runtime.get(name) });
  t.after(() => host.close());
  await host.call('dsh_manage_skills', { action: 'register', name: 'concurrent-skill', description: 'Fixture', content: 'Instructions' });
  gated = true;
  const first = host.rpc('skills.unregister', { name: 'concurrent-skill' });
  await tick();
  const second = await host.rpc('skills.unregister', { name: 'concurrent-skill' });
  assert.equal(second.ok, false);
  assert.match(second.error.message, /currently being unregistered/);
  release();
  assert.equal((await first).value.changed, true);
  assert.equal(host.trace.rollbacks, 1);
  assert.equal((await host.rpc('skills.unregister', { name: 'concurrent-skill' })).value.changed, false);
});

await check('A Server replacement rejects changes made after catalog read', async (t) => {
  const host = await fixture(); t.after(() => host.close());
  const catalog = await host.rpc('mcp.catalog');
  const revision = catalog.value.entries.find((row) => row.entry.id === 'include:fixture').servers.demo.revision;
  const payload = { entryId: 'include:fixture', configPath: 'maps.A', name: 'demo', definition: { command: 'replacement' }, expectedRevision: revision };
  host.entry.options.config.maps.A.demo.command = 'external-update';
  const denied = await host.rpc('mcp.upsert', payload);
  assert.equal(denied.ok, false);
  assert.match(denied.error.message, /refresh the catalog/);
  assert.equal(host.entry.options.config.maps.A.demo.command, 'external-update');
  const fresh = await host.rpc('mcp.catalog');
  payload.expectedRevision = fresh.value.entries.find((row) => row.entry.id === 'include:fixture').servers.demo.revision;
  assert.equal((await host.rpc('mcp.upsert', payload)).value.changed, true);
  assert.equal(host.entry.options.config.maps.A.demo.command, 'replacement');
});

await check('Settings exposes MCP groups, managed add and Skills without mapping UI or catalog RPC', async (t) => {
  const host = await fixture({ managed: true, managedServers: {
    grouped: { transport: 'stdio', command: 'fixture-command', args: [] },
  }, globalTools: [{ name: 'mcp__grouped__query' }], skillRows: { profile: [
    { name: 'fixture-visible', description: 'Fixture Skill', content: 'Fixture visible body', source: 'global', provider: 'fixture' },
  ] } });
  t.after(() => host.close());
  const ui = await page(t, host);
  const assertNoMap = () => {
    assert.doesNotMatch(ui.content(), /高级：Profile 配置映射编辑|MCP 映射路径|配置条目|新增自定义映射 Server|替换 override/);
    assert.equal(ui.renderer.root.findAllByProps({ placeholder: 'mcp.servers' }).length, 0);
    assert.equal(ui.button('读取配置'), undefined);
    assert.equal(ui.requests.some(({ method }) => ['mcp.catalog', 'mcp.upsert', 'mcp.remove'].includes(method)), false);
  };
  assertNoMap();
  assert.ok(ui.content().includes('grouped（1 个候选工具）'));
  await ui.click('刷新 MCP 发现');
  await ui.click('添加托管 MCP');
  assert.equal(ui.renderer.root.findAllByProps({ 'aria-label': '新增 MCP' }).length, 1);
  assertNoMap();
  await ui.click('Skills');
  assert.ok(ui.content().includes('fixture-visible'));
  await ui.click('查看正文');
  assert.ok(ui.content().includes('Fixture visible body'));
  assert.equal(ui.button('注册 Runtime Skill').props.disabled, false);
  assertNoMap();
  assert.equal(ui.alerts().length, 0);
  assert.equal(ui.mutations().length, 0);
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
