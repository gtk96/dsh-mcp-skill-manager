import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import './session-discovery.test.mjs';
import { check, fixture, page, tick, writeReport } from './regression.test.mjs';
import { createCompatibility, CompatibilityError } from './compatibility.js';
import runtimeFixture from '@deepseek-ai/dsh/package.json' with { type: 'json' };

function runtimeVersion(t, version) {
  const previous = runtimeFixture.version;
  runtimeFixture.version = version;
  t.after(() => { runtimeFixture.version = previous; });
}
const mutations = [
  ['mcp.upsert', { entryId: 'include:fixture', configPath: 'maps.A', name: 'probe', definition: { command: 'fixture' } }],
  ['mcp.remove', { entryId: 'include:fixture', configPath: 'maps.A', name: 'demo' }],
  ['skills.register', { name: 'probe-skill', description: 'Fixture', content: 'Fixture body' }],
  ['skills.unregister', { name: 'probe-skill' }],
];
const localSkill = { name: 'fixture-skill', description: 'Fixture description', content: 'Fixture readable body', source: 'custom', provider: 'fixture-provider' };

await check('Compatibility reports version and methods without invoking business services', async (t) => {
  const host = await fixture(); t.after(() => host.close());
  const result = await host.rpc('compatibility.status');
  assert.equal(result.ok, true);
  assert.equal(result.value.runtimeVersion, '0.2.0-rc.2');
  assert.equal(result.value.pluginVersion, '0.4.0');
  assert.equal(result.value.versionStatus, 'tested');
  assert.deepEqual(result.value.writes, { mcp: true, skills: true });
  assert.equal(result.value.capabilities.sessionSelection, false);
  assert.equal(result.value.checks, 'method-presence-only');
  assert.equal(host.trace.edits + host.trace.registrations + host.trace.snapshots.length, 0);
});

for (const version of ['0.2.1-alpha.4', '1.0.0', undefined, 'not-a-version']) {
  await check(`Runtime ${version ?? 'unknown'} is read-only at RPC and Tool boundaries`, async (t) => {
    runtimeVersion(t, version);
    const host = await fixture({ skillRows: { profile: [localSkill] } }); t.after(() => host.close());
    const status = await host.rpc('compatibility.status');
    assert.equal(status.ok, true);
    assert.equal(status.value.versionStatus, typeof version === 'string' && version !== 'not-a-version' ? 'unverified' : 'unknown');
    assert.deepEqual(status.value.writes, { mcp: false, skills: false });
    for (const [method, args] of mutations) {
      const result = await host.rpc(method, args);
      assert.equal(result.ok, false, method);
      assert.equal(result.error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
      assert.match(result.error.message, /只读/);
    }
    await assert.rejects(host.call('dsh_manage_mcp_servers', { ...mutations[0][1], action: 'upsert' }), /只读/);
    await assert.rejects(host.call('dsh_manage_skills', { ...mutations[2][1], action: 'register' }), /只读/);
    assert.equal(host.trace.edits + host.trace.registrations + host.trace.rollbacks, 0);
    assert.equal((await host.rpc('mcp.catalog')).ok, true);
    assert.equal((await host.rpc('skills.list')).value.skills[0].name, localSkill.name);
    assert.equal((await host.rpc('skills.get', { name: localSkill.name })).value.skill.content, localSkill.content);
  });
}

await check('Missing config edit method blocks only MCP writes and preserves reads and Runtime operations', async (t) => {
  const host = await fixture(); t.after(() => host.close());
  host.ctx.get('configEditor').edit = undefined;
  const status = (await host.rpc('compatibility.status')).value;
  assert.equal(status.capabilities.configEdit, false);
  assert.deepEqual(status.writes, { mcp: false, skills: true });
  assert.equal((await host.rpc('mcp.catalog')).ok, true);
  assert.equal((await host.rpc(...mutations[0])).error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
  assert.equal((await host.rpc(...mutations[2])).ok, true);
  assert.equal(host.trace.edits, 0);
  assert.equal(host.trace.registrations, 1);
});

await check('Missing Runtime register method blocks only Skill writes', async (t) => {
  const host = await fixture(); t.after(() => host.close());
  host.skills.register = undefined;
  const status = (await host.rpc('compatibility.status')).value;
  assert.deepEqual(status.writes, { mcp: true, skills: false });
  assert.equal((await host.rpc(...mutations[2])).error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
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
  const host = await fixture({ skillRows: { profile: [localSkill] } }); t.after(() => host.close());
  const ui = await page(t, host);
  assert.ok(ui.content().includes('0.2.1-alpha.4'));
  assert.ok(ui.content().includes('保持只读'));
  assert.equal(ui.button('编辑 override').props.disabled, true);
  assert.equal(ui.button('移除').props.disabled, true);
  await ui.click('Skills');
  assert.equal(ui.button('注册 Runtime Skill').props.disabled, true);
  await ui.click('查看正文');
  assert.ok(ui.content().includes(localSkill.content));
  assert.equal(ui.mutations().length, 0);
});

for (const value of [undefined, { protocolVersion: 9 }, { protocolVersion: 1, writes: { mcp: true, skills: true } }]) {
  await check(`Failed or malformed compatibility status ${JSON.stringify(value)} cannot enable page writes`, async (t) => {
    const host = await fixture(); t.after(() => host.close());
    const ui = await page(t, host, (method) => method === 'compatibility.status'
      ? value === undefined ? { ok: false, error: { message: 'Fixture old Host without status endpoint' } } : { ok: true, value }
      : undefined);
    assert.ok(ui.alerts().some((message) => message.includes('写入已禁用')));
    assert.equal(ui.button('编辑 override').props.disabled, true);
    await ui.click('Skills');
    assert.equal(ui.button('注册 Runtime Skill').props.disabled, true);
    assert.equal(ui.mutations().length, 0);
  });
}

await check('A delayed old-session compatibility response cannot authorize the new view', async (t) => {
  const agent = (id) => ({ id, ctx: { preset: 'fixture' }, session: { header: { id, cwd: '/fixture', agentPreset: 'fixture' } } });
  const host = await fixture({ agents: [agent('A'), agent('B')], presets: true }); t.after(() => host.close());
  let release;
  const old = new Promise((done) => { release = done; });
  const ui = await page(t, host, (method, args) => {
    if (method !== 'compatibility.status') return undefined;
    if (args.sessionId === 'A') return old;
    return host.rpc(method, args).then((result) => ({ ...result, value: { ...result.value, versionStatus: 'unverified', writes: { mcp: false, skills: false } } }));
  }, { A: { id: 'A', retainedBy: { mainView: 1 } }, B: { id: 'B' } });
  const selector = ui.renderer.root.findByProps({ 'aria-label': '能力视图' });
  await act(async () => { selector.props.onChange({ currentTarget: { value: 'B' } }); await tick(); });
  assert.ok(ui.content().includes('保持只读'));
  await act(async () => { release(await host.rpc('compatibility.status', { sessionId: 'A' })); await tick(); });
  assert.ok(ui.content().includes('保持只读'));
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
  assert.deepEqual(status.writes, { mcp: true, skills: true });
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
  const host = await fixture(); t.after(() => host.close());
  const ui = await page(t, host, (method, args) => method === 'compatibility.status'
    ? host.rpc(method, args).then((result) => ({ ...result, value: { ...result.value, versionStatus: 'unverified' } }))
    : undefined);
  assert.equal(ui.button('编辑 override').props.disabled, true);
  await ui.click('Skills');
  assert.equal(ui.button('注册 Runtime Skill').props.disabled, true);
  assert.equal(ui.mutations().length, 0);
});

for (const boundary of ['Tool', 'RPC']) for (const action of ['upsert', 'remove']) {
  await check(`${boundary} ${action} cancellation during queued config editing preserves configuration`, async (t) => {
    const host = await fixture(); t.after(() => host.close());
    const before = structuredClone(host.entry.options.config);
    let entered;
    let release;
    const arrival = new Promise((done) => { entered = done; });
    const gate = new Promise((done) => { release = done; });
    host.ctx.get('configEditor').edit = async (_entry, change) => {
      entered();
      await gate;
      const next = change(structuredClone(host.entry.options.config), structuredClone(host.inherited));
      host.trace.edits++;
      host.entry.options.config = next;
    };
    const controller = new AbortController();
    const args = mutations[action === 'upsert' ? 0 : 1][1];
    const pending = boundary === 'Tool'
      ? host.call('dsh_manage_mcp_servers', { ...args, action }, { signal: controller.signal })
      : host.rpc(`mcp.${action}`, args, controller.signal);
    await arrival;
    controller.abort(new Error('Fixture queued cancellation'));
    release();
    if (boundary === 'Tool') await assert.rejects(pending);
    else assert.equal((await pending).ok, false);
    assert.equal(host.trace.edits, 0);
    assert.deepEqual(host.entry.options.config, before);
  });
}

await tick();
writeReport();
