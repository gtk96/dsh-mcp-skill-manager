import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { check, fixture, page, tick, MCP_CLIENT } from './regression.test.mjs';
import { createCompatibility, CompatibilityError } from './compatibility.js';
import runtimeFixture from '@deepseek-ai/dsh/package.json' with { type: 'json' };
import packageFixture from './package.json' with { type: 'json' };
const baselineRuntimeVersion = runtimeFixture.version;

function runtimeVersion(t, version) {
  const previous = runtimeFixture.version;
  runtimeFixture.version = version;
  t.after(() => { runtimeFixture.version = previous; });
}

const probe = () => ({ patch: '[]\n', base: [{ id: 'mcp-probe', name: MCP_CLIENT, config: { serverName: 'probe', transport: 'streamable-http', url: 'https://probe.invalid/mcp' }, loaded: 'ok' }] });
const localSkill = { name: 'fixture-skill', description: 'Fixture description', content: 'Fixture readable body', source: 'custom', provider: 'fixture-provider' };
const mutations = [
  ['mcp.update', { entryId: 'mcp-probe', patch: { toolCallTimeoutMs: 1000 } }],
  ['skills.register', { name: 'probe-skill', description: 'Fixture', content: 'Fixture body' }],
  ['skills.unregister', { name: 'probe-skill' }],
];

await check('Compatibility reports version and methods without invoking business services', async (t) => {
  const host = await fixture();
  t.after(() => host.close());
  const result = await host.rpc('compatibility.status');
  assert.equal(result.ok, true);
  assert.equal(result.value.runtimeVersion, baselineRuntimeVersion);
  assert.equal(result.value.pluginVersion, packageFixture.version);
  assert.equal(result.value.versionStatus, 'tested');
  assert.deepEqual(result.value.writes, { mcp: true, guards: true, skills: true, skillFiles: true });
  assert.equal(result.value.checks, 'method-presence-only');
  assert.equal(host.profile.trace.edits + host.trace.registrations + host.trace.snapshots.length, 0);
});

for (const version of ['0.2.0-rc.2', '0.2.1-rc.2']) {
  await check(`Verified runtime ${version} permits MCP writes and Runtime Skill operations`, async (t) => {
    runtimeVersion(t, version);
    const host = await fixture(probe());
    t.after(() => host.close());
    const status = (await host.rpc('compatibility.status')).value;
    assert.equal(status.versionStatus, 'tested');
    assert.deepEqual(status.writes, { mcp: true, guards: true, skills: true, skillFiles: true });
    const edited = await host.rpc('mcp.update', { entryId: 'mcp-probe', patch: { toolCallTimeoutMs: 60000 } });
    assert.equal(edited.ok, true, JSON.stringify(edited));
    const created = await host.rpc('mcp.create', { serverName: 'extra', transport: 'stdio', command: 'npx' });
    assert.equal(created.ok, true, JSON.stringify(created));
    const registered = await host.rpc('skills.register', { name: 'baseline-skill', description: 'Fixture', content: 'Fixture body' });
    assert.equal(registered.ok, true);
    assert.equal((await host.rpc('skills.unregister', { name: 'baseline-skill' })).ok, true);
    const ui = await page(t, host);
    assert.equal(ui.button('新增 Server').props.disabled, false);
  });
}

for (const version of ['0.2.1-alpha.4', '0.2.1-rc.3', '1.0.0', undefined, 'not-a-version']) {
  await check(`Runtime ${version ?? 'unknown'} is read-only at the RPC and Tool boundaries`, async (t) => {
    runtimeVersion(t, version);
    const host = await fixture({ ...probe(), skillRows: { profile: [localSkill] } });
    t.after(() => host.close());
    const status = await host.rpc('compatibility.status');
    assert.equal(status.ok, true);
    assert.equal(status.value.versionStatus, typeof version === 'string' && version !== 'not-a-version' ? 'unverified' : 'unknown');
    assert.deepEqual(status.value.writes, { mcp: false, guards: false, skills: false, skillFiles: false });
    for (const [method, args] of mutations) {
      const result = await host.rpc(method, args);
      assert.equal(result.ok, false, method);
      assert.equal(result.error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
      assert.match(result.error.message, /操作已阻止|只读|未通过/);
    }
    const created = await host.rpc('mcp.create', { serverName: 'nope', transport: 'stdio', command: 'npx' });
    assert.equal(created.ok, false);
    assert.equal(host.profile.readPatch(), '[]\n', 'No write may reach the patch file');
    assert.equal(host.profile.trace.edits, 0);
    assert.equal(host.trace.registrations + host.trace.rollbacks, 0);
    assert.equal((await host.rpc('mcp.discover')).ok, true);
    assert.equal((await host.rpc('skills.list')).value.skills[0].name, localSkill.name);
    assert.equal((await host.rpc('skills.get', { name: localSkill.name })).value.skill.content, localSkill.content);
  });
}

await check('Missing config edit blocks only MCP writes and preserves reads and Runtime operations', async (t) => {
  const host = await fixture(probe());
  t.after(() => host.close());
  host.ctx.get('configEditor').edit = undefined;
  const status = (await host.rpc('compatibility.status')).value;
  assert.equal(status.capabilities.configEdit, false);
  assert.deepEqual(status.writes, { mcp: false, guards: true, skills: true, skillFiles: true });
  assert.equal((await host.rpc('mcp.discover')).ok, true);
  assert.equal((await host.rpc(...mutations[0])).error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
  assert.equal((await host.rpc('mcp.create', { serverName: 'nope', transport: 'stdio', command: 'npx' })).error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
  assert.equal(host.profile.readPatch(), '[]\n', 'No write may reach the patch file');
  assert.equal((await host.rpc(...mutations[1])).ok, true);
  assert.equal(host.trace.registrations, 1);
});

await check('Missing Runtime register blocks only Skill writes', async (t) => {
  const host = await fixture(probe());
  t.after(() => host.close());
  host.skills.register = undefined;
  const status = (await host.rpc('compatibility.status')).value;
  assert.deepEqual(status.writes, { mcp: true, guards: true, skills: false, skillFiles: true });
  assert.equal((await host.rpc(...mutations[1])).error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
  assert.equal((await host.rpc(...mutations[0])).ok, true);
  assert.equal(host.trace.registrations, 0);
});

await check('A profile without a patch file cannot add or remove servers', async (t) => {
  const host = await fixture(probe());
  t.after(() => host.close());
  host.ctx.get('profileContext').patchPath = undefined;
  const status = (await host.rpc('compatibility.status')).value;
  assert.equal(status.capabilities.patchWrite, false);
  assert.deepEqual(status.writes, { mcp: false, guards: true, skills: true, skillFiles: true });
  const created = await host.rpc('mcp.create', { serverName: 'nope', transport: 'stdio', command: 'npx' });
  assert.equal(created.ok, false);
});

await check('The Host rechecks methods when a caller writes after a successful status', async (t) => {
  const host = await fixture(probe());
  t.after(() => host.close());
  assert.equal((await host.rpc('compatibility.status')).value.writes.mcp, true);
  host.ctx.get('configEditor').edit = undefined;
  const result = await host.rpc(...mutations[0]);
  assert.equal(result.error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
  assert.equal(host.profile.trace.edits, 0);
});

await check('Cancellation during a compatibility lookup prevents write authorization', async () => {
  const controller = new AbortController();
  const ctx = { get: () => ({ configuration() {}, edit() {}, register() {} }) };
  const compatibility = createCompatibility(ctx, async () => {
    controller.abort(new Error('Fixture cancellation'));
    return '0.2.0-rc.2';
  });
  await assert.rejects(compatibility.assertWrite('mcp', controller.signal), /Fixture cancellation/);
});

await check('An unavailable runtime reader fails closed without leaking provider errors', async () => {
  const compatibility = createCompatibility({ get: () => undefined }, async () => {
    throw new TypeError('Fixture private error');
  });
  assert.equal((await compatibility.report()).runtimeVersion, null);
  await assert.rejects(compatibility.assertWrite('mcp'), (error) => error instanceof CompatibilityError && !error.message.includes('private'));
});

await check('The page displays an unverified version and keeps reads available', async (t) => {
  runtimeVersion(t, '0.2.1-alpha.4');
  const host = await fixture({ ...probe(), skillRows: { profile: [localSkill] } });
  t.after(() => host.close());
  const ui = await page(t, host);
  assert.ok(ui.content().includes('写入已禁用'));
  assert.equal(ui.button('新增 Server').props.disabled, true);
  await ui.click('Skills');
  assert.equal(ui.button('注册 Runtime Skill').props.disabled, true);
  await ui.click('查看正文');
  assert.ok(ui.content().includes(localSkill.content));
  assert.equal(ui.mutations().length, 0);
});

await check('A malformed compatibility status cannot enable page writes', async (t) => {
  const host = await fixture(probe());
  t.after(() => host.close());
  const ui = await page(t, host, {
    intercept: (method) => method === 'compatibility.status'
      ? { ok: true, value: { versionStatus: 'tested' } }
      : undefined,
  });
  assert.equal(ui.button('新增 Server').props.disabled, true);
  assert.equal(ui.mutations().length, 0);
});

await check('A version change after a successful status cannot reuse its authorization', async (t) => {
  runtimeVersion(t, '0.2.0-rc.2');
  const host = await fixture(probe());
  t.after(() => host.close());
  assert.equal((await host.rpc('compatibility.status')).value.writes.mcp, true);
  runtimeFixture.version = '0.2.1-alpha.4';
  assert.equal((await host.rpc(...mutations[0])).error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
  assert.equal(host.profile.trace.edits, 0);
});

await check('Cancelling a queued MCP update preserves the configuration', async (t) => {
  const host = await fixture(probe());
  t.after(() => host.close());
  const entry = host.profile.entries.get('mcp-probe');
  const before = structuredClone(entry.options.config);
  let entered;
  let release;
  const arrival = new Promise((done) => { entered = done; });
  const gate = new Promise((done) => { release = done; });
  const editor = host.ctx.get('configEditor');
  const original = editor.edit;
  editor.edit = async (target, change) => {
    entered();
    await gate;
    await original(target, change);
  };
  t.after(() => { editor.edit = original; });
  const controller = new AbortController();
  const pending = host.rpc('mcp.update', { entryId: 'mcp-probe', patch: { toolCallTimeoutMs: 1000 } }, controller.signal);
  await arrival;
  controller.abort(new Error('Fixture queued cancellation'));
  release();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(host.profile.trace.edits, 0);
  assert.deepEqual(host.profile.entries.get('mcp-probe').options.config, before);
});

await check('A status read that rejects leaves every write disabled', async (t) => {
  const host = await fixture(probe());
  t.after(() => host.close());
  const ui = await page(t, host, {
    intercept: (method) => method === 'compatibility.status'
      ? { ok: false, error: { message: 'Fixture old Host without status' } }
      : undefined,
  });
  assert.match(ui.alerts().join(' '), /Fixture old Host without status/);
  assert.equal(ui.button('新增 Server').props.disabled, true);
  assert.equal(ui.mutations().length, 0);
});

await check('A delayed status response applies once and needs no session id', async (t) => {
  const host = await fixture(probe());
  t.after(() => host.close());
  let release;
  const gate = new Promise((done) => { release = done; });
  const ui = await page(t, host, {
    intercept: (method, args) => method === 'compatibility.status' ? gate.then(() => host.rpc(method, args)) : undefined,
  });
  assert.equal(ui.button('新增 Server').props.disabled, true);
  await act(async () => { release(); await tick(); await tick(); });
  assert.equal(ui.button('新增 Server').props.disabled, false);
  assert.equal(ui.requests.filter((row) => row.method === 'compatibility.status').length, 1);
  assert.equal(ui.requests.every((row) => row.args.sessionId === undefined), true);
  assert.equal(ui.mutations().length, 0);
});
