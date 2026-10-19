import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import './session-discovery.test.mjs';
import { check, fixture, page, tick, writeReport } from './regression.test.mjs';
import { createCompatibility, CompatibilityError } from './compatibility.js';
import runtimeFixture from '@deepseek-ai/dsh/package.json' with { type: 'json' };
import packageFixture from './package.json' with { type: 'json' };
const baselineRuntimeVersion = runtimeFixture.version;

function runtimeVersion(t, version) {
  const previous = runtimeFixture.version;
  runtimeFixture.version = version;
  t.after(() => { runtimeFixture.version = previous; });
}
const mcpProbeRow = () => ({ entry: { id: 'include:mcp-probe', options: { id: 'mcp-probe', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'probe', transport: 'streamable-http', url: 'http://fixture.invalid/mcp', headers: {} } } }, inherited: {}, override: {} });
const mutations = [
  ['mcp.update', { sessionId: '', entryId: 'include:mcp-probe', patch: { toolCallTimeoutMs: 1000 } }],
  ['skills.register', { name: 'probe-skill', description: 'Fixture', content: 'Fixture body' }],
  ['skills.unregister', { name: 'probe-skill' }],
];
const localSkill = { name: 'fixture-skill', description: 'Fixture description', content: 'Fixture readable body', source: 'custom', provider: 'fixture-provider' };

await check('Compatibility reports version and methods without invoking business services', async (t) => {
  const host = await fixture({ hookRuntime: true }); t.after(() => host.close());
  const result = await host.rpc('compatibility.status');
  assert.equal(result.ok, true);
  assert.equal(result.value.runtimeVersion, baselineRuntimeVersion);
  assert.equal(result.value.pluginVersion, packageFixture.version);
  assert.equal(result.value.versionStatus, 'tested');
  assert.deepEqual(result.value.writes, { mcp: true, skills: true, hooks: baselineRuntimeVersion === '0.2.1-rc.2' });
  assert.equal(result.value.capabilities.sessionSelection, false);
  assert.equal(result.value.checks, 'method-presence-only');
  assert.equal(host.trace.edits + host.trace.registrations + host.trace.snapshots.length, 0);
});

for (const version of ['0.2.0-rc.2', '0.2.1-rc.2']) {
  await check(`Verified runtime ${version} permits MCP entry edits and Runtime Skill operations`, async (t) => {
    runtimeVersion(t, version);
    const host = await fixture({ hookRuntime: true }); t.after(() => host.close());
    host.rows.push(mcpProbeRow());
    const status = (await host.rpc('compatibility.status')).value;
    assert.equal(status.runtimeVersion, version);
    assert.equal(status.versionStatus, 'tested');
    assert.deepEqual(status.writes, { mcp: true, skills: true, hooks: version === '0.2.1-rc.2' });
    const edited = await host.rpc('mcp.update', { sessionId: '', entryId: 'include:mcp-probe', patch: { toolCallTimeoutMs: 60000 } });
    assert.equal(edited.ok, true, JSON.stringify(edited));
    assert.equal(host.trace.edits, 1);
    const registered = await host.rpc('skills.register', { sessionId: '', name: 'baseline-skill', description: 'Fixture', content: 'Fixture body' });
    assert.equal(registered.ok, true);
    assert.equal((await host.rpc('skills.unregister', { sessionId: '', name: 'baseline-skill' })).ok, true);
    const ui = await page(t, host);
    assert.equal(ui.button('编辑此 MCP').props.disabled, false);
  });
}

for (const version of ['0.2.1-alpha.4', '0.2.1-rc.3', '1.0.0', undefined, 'not-a-version']) {
  await check(`Runtime ${version ?? 'unknown'} is read-only at RPC and Tool boundaries`, async (t) => {
    runtimeVersion(t, version);
    const host = await fixture({ skillRows: { profile: [localSkill] } }); t.after(() => host.close());
    const status = await host.rpc('compatibility.status');
    assert.equal(status.ok, true);
    assert.equal(status.value.versionStatus, typeof version === 'string' && version !== 'not-a-version' ? 'unverified' : 'unknown');
    assert.deepEqual(status.value.writes, { mcp: false, skills: false, hooks: false });
    for (const [method, args] of mutations) {
      const result = await host.rpc(method, args);
      assert.equal(result.ok, false, method);
      assert.equal(result.error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
      assert.match(result.error.message, /只读/);
    }
    await assert.rejects(host.call('dsh_manage_mcp_servers', { ...mutations[0][1], action: 'upsert' }), /设置页|discover/);
    await assert.rejects(host.call('dsh_manage_skills', { ...mutations[2][1], action: 'register' }), /设置页|list, get|注册与注销/);
    assert.equal(host.trace.edits + host.trace.registrations + host.trace.rollbacks, 0);
    assert.equal((await host.rpc('mcp.discover')).ok, true);
    assert.equal((await host.rpc('skills.list')).value.skills[0].name, localSkill.name);
    assert.equal((await host.rpc('skills.get', { name: localSkill.name })).value.skill.content, localSkill.content);
  });
}

await check('Missing config edit method blocks only MCP writes and preserves reads and Runtime operations', async (t) => {
  const host = await fixture(); t.after(() => host.close());
  host.ctx.get('configEditor').edit = undefined;
  const status = (await host.rpc('compatibility.status')).value;
  assert.equal(status.capabilities.configEdit, false);
  assert.deepEqual(status.writes, { mcp: false, skills: true, hooks: false });
  assert.equal((await host.rpc('mcp.discover')).ok, true);
  assert.equal((await host.rpc(...mutations[0])).error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
  assert.equal((await host.rpc(...mutations[1])).ok, true);
  assert.equal(host.trace.edits, 0);
  assert.equal(host.trace.registrations, 1);
});

await check('Missing Runtime register method blocks only Skill writes', async (t) => {
  const host = await fixture({ hookRuntime: true }); t.after(() => host.close());
  host.rows.push(mcpProbeRow());
  host.skills.register = undefined;
  const status = (await host.rpc('compatibility.status')).value;
  assert.deepEqual(status.writes, { mcp: true, skills: false, hooks: baselineRuntimeVersion === '0.2.1-rc.2' });
  assert.equal((await host.rpc(...mutations[1])).error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
  assert.equal((await host.rpc(...mutations[0])).ok, true);
  assert.equal(host.trace.registrations, 0);
  assert.equal(host.trace.edits, 1);
});

await check('Host rechecks methods when a caller writes after an earlier successful status', async (t) => {
  const host = await fixture(); t.after(() => host.close());
  assert.equal((await host.rpc('compatibility.status')).value.writes.mcp, true);
  host.ctx.get('configEditor').edit = undefined;
  const result = await host.rpc(...mutations[0]);
  assert.equal(result.error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
  assert.equal(host.trace.edits, 0);
});

await check('Cancellation during compatibility lookup prevents write authorization', async () => {
  const controller = new AbortController();
  const ctx = { get: () => ({ configuration() {}, edit() {}, register() {} }) };
  const compatibility = createCompatibility(ctx, () => ({ snapshot() {}, get() {} }), async () => {
    controller.abort(new Error('Fixture cancellation'));
    return '0.2.0-rc.2';
  });
  await assert.rejects(compatibility.assertWrite('mcp', controller.signal), /Fixture cancellation/);
});

await check('An unavailable runtime reader fails closed without leaking provider errors', async () => {
  const compatibility = createCompatibility({ get: () => undefined }, () => undefined, async () => {
    throw new TypeError('Fixture private error');
  });
  assert.equal((await compatibility.report()).runtimeVersion, null);
  await assert.rejects(compatibility.assertWrite('mcp'), (error) => error instanceof CompatibilityError && !error.message.includes('private'));
});

await check('Page displays an unverified version and keeps catalog and body reads available', async (t) => {
  runtimeVersion(t, '0.2.1-alpha.4');
  const host = await fixture({ managed: true, skillRows: { profile: [localSkill] } }); t.after(() => host.close());
  host.rows.push(mcpProbeRow());
  const ui = await page(t, host);
  assert.ok(ui.content().includes('0.2.1-alpha.4'));
  assert.ok(ui.content().includes('保持只读'));
  assert.equal(ui.button('编辑此 MCP').props.disabled, true);
  await ui.click('Skills');
  assert.equal(ui.button('注册 Runtime Skill').props.disabled, true);
  await ui.click('查看正文');
  assert.ok(ui.content().includes(localSkill.content));
  assert.equal(ui.mutations().length, 0);
});

for (const value of [undefined, { protocolVersion: 9 }, { protocolVersion: 1, writes: { mcp: true, skills: true } }]) {
  await check(`Failed or malformed compatibility status ${JSON.stringify(value)} cannot enable page writes`, async (t) => {
    const host = await fixture({ managed: true }); t.after(() => host.close());
  host.rows.push(mcpProbeRow());
    const ui = await page(t, host, (method) => method === 'compatibility.status'
      ? value === undefined ? { ok: false, error: { message: 'Fixture old Host without status endpoint' } } : { ok: true, value }
      : undefined);
    assert.ok(ui.alerts().some((message) => message.includes('写入已禁用')));
    assert.equal(ui.button('编辑此 MCP').props.disabled, true);
    await ui.click('Skills');
    assert.equal(ui.button('注册 Runtime Skill').props.disabled, true);
    assert.equal(ui.mutations().length, 0);
  });
}

await check('A delayed Profile compatibility response stays global after main-view projection changes', async (t) => {
  const agent = (id) => ({ id, ctx: { preset: 'fixture' }, session: { header: { id, cwd: '/fixture', agentPreset: 'fixture' } } });
  const host = await fixture({ managed: true, agents: [agent('A'), agent('B')], presets: true }); t.after(() => host.close());
  host.rows.push(mcpProbeRow());
  let release;
  const gate = new Promise((done) => { release = done; });
  const ui = await page(t, host, (method) => method === 'compatibility.status' ? gate : undefined,
    { A: { id: 'A', retainedBy: { mainView: 1 } }, B: { id: 'B' } });
  assert.equal(ui.renderer.root.findAllByProps({ 'aria-label': '能力视图' }).length, 0);
  assert.equal(ui.button('编辑此 MCP').props.disabled, true);
  await ui.setSessionRows({ A: { id: 'A' }, B: { id: 'B', retainedBy: { mainView: 1 } } });
  assert.equal(ui.requests.filter((row) => row.method === 'compatibility.status').length, 1);
  await act(async () => { release(await host.rpc('compatibility.status')); await tick(); });
  assert.equal(ui.button('编辑此 MCP').props.disabled, false);
  assert.equal(ui.requests.filter((row) => row.method === 'compatibility.status').every((row) => !row.args.sessionId), true);
  assert.equal(ui.mutations().length, 0);
});

await check('One scoped service lookup failure does not disable unrelated operation capabilities', async () => {
  const configEditor = { configuration() {}, edit() {} };
  const skills = { snapshot() {}, get() {}, register() {} };
  const compatibility = createCompatibility({ get: (name) => name === 'configEditor' ? configEditor : name === 'skills' ? skills : undefined }, (name) => {
    if (name === 'tools') throw new Error('Fixture tool lookup failure');
    return skills;
  }, async () => '0.2.0-rc.2');
  const status = await compatibility.report();
  assert.equal(status.capabilities.mcpDiscovery, false);
  assert.equal(status.capabilities.skillCatalog, true);
  assert.deepEqual(status.writes, { mcp: true, skills: true, hooks: false });
});

await check('A version change after successful status cannot reuse its write authorization', async (t) => {
  runtimeVersion(t, '0.2.0-rc.2');
  const host = await fixture(); t.after(() => host.close());
  assert.equal((await host.rpc('compatibility.status')).value.writes.mcp, true);
  runtimeFixture.version = '0.2.1-alpha.4';
  assert.equal((await host.rpc(...mutations[0])).error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
  assert.equal(host.trace.edits, 0);
});

await check('Contradictory unverified status with write flags cannot enable Client writes', async (t) => {
  const host = await fixture({ managed: true }); t.after(() => host.close());
  host.rows.push(mcpProbeRow());
  const ui = await page(t, host, (method, args) => method === 'compatibility.status'
    ? host.rpc(method, args).then((result) => ({ ...result, value: { ...result.value, versionStatus: 'unverified' } }))
    : undefined);
  assert.equal(ui.button('编辑此 MCP').props.disabled, true);
  await ui.click('Skills');
  assert.equal(ui.button('注册 Runtime Skill').props.disabled, true);
  assert.equal(ui.mutations().length, 0);
});

await check('RPC mcp.update cancellation during queued config editing preserves configuration', async (t) => {
  const host = await fixture(); t.after(() => host.close());
  host.rows.push(mcpProbeRow());
  const probe = host.rows[host.rows.length - 1].entry;
  const before = structuredClone(probe.options.config);
  let entered;
  let release;
  const arrival = new Promise((done) => { entered = done; });
  const gate = new Promise((done) => { release = done; });
  host.ctx.get('configEditor').edit = async (_entry, change) => {
    entered();
    await gate;
    const next = change(structuredClone(probe.options.config), {});
    host.trace.edits++;
    probe.options.config = next;
  };
  const controller = new AbortController();
  const pending = host.rpc('mcp.update', { entryId: 'include:mcp-probe', patch: { toolCallTimeoutMs: 1000 } }, controller.signal);
  await arrival;
  controller.abort(new Error('Fixture queued cancellation'));
  release();
  assert.equal((await pending).ok, false);
  assert.equal(host.trace.edits, 0);
  assert.deepEqual(probe.options.config, before);
});

await tick();
writeReport();
