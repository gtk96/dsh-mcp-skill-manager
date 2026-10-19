import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { act } from 'react-test-renderer';
import runtimeFixture from '@deepseek-ai/dsh/package.json' with { type: 'json' };
import './managed-mcp.test.mjs';
import { check, fixture, page, tick, writeReport } from './regression.test.mjs';
import { createManagedHooks, normalizeHook, hookEvents } from './managed-hooks.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const sourceRequire = createRequire(new URL('../../package.json', import.meta.url));
const protocol = await import(pathToFileURL(sourceRequire.resolve('@deepseek-ai/dsh-hook-protocol')).href);
const definition = (extra = {}) => ({ event: 'PreToolUse', matcher: 'read', command: 'fixture-hook-command', timeoutSec: 5, ...extra });
const signal = () => new AbortController().signal;
const revision = async (host, name) => (await host.rpc('hooks.list')).value.rules.find((rule) => rule.name === name).revision;

async function core(options = {}) {
  const ctx = new Context();
  let data = { managedHooks: structuredClone(options.rules ?? {}), keep: 'preserved' };
  let owner; let manager; let scope;
  const trace = { edits: 0, starts: 0, stops: 0, artifacts: [], shell: [] };
  ctx.reflect.provide('configEditor', {
    configuration: () => [{ entry: owner, inherited: {}, override: structuredClone(data) }],
    async edit(entry, change) {
      assert.equal(entry, owner);
      data = change(structuredClone(data), {});
      trace.edits++;
      owner.options.config = data;
      scope.emit('loader/volatile-update', [['managedHooks']]);
    },
  });
  ctx.reflect.provide('shell', {
    resolve(request) { return request; },
    async execute(request) {
      trace.shell.push(request);
      return { async result() { return { exitCode: 0, stdout: { text: JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'official bridge fixture context' } }) }, stderr: { text: '' } }; } };
    },
  });
  ctx.reflect.provide('sessionProjections', { stateOf() { return { lastTurn: 1 }; } });
  ctx.reflect.provide('workingDirectory', { get() { return '/fixture'; }, async ensure() { return '/fixture'; } });
  const defaultBridge = { apply(child) {
    trace.starts++;
    child.effect(() => async () => { trace.stops++; if (options.failCleanup?.()) throw new Error('private-cleanup-detail'); });
  } };
  const fiber = ctx.plugin({ name: 'hook-core-fixture', apply(child) {
    scope = child;
    owner = { id: 'include:hook-core-fixture', fiber: child.fiber, options: { config: data } };
    manager = createManagedHooks(child, { managedHooks: { get: () => data.managedHooks } }, {
      async report() { return { writes: { hooks: true }, capabilities: { hookRuntime: true } }; },
      async assertWrite(kind, abort) { assert.equal(kind, 'hooks'); abort?.throwIfAborted(); },
    }, {
      readBridge: options.readBridge ?? (async () => defaultBridge),
      readProtocol: async () => protocol,
      writeArtifact: options.writeArtifact ?? (async (text) => { trace.artifacts.push(JSON.parse(text)); return resolve(root, 'non-executing-hook-fixture.json'); }),
      startupTimeoutMs: options.startupTimeoutMs ?? 100,
      cleanupTimeoutMs: options.cleanupTimeoutMs ?? 50,
    });
  } });
  await fiber.await();
  if (!options.deferSync) await manager.sync();
  return {
    ctx, manager, trace, fiber,
    data: () => structuredClone(data),
    setRules(rules) { data = { ...data, managedHooks: rules }; owner.options.config = data; scope.emit('loader/volatile-update', [['managedHooks']]); },
    async close() { await fiber.dispose(); await fiber.await(); },
  };
}

await check('Hook static validation accepts seven command events and rejects unsupported or ignored fields', async () => {
  assert.equal(hookEvents.length, 7);
  assert.equal(normalizeHook('probe', definition()).enabled, false);
  for (const value of [
    definition({ event: 'Unknown' }), definition({ timeoutSec: 0 }), definition({ timeoutSec: 601 }),
    definition({ timeoutSec: 1.5 }), definition({ command: '' }), definition({ command: 'a\0b' }),
    definition({ type: 'http' }), definition({ enabled: 'false' }), definition({ matcher: '[' }),
    definition({ event: 'Stop' }), definition({ event: 'UserPromptSubmit' }),
  ]) assert.throws(() => normalizeHook('probe', value));
  assert.throws(() => normalizeHook('__proto__', definition()));
  assert.equal(normalizeHook('probe', definition({ matcher: '*' })).matcher, '*');
});

await check('Disabled Hook storage neither imports a bridge nor writes execution artifacts', async (t) => {
  let imports = 0;
  const host = await core({ rules: { parked: definition({ enabled: false }) }, readBridge: async () => { imports++; throw new Error('private'); } });
  t.after(() => host.close());
  const result = await host.manager.list(signal());
  assert.equal(result.runtime.phase, 'disabled');
  assert.equal(result.rules[0].enabled, false);
  assert.equal(imports, 0);
  assert.equal(host.trace.artifacts.length, 0);
  assert.equal(JSON.stringify(result).includes('fixture-hook-command'), false);
});

await check('Hook edits preserve hidden commands and unrelated config while revisions reject stale toggles', async (t) => {
  const host = await core(); t.after(() => host.close());
  await host.manager.upsert({ name: 'probe', definition: definition() }, signal());
  const row = (await host.manager.list()).rules[0];
  assert.equal(row.enabled, false);
  await host.manager.upsert({ name: 'probe', expectedRevision: row.revision, definition: { event: 'PreToolUse', matcher: 'write', command: '', timeoutSec: 9 } }, signal());
  assert.equal(host.data().managedHooks.probe.command, 'fixture-hook-command');
  assert.equal(host.data().keep, 'preserved');
  await assert.rejects(host.manager.setEnabled({ name: 'probe', enabled: true, expectedRevision: row.revision }, signal()), /变化|修订/);
  await assert.rejects(host.manager.upsert({ name: 'bad', definition: definition({ enabled: 'false' }) }, signal()));
  assert.equal(host.trace.starts, 0);
});

await check('Enabling emits only active rules and disabling unloads before replacement', async (t) => {
  const host = await core({ rules: { parked: definition({ enabled: false }), active: definition({ enabled: false }) } });
  t.after(() => host.close());
  let row = (await host.manager.list()).rules.find((rule) => rule.name === 'active');
  await host.manager.setEnabled({ name: row.name, enabled: true, expectedRevision: row.revision }, signal());
  assert.equal((await host.manager.list()).runtime.phase, 'active');
  assert.equal(host.trace.starts, 1);
  assert.equal(host.trace.artifacts[0].hooks.PreToolUse.length, 1);
  assert.equal(host.trace.artifacts[0].hooks.PreToolUse[0].hooks[0].timeout, 5);
  assert.equal(host.trace.shell.length, 0);
  row = (await host.manager.list()).rules.find((rule) => rule.name === 'active');
  await host.manager.setEnabled({ name: row.name, enabled: false, expectedRevision: row.revision }, signal());
  assert.equal(host.trace.stops, 1);
  assert.equal((await host.manager.list()).runtime.phase, 'disabled');
  assert.equal(host.data().managedHooks.active.command, 'fixture-hook-command');
});

await check('Missing official Hook modules reject enable before persistence but allow disabled storage', async (t) => {
  const host = await core({ readBridge: async () => { throw new Error('private-bridge-detail'); } });
  t.after(() => host.close());
  await host.manager.upsert({ name: 'probe', definition: definition() }, signal());
  const row = (await host.manager.list()).rules[0];
  await assert.rejects(host.manager.setEnabled({ name: row.name, enabled: true, expectedRevision: row.revision }, signal()), (error) => !error.message.includes('private'));
  assert.equal(host.data().managedHooks.probe.enabled, false);
  assert.equal(host.trace.edits, 1);
});

await check('Hook duplicate creates, stale deletes and cancellation do not overwrite configuration', async (t) => {
  const host = await core(); t.after(() => host.close());
  const results = await Promise.allSettled([1, 2].map(() => host.manager.upsert({ name: 'probe', definition: definition() }, signal())));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  await assert.rejects(host.manager.remove({ name: 'probe', expectedRevision: 'stale' }, signal()));
  const abort = new AbortController(); abort.abort();
  await assert.rejects(host.manager.remove({ name: 'probe', expectedRevision: (await host.manager.list()).rules[0].revision }, abort.signal));
  assert.equal(host.trace.edits, 1);
});

await check('Hook cache failures preserve saved definitions and report safe runtime failure', async (t) => {
  const host = await core({ writeArtifact: async () => { throw new Error('private-cache-detail'); } });
  t.after(() => host.close());
  await host.manager.upsert({ name: 'probe', definition: definition() }, signal());
  const result = await host.manager.setEnabled({ name: 'probe', enabled: true, expectedRevision: (await host.manager.list()).rules[0].revision }, signal());
  assert.equal(result.saved, true);
  assert.equal(result.runtime.phase, 'failed');
  assert.equal(host.data().managedHooks.probe.enabled, true);
  assert.equal(JSON.stringify(result).includes('private-cache-detail'), false);
  assert.equal(host.trace.starts, 0);
});

await check('Hook startup timeout is bounded and cannot leave a late bridge after unload', async () => {
  let release; const gate = new Promise((resolve) => { release = resolve; }); let started = 0;
  const host = await core({ rules: { probe: definition({ enabled: true }) }, readBridge: () => gate, startupTimeoutMs: 20 });
  assert.equal((await host.manager.list()).runtime.phase, 'unavailable');
  await host.close();
  release({ apply() { started++; } }); await tick();
  assert.equal(started, 0);
});

await check('Hook definitions removed during cache generation never mount a stale bridge', async () => {
  let entered; let release;
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const host = await core({ deferSync: true, rules: { probe: definition({ enabled: true }) }, writeArtifact: async () => { entered(); await gate; return '/fixture-unused'; } });
  await enteredPromise;
  host.setRules({}); release();
  await host.manager.sync();
  assert.equal(host.trace.starts, 0);
  assert.equal((await host.manager.list()).runtime.phase, 'disabled');
  await host.close();
});

await check('Official Hook bridge loads generated config and dispatches only enabled session events', async () => {
  const official = await import(pathToFileURL(sourceRequire.resolve('@deepseek-ai/dsh-hooks-claude-code')).href);
  const configPath = resolve(root, 'official-hook-config.json');
  const host = await core({
    rules: { official: definition({ event: 'SessionStart', matcher: 'startup', enabled: true }) },
    readBridge: async () => official,
    writeArtifact: async (text) => { writeFileSync(configPath, text, 'utf8'); return configPath; },
    startupTimeoutMs: 1500,
  });
  try {
    assert.equal((await host.manager.list()).runtime.phase, 'active');
    const injected = [];
    const agent = { session: { header: { id: 'fixture-session' } }, inject(value) { injected.push(value); } };
    await host.ctx.serial('agent/created', { agent, source: 'other', signal: signal() });
    assert.equal(host.trace.shell.length, 0);
    await host.ctx.serial('agent/created', { agent, source: 'startup', signal: signal() });
    assert.equal(host.trace.shell.length, 1);
    assert.equal(JSON.parse(host.trace.shell[0].stdin).hook_event_name, 'SessionStart');
    assert.equal(host.trace.shell[0].timeoutMs, 5000);
    assert.equal(injected.length, 1);
    const row = (await host.manager.list()).rules[0];
    await host.manager.setEnabled({ name: row.name, enabled: false, expectedRevision: row.revision }, signal());
    await host.ctx.serial('agent/created', { agent, source: 'startup', signal: signal() });
    assert.equal(host.trace.shell.length, 1);
  } finally { await host.close(); }
});

if (runtimeFixture.version === '0.2.1-rc.2') {
  await check('Hook RPC and Agent tool share revision-guarded Profile operations without exposing commands', async (t) => {
    const host = await fixture({ hooks: true }); t.after(() => host.close());
    const first = await host.rpc('hooks.upsert', { name: 'probe', definition: definition() });
    assert.equal(first.ok, true, JSON.stringify(first));
    const listed = await host.call('dsh_manage_hooks', { action: 'list' });
    assert.equal(listed.rules[0].enabled, false);
    assert.equal(JSON.stringify(listed).includes('fixture-hook-command'), false);
    const enabled = await host.rpc('hooks.set-enabled', { name: 'probe', enabled: true, expectedRevision: listed.rules[0].revision });
    assert.equal(enabled.ok, true, JSON.stringify(enabled));
    assert.equal(enabled.value.runtime.phase, 'active');
    assert.equal(host.hookTrace.starts.length, 1);
    assert.equal(host.hookTrace.shellCalls, 0);
    const stale = await host.rpc('hooks.remove', { name: 'probe', expectedRevision: listed.rules[0].revision });
    assert.equal(stale.ok, false);
    const removed = await host.call('dsh_manage_hooks', { action: 'remove', name: 'probe', expectedRevision: await revision(host, 'probe') });
    assert.equal(removed.saved, true);
    assert.equal((await host.rpc('hooks.list')).value.rules.length, 0);
    assert.equal(host.hookTrace.stops, 1);
    for (const action of ['upsert', 'set-enabled', 'remove', 'retry']) {
      const result = await host.rpc('hooks.' + action, { sessionId: 'not-global', name: 'probe', definition: definition() });
      assert.equal(result.ok, false);
    }
  });
} else {
  await check('Hook writes stay read-only outside the exact supported DSH Hook baseline', async (t) => {
    const host = await fixture({ hooks: true }); t.after(() => host.close());
    assert.equal((await host.rpc('hooks.list')).value.writable, false);
    assert.equal((await host.rpc('hooks.upsert', { name: 'probe', definition: definition() })).error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
    assert.equal(host.trace.edits, 0);
  });
}

writeReport();
