import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import vm from 'node:vm';
import { Context } from '@deepseek-ai/cordis';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import * as plugin from './host.mjs';
import { MCP_CLIENT, parsePatch, renderPatch } from './mcp-patch.js';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const clone = (value) => structuredClone(value);
const tick = () => new Promise((done) => setImmediate(done));
/** Let file I/O and React's scheduler settle; `setImmediate` alone never enters the poll phase. */
const settle = () => new Promise((done) => setTimeout(done, 0));
const flush = async () => {
  for (let index = 0; index < 12; index += 1) {
    await settle();
    await tick();
  }
};
const results = [];
const progress = resolve(root, 'test-progress.log');
writeFileSync(progress, 'isolated test module loaded\n');
const mark = (message) => appendFileSync(progress, message + '\n');

const sources = [
  ['host.mjs', 'index.js'], ['client.js', 'client.js'], ['discovery.js', 'discovery.js'],
  ['compatibility.js', 'compatibility.js'], ['mcp-config.js', 'mcp-config.js'],
  ['mcp-patch.js', 'mcp-patch.js'], ['mcp-write.js', 'mcp-write.js'], ['tool-guards.js', 'tool-guards.js'], ['package.json', 'package.json'],
];
const hashes = {};
for (const [fixture, source] of sources) {
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
  await test(name, { timeout: 15000 }, async (t) => {
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
  const failed = results.filter((row) => row.status !== 'passed');
  if (failed.length > 0) {
    process.exitCode = 1;
    console.error(`\n${failed.length} test(s) did not pass:`);
    for (const row of failed) console.error(`- ${row.name}: ${row.error ?? row.status}`);
  }
  writeFileSync(resolve(root, 'results.json'), JSON.stringify({
    packageVersion: JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8')).version,
    nodeVersion: process.version,
    fixtureRuntimeVersion: JSON.parse(readFileSync(resolve(root, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).version,
    sourceSha256: hashes,
    framework: { cordis: '4.0.4', react: '18.3.1', renderer: 'react-test-renderer' },
    isolation: 'In-process fixtures only; no active DSH API, no real Profile, no network requests',
    passed: results.filter((row) => row.status === 'passed').length,
    failed: results.filter((row) => row.status === 'failed').length,
    results,
  }, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// A fake profile: one YAML patch file, a base layer, and a Loader view derived from both.
// ---------------------------------------------------------------------------

/** Read the patch as data: inserted rows and non-insert override rows, in file order. */
function patchRows(patchPath) {
  let text = '';
  try { text = readFileSync(patchPath, 'utf8'); } catch { text = ''; }
  const document = parsePatch(text, patchPath);
  const blocks = document.toJS() ?? [];
  const inserted = [];
  const overrides = [];
  for (const block of blocks) {
    if (block === null || typeof block !== 'object') continue;
    if (Array.isArray(block.insert)) inserted.push(...block.insert);
    else if (typeof block.id === 'string') overrides.push(block);
  }
  return { document, inserted, overrides };
}

/** Layer composition, mirroring `applyEntryPatches`: inserts append, overrides replace keys in order. */
function compose(base, patchPath, { configOverride = true } = {}) {
  const rows = base.map((row) => ({ id: row.id, name: row.name, config: clone(row.config ?? {}), disabled: row.disabled === true, loaded: row.loaded }));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const { inserted, overrides } = patchRows(patchPath);
  for (const row of inserted) {
    if (typeof row?.id !== 'string') continue;
    const next = { id: row.id, name: row.name, config: clone(row.config ?? {}), disabled: row.disabled === true };
    rows.push(next);
    byId.set(next.id, next);
  }
  for (const patch of overrides) {
    const target = byId.get(patch.id);
    if (target === undefined) continue;
    if (patch.name !== undefined && patch.name !== target.name) continue;
    if (configOverride && patch.config !== undefined) target.config = clone(patch.config);
    if (patch.disabled !== undefined) target.disabled = patch.disabled === true;
  }
  return rows;
}

/** The last profile override row carrying `config` for one id. */
function configOverride(patchPath, entryId) {
  const { overrides } = patchRows(patchPath);
  let found = {};
  for (const row of overrides) {
    if (row.id === entryId && row.config !== undefined) found = clone(row.config);
  }
  return found;
}

/** Write one config override, matching `ConfigEditor.edit` (reset when equal to the inherited value). */
function setConfigOverride(document, entryId, name, next, inherited) {
  const items = document.contents.items;
  if (isDeepStrictEqual(next, inherited)) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const row = items[index];
      if (!row || typeof row.get !== 'function' || row.has('insert')) continue;
      if (row.get('id') !== entryId) continue;
      row.delete('config');
      const keys = new Set(row.items.map((pair) => pair.key?.value));
      const onlyIdentity = [...keys].every((key) => key === 'id' || key === 'name');
      if (onlyIdentity) document.deleteIn([index]);
    }
    return;
  }
  let index = -1;
  for (let at = items.length - 1; at >= 0; at -= 1) {
    const row = items[at];
    if (!row || typeof row.get !== 'function' || row.has('insert')) continue;
    if (row.get('id') !== entryId) continue;
    const rowName = row.get('name');
    if (rowName !== undefined && rowName !== name) continue;
    index = at;
    break;
  }
  if (index < 0) document.add(document.createNode({ id: entryId, name, config: next }));
  else document.setIn([index, 'config'], document.createNode(next));
}

function createProfile(options = {}) {
  const dir = options.profileDir ?? mkdtempSync(join(tmpdir(), 'dsh-msm-'));
  const patchPath = join(dir, 'cordis.patch.yml');
  writeFileSync(patchPath, options.patch ?? '[]\n');
  const base = clone(options.base ?? []);
  const entries = new Map();
  // The plugin writes the patch itself, so a counter here would never see it; tests compare file bytes.
  const trace = { edits: 0, reconciles: [] };
  const failures = options.failReconcile ?? [];

  function readPatch() {
    return readFileSync(patchPath, 'utf8');
  }

  function writeDocument(mutate) {
    const document = parsePatch(readPatch(), patchPath);
    if (mutate(document) === false) return false;
    writeFileSync(patchPath, renderPatch(document), 'utf8');
    return true;
  }

  function makeEntry(row) {
    const entry = {
      options: { id: row.id, name: row.name, config: row.config },
      fiber: undefined,
      parent: { tree: { ctx: { fiber: { entry: { id: 'include' } } } } },
    };
    Object.defineProperty(entry, 'disabled', {
      configurable: true,
      get() { return this.options.disabled === true; },
    });
    return entry;
  }

  function reconcile() {
    const rows = compose(base, patchPath);
    const live = new Set();
    for (const row of rows) {
      live.add(row.id);
      const entry = entries.get(row.id) ?? makeEntry(row);
      entries.set(row.id, entry);
      entry.options.name = row.name;
      entry.options.config = row.config;
      entry.options.disabled = row.disabled ? true : undefined;
      if (row.disabled) {
        entry.fiber = undefined;
      } else if (row.loaded === 'failed') {
        entry.fiber = { state: 3 };
      } else {
        entry.fiber = { state: 2 };
      }
    }
    for (const id of [...entries.keys()]) if (!live.has(id)) entries.delete(id);
  }
  reconcile();

  const loader = { entries: () => [...entries.values()] };

  const hmr = {
    async runExclusive(operation) {
      if (hmr.holding) throw new Error('HMR exclusive section cannot nest');
      hmr.holding = true;
      try { return await operation(); } finally { hmr.holding = false; }
    },
    async reconcileProfile(requiredIds = []) {
      if (hmr.holding !== true) throw new Error('HMR profile reconciliation must run inside runExclusive');
      trace.reconciles.push([...requiredIds]);
      reconcile();
      const failure = failures.shift();
      if (failure !== undefined) throw new Error(failure);
      const inactive = requiredIds.filter((id) => entries.get(id)?.disabled === true || entries.get(id) === undefined);
      if (inactive.length) throw new Error(`Entry ${inactive[0]} is not active after reconciliation`);
      return { warnings: [], pending: [] };
    },
    holding: false,
  };

  const configEditor = {
    configuration() {
      const inheritedRows = compose(base, patchPath, { configOverride: false });
      return [...entries.values()].map((entry) => ({
        entry,
        inherited: clone(inheritedRows.find((row) => row.id === entry.options.id)?.config ?? {}),
        override: configOverride(patchPath, entry.options.id),
      }));
    },
    async edit(entry, change) {
      if (!entries.has(entry.options.id)) throw new Error('Configuration entry is no longer available');
      const inherited = clone(compose(base, patchPath, { configOverride: false })
        .find((row) => row.id === entry.options.id)?.config ?? {});
      const next = change(clone(entry.options.config ?? {}), inherited);
      writeDocument((document) => {
        setConfigOverride(document, entry.options.id, entry.options.name, next, inherited);
      });
      trace.edits += 1;
      reconcile();
    },
  };

  return {
    dir,
    patchPath,
    base,
    loader,
    configEditor,
    hmr,
    trace,
    readPatch,
    writePatch(text) { writeFileSync(patchPath, text, 'utf8'); },
    addBase(row) { base.push(clone(row)); reconcile(); },
    entries,
    reconcile,
    context: { dir, patchPath },
  };
}

async function fixture(options = {}) {
  const ctx = new Context();
  const profile = createProfile(options);
  const tools = new Map();
  const routes = new Map();
  const runtime = new Map();
  const trace = { snapshots: [], lookups: [], registrations: 0, rollbacks: 0 };
  const skillRows = (lookup) => options.skillRows?.[lookup.scope?.id ?? 'profile'] ?? [];

  const skills = {
    async snapshot(lookup) {
      trace.snapshots.push(lookup);
      if (options.snapshot) return options.snapshot({ runtime, trace, lookup });
      return { skills: [...skillRows(lookup), ...runtime.values()].map((value) => ({ ...value })), complete: true };
    },
    async get(name, lookup) {
      trace.lookups.push(lookup);
      if (options.get) return options.get({ name, runtime, trace, lookup });
      return skillRows(lookup).find((skill) => skill.name === name) ?? runtime.get(name);
    },
    register(value) {
      trace.registrations += 1;
      runtime.set(value.name, { ...value });
      let live = true;
      return () => {
        if (!live) return;
        live = false;
        trace.rollbacks += 1;
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
    admit: () => options.admitDenied
      ? { rejection: 403 }
      : { peer: { id: 'fixture-peer', principal: { kind: 'owner' }, interactions: options.peerInteractions ?? 'answer' } },
  };

  ctx.reflect.provide('loader', profile.loader);
  ctx.reflect.provide('profileContext', profile.context);
  ctx.reflect.provide('configEditor', profile.configEditor);
  if (options.hmr !== false) ctx.reflect.provide('hmr', profile.hmr);
  ctx.reflect.provide('skills', skills);
  const guards = new Map();
  const toolsService = {
    register(tool) {
      assert.equal(tools.has(tool.name), false, 'Tools must not register twice');
      tools.set(tool.name, tool);
      return () => { tools.delete(tool.name); };
    },
    schemas(scope) {
      trace.toolScopes = [...(trace.toolScopes ?? []), scope?.id ?? null];
      const scoped = scope === undefined ? undefined : options.scopedTools?.[scope.id];
      return [...tools.values(), ...(scoped ?? options.globalTools ?? [])].map(({ name }) => ({ name, description: 'Fixture tool', parameters: { type: 'object' } }));
    },
    get(name) { return tools.get(name); },
    // Mirrors `ToolRuntime.guard`: a plain-context guard applies to every agent, first reason wins.
    guard(fn) {
      const id = Symbol('guard');
      guards.set(id, fn);
      trace.guardRegistrations = (trace.guardRegistrations ?? 0) + 1;
      return () => { guards.delete(id); };
    },
    /** Run the registered guards for one call, the way the harness does before a tool body. */
    guardedCall(name) {
      for (const fn of guards.values()) {
        const reason = fn({ name });
        if (reason !== undefined) return reason;
      }
      return undefined;
    },
  };
  if (options.guardAPI === false) delete toolsService.guard;
  ctx.reflect.provide('tools', toolsService);

  let removeConnection;
  if (options.web !== false) removeConnection = ctx.reflect.provide('connection', connection);
  const fiber = await ctx.plugin(plugin, {});
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
    ctx, fiber, tools, routes, runtime, trace, profile, skills, connection, call, rpc, guardedCall: toolsService.guardedCall,
    async attachWeb() { removeConnection = ctx.reflect.provide('connection', connection); await flush(); },
    async detachWeb() { if (removeConnection) { await removeConnection(); removeConnection = undefined; } await flush(); },
    async close() { await fiber.dispose(); await fiber.await(); },
  };
}

function text(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return (node.children ?? []).map(text).join("");
}

const NS = "mcp-skill-manager";

/** Mount the client module in a sandbox and return query helpers. */
async function page(t, host, options = {}) {
  let exports;
  let Page;
  let registration;
  const disposers = [];
  const requests = [];
  const styles = new Set();
  const dictionaries = {};
  const logged = [];
  const document = {
    createElement: () => {
      const element = { dataset: {}, textContent: "", remove() { styles.delete(element); } };
      return element;
    },
    head: { appendChild: (element) => styles.add(element) },
  };
  const sandbox = {
    window: { __ModuleLoader__: { load: (loaded) => {
      assert.equal(loaded.id, "dsh-mcp-skill-manager");
      exports = loaded.factory((id) => { assert.equal(id, "react"); return React; });
    } } },
    document,
    console: {
      ...console,
      error: (...args) => { logged.push(args.map(String).join(" ")); },
      warn: (...args) => { logged.push(args.map(String).join(" ")); },
    },
  };
  vm.runInNewContext(readFileSync(resolve(root, "client.js"), "utf8"), sandbox, { filename: "isolated-client.js" });

  const usingLocale = options.locale !== false;
  const localeFace = {
    register(ns, entries) {
      dictionaries[ns] = entries;
      return () => { delete dictionaries[ns]; };
    },
    bind(ns) {
      const language = options.language ?? "zh";
      return (key, params) => {
        const template = dictionaries[ns]?.[language]?.[key] ?? dictionaries[ns]?.zh?.[key] ?? key;
        return params === undefined ? template : template.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
      };
    },
  };

  const connection = { rpc: { async call(channel, endpoint, args) {
    assert.equal(channel, "/api");
    const method = endpoint.slice("mcp-skill-manager.".length);
    requests.push({ method, args: clone(args) });
    if (options.intercept) {
      const result = options.intercept(method, args);
      if (result !== undefined) return result;
    }
    return host.rpc(method, args);
  } } };

  const effect = (setup) => { const dispose = setup(); if (dispose) disposers.push(dispose); return dispose; };
  exports.apply({
    connection,
    get(name) { return name === "locale" && usingLocale ? localeFace : undefined; },
    inject(names, setup) {
      if (!names.includes("locale") || !usingLocale) return;
      setup({ locale: localeFace, effect });
    },
    effect,
    slots: {
      inject(name, setup) { assert.equal(name, "settings.section"); const dispose = setup(); if (dispose) disposers.push(dispose); return dispose; },
      register(options, component) { registration = options; assert.equal(options.id, "mcp-skill-manager"); Page = component; return () => {}; },
    },
  });
  assert.ok(Page, "The client must register a settings section");
  assert.equal(typeof registration.label, "function");
  if (usingLocale) {
    assert.equal(registration.locale, NS);
    assert.ok(dictionaries[NS]?.zh?.nav, "Chinese dictionary must register");
    assert.ok(dictionaries[NS]?.en?.nav, "English dictionary must register");
    assert.equal(registration.label(), dictionaries[NS][options.language ?? "zh"].nav);
  } else {
    assert.equal(registration.locale, undefined);
    assert.equal(registration.label(), "MCP 与 Skills", "The built-in copy stands in for the dictionary");
  }

  const translate = usingLocale ? localeFace.bind(NS) : undefined;
  const makePage = () => React.createElement(Page, translate === undefined ? {} : { t: translate });
  let renderer;
  await act(async () => { renderer = Renderer.create(makePage()); await flush(); });
  t.after(async () => {
    await act(async () => { renderer.unmount(); });
    for (const dispose of disposers.reverse()) dispose();
    assert.equal(styles.size, 0, "The stylesheet must be removed on unmount");
  });

  const buttons = () => renderer.root.findAllByType("button");
  const helpers = {
    renderer,
    requests,
    logged,
    registration,
    async flush() { await act(async () => { await flush(); }); },
    button(label) {
      const all = buttons();
      return all.find((node) => text(node) === label) ?? all.find((node) => text(node).startsWith(label));
    },
    field(label) { return renderer.root.findAllByProps({ "aria-label": label })[0]; },
    /** Every call switch on the page, keyed by tool name. A guarded tool reads as off. */
    switches() {
      return renderer.root.findAll((node) => node.props?.role === "switch")
        .map((node) => ({ tool: node.props["aria-label"], allowed: node.props["aria-checked"] }));
    },
    async toggleSwitch(tool) {
      const node = renderer.root.findAll((candidate) => candidate.props?.role === "switch"
        && candidate.props["aria-label"] === tool)[0];
      assert.ok(node, "Expected a call switch for: " + tool);
      assert.equal(!!node.props.disabled, false, "Switch must be enabled: " + tool);
      await act(async () => { await node.props.onClick(); await flush(); });
    },
    async fill(values) {
      await act(async () => { for (const [label, value] of Object.entries(values)) {
        const field = helpers.field(label);
        assert.ok(field, "Expected field: " + label);
        field.props.onChange({ currentTarget: { value } });
      } });
    },
    async submit(label) {
      const form = renderer.root.findAll((node) => node.type === "form" && node.props["aria-label"] === label)[0];
      assert.ok(form, "Expected form: " + label);
      await act(async () => { await form.props.onSubmit({ preventDefault() {} }); await flush(); });
    },
    async click(label) {
      const button = helpers.button(label);
      assert.ok(button, "Expected button: " + label);
      assert.equal(!!button.props.disabled, false, "Button must be enabled: " + label);
      await act(async () => { await button.props.onClick(); await flush(); });
    },
    alerts() { return renderer.root.findAllByProps({ role: "alert" }).map(text); },
    statuses() { return renderer.root.findAllByProps({ role: "status" }).map(text); },
    content() { return text(renderer.root); },
    mutations() {
      return requests.filter(({ method }) => ["mcp.create", "mcp.update", "mcp.reset", "mcp.remove", "mcp.set-enabled", "mcp.set-tool-disabled", "skills.register", "skills.unregister"].includes(method));
    },
  };
  return helpers;
}

export { check, fixture, page, writeReport, tick, flush, clone, text, MCP_CLIENT };
