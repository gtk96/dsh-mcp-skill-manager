import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { check, fixture, page, writeReport, tick } from './regression.test.mjs';

const A = () => ({ id: 'fixture-A', ctx: { preset: 'alpha' }, session: { header: { id: 'fixture-A', cwd: '/fixture/project-a', agentPreset: 'alpha' } } });
const B = () => ({ id: 'fixture-B', ctx: { preset: 'beta' }, session: { header: { id: 'fixture-B', cwd: '/fixture/project-b', agentPreset: 'beta' } } });
const skill = (name, content, provider = 'fixture-provider') => ({ name, content, description: name, source: 'project-agents', provider, path: '/fixture/SKILL.md' });
const northstar = skill('northstar-okr', 'Fixture northstar instructions');
const tool = (name) => ({ name });
const options = () => ({
  agents: [A(), B()], presets: true,
  skillRows: { 'fixture-A': [skill('alpha-only', 'A instructions')], 'fixture-B': [northstar] },
  scopedTools: { 'fixture-A': [tool('alpha_tool')], 'fixture-B': [tool('mcp__mc__query'), tool('mcp__holo__query')] },
});
async function select(ui, id) {
  const picker = ui.renderer.root.findByProps({ 'aria-label': '能力视图' });
  assert.equal(picker.props.disabled, false);
  await act(async () => { picker.props.onChange({ currentTarget: { value: id } }); await tick(); });
}
const projection = (id) => ({ [id]: { id, title: 'Fixture selected conversation', retainedBy: { mainView: 1 } } });

await check('Session roster includes cold metadata without reading or resuming conversation logs', async (t) => {
  const opts = options();
  opts.records = [{ header: { id: 'fixture-cold', cwd: '/fixture/cold', agentPreset: 'gamma' } }];
  const host = await fixture(opts); t.after(() => host.close());
  const result = await host.rpc('contexts.list');
  assert.equal(result.ok, true);
  assert.equal(result.value.contexts.find((row) => row.sessionId === 'fixture-cold').live, false);
  assert.equal(result.value.contexts.find((row) => row.sessionId === 'fixture-B').live, true);
  assert.equal(host.trace.sessionLists, 1);
  assert.equal(host.trace.edits, 0);
  assert.equal(host.trace.registrations, 0);
});

await check('Selected session B discovers northstar OKR while global and session A do not', async (t) => {
  const host = await fixture(options()); t.after(() => host.close());
  assert.equal((await host.rpc('skills.list')).value.skills.length, 0);
  assert.deepEqual((await host.rpc('skills.list', { sessionId: 'fixture-A' })).value.skills.map((row) => row.name), ['alpha-only']);
  const result = await host.rpc('skills.list', { sessionId: 'fixture-B' });
  assert.equal(result.value.skills[0].name, 'northstar-okr');
  assert.equal(result.value.skills[0].provider, 'fixture-provider');
  assert.equal(result.value.context.cwd, '/fixture/project-b');
  assert.equal(host.trace.snapshots.at(-1).scope, host.agents.get('fixture-B'));
  const body = await host.rpc('skills.get', { sessionId: 'fixture-B', name: 'northstar-okr' });
  assert.equal(body.value.skill.content, northstar.content);
  assert.equal(host.trace.lookups.at(-1).scope, host.agents.get('fixture-B'));
});

await check('Selected session B exposes MC and Holo candidates using its effective tool scope', async (t) => {
  const host = await fixture(options()); t.after(() => host.close());
  assert.equal((await host.rpc('mcp.discover')).value.candidates.length, 0);
  const result = await host.rpc('mcp.discover', { sessionId: 'fixture-B' });
  assert.deepEqual(result.value.candidates.map((row) => row.name), ['mcp__mc__query', 'mcp__holo__query']);
  assert.equal(result.value.candidates.every((row) => row.definitionView === 'session-specific'), true);
  assert.equal(result.value.candidates.every((row) => row.connectionState === 'unknown'), true);
  assert.equal(result.value.provenanceComplete, false);
  assert.equal(result.value.connectionStateSupported, false);
  assert.equal(host.trace.toolScopes.at(-1), 'fixture-B');
  const direct = await host.call('dsh_manage_mcp_servers', { action: 'discover' }, { agent: host.agents.get('fixture-B') });
  assert.equal(direct.candidates.length, 2);
});

await check('Scoped restrictions and definition equivalence are preserved', async (t) => {
  const opts = options();
  opts.globalTools = [tool('mcp__common__ping'), tool('hidden_in_B')];
  opts.hidden = { 'fixture-B': ['hidden_in_B'] };
  const host = await fixture(opts); t.after(() => host.close());
  const result = (await host.rpc('mcp.discover', { sessionId: 'fixture-B' })).value;
  assert.equal(result.tools.some((row) => row.name === 'hidden_in_B'), false);
  assert.equal(result.tools.find((row) => row.name === 'mcp__common__ping').definitionView, 'same-as-profile');
});

await check('Preset-isolated registries are selected for both Skills and tools', async (t) => {
  const opts = options();
  const isolated = skill('isolated-okr', 'Isolated fixture body');
  const definition = tool('mcp__isolated__query');
  opts.services = { 'fixture-B': {
    skills: { snapshot: async () => ({ skills: [isolated], complete: true }), get: async () => isolated },
    tools: { schemas: () => [definition], get: () => definition },
  } };
  const host = await fixture(opts); t.after(() => host.close());
  const skills = await host.rpc('skills.list', { sessionId: 'fixture-B' });
  assert.deepEqual(skills.value.skills.map((row) => row.name), ['isolated-okr']);
  assert.equal(host.trace.snapshots.length, 0);
  assert.equal((await host.rpc('skills.get', { sessionId: 'fixture-B', name: 'isolated-okr' })).value.skill.content, isolated.content);
  assert.equal((await host.rpc('mcp.discover', { sessionId: 'fixture-B' })).value.candidates[0].name, definition.name);
});

await check('Native and preset config sources retain provenance but never imply online status', async (t) => {
  const opts = options();
  opts.inventory = [{ id: 'beta', rows: [{ moduleName: '@deepseek-ai/dsh-mcp-client', entryId: 'fixture-preset-mcp', enabled: true, fiberState: 2 }] }];
  const host = await fixture(opts); t.after(() => host.close());
  host.rows.push({ entry: { id: 'include:fixture-zero', options: { id: 'fixture-zero', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'zero-tools-fixture', command: 'fixture-not-for-display' } }, fiber: { state: 2 } }, inherited: {}, override: {} });
  const result = (await host.rpc('mcp.discover', { sessionId: 'fixture-B' })).value;
  assert.equal(result.configured.length, 2);
  assert.equal(result.configured.some((row) => row.serverName === 'zero-tools-fixture'), true);
  assert.equal(result.configured.some((row) => row.kind === 'preset-config' && row.preset === 'beta'), true);
  assert.equal(result.configured.every((row) => row.connectionState === 'unknown'), true);
  assert.equal(JSON.stringify(result).includes('fixture-not-for-display'), false);
});

await check('Opaque MCP-like names are preserved without parsing server or raw tool identity', async (t) => {
  const opts = options();
  opts.globalTools = [tool('mcp__a__b__query_deadbeef1234')];
  const host = await fixture(opts); t.after(() => host.close());
  const candidate = (await host.rpc('mcp.discover')).value.candidates[0];
  assert.equal(candidate.name, 'mcp__a__b__query_deadbeef1234');
  assert.equal(candidate.evidence, 'name-convention');
  assert.equal(Object.hasOwn(candidate, 'serverName'), false);
  assert.equal(Object.hasOwn(candidate, 'connected'), false);
});

await check('Unknown or unloaded sessions fail explicitly instead of falling back to global', async (t) => {
  const host = await fixture(options()); t.after(() => host.close());
  for (const method of ['skills.list', 'skills.get', 'mcp.discover']) {
    const result = await host.rpc(method, { sessionId: 'fixture-cold', name: 'northstar-okr' });
    assert.equal(result.ok, false);
    assert.ok(result.error.message.includes('no live Agent'));
  }
  assert.equal(host.trace.snapshots.length, 0);
});

await check('A selected Agent disappearing during discovery invalidates the response', async (t) => {
  let release;
  const gate = new Promise((done) => { release = done; });
  const opts = options(); opts.snapshot = async () => { await gate; return { skills: [northstar], complete: true }; };
  const host = await fixture(opts); t.after(() => host.close());
  const pending = host.rpc('skills.list', { sessionId: 'fixture-B' });
  await tick(); host.agents.delete('fixture-B'); release();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.ok(result.error.message.includes('unloaded'));
  assert.equal(Object.hasOwn(result, 'value'), false);
});

await check('Settings defaults to its selected conversation and finds all three fixture capabilities', async (t) => {
  const host = await fixture(options()); t.after(() => host.close());
  const ui = await page(t, host, undefined, projection('fixture-B'));
  assert.equal(ui.renderer.root.findByProps({ 'aria-label': '能力视图' }).props.value, 'fixture-B');
  assert.ok(ui.content().includes('mcp__mc__query'));
  assert.ok(ui.content().includes('mcp__holo__query'));
  await ui.click('Skills');
  assert.ok(ui.content().includes('northstar-okr'));
  await ui.click('查看正文');
  assert.ok(ui.content().includes(northstar.content));
  assert.equal(ui.requests.filter((row) => ['skills.list', 'skills.get', 'mcp.discover'].includes(row.method)).every((row) => row.args.sessionId === 'fixture-B'), true);
  assert.equal(ui.mutations().length, 0);
});

await check('Switching sessions discards a delayed old Skill list', async (t) => {
  const host = await fixture(options()); t.after(() => host.close());
  let release;
  const gate = new Promise((done) => { release = done; });
  let used = false;
  const ui = await page(t, host, (method, args) => {
    if (method === 'skills.list' && args.sessionId === 'fixture-A' && !used) { used = true; return gate; }
  }, projection('fixture-A'));
  await select(ui, 'fixture-B');
  await ui.click('Skills');
  assert.ok(ui.content().includes('northstar-okr'));
  await act(async () => { release(await host.rpc('skills.list', { sessionId: 'fixture-A' })); await tick(); });
  assert.ok(ui.content().includes('northstar-okr'));
  assert.equal(ui.content().includes('alpha-only'), false);
});

await check('Switching sessions discards a delayed body and reads the matching new body', async (t) => {
  const opts = options();
  opts.skillRows = { 'fixture-A': [skill('same-name', 'Fixture body A')], 'fixture-B': [skill('same-name', 'Fixture body B')] };
  const host = await fixture(opts); t.after(() => host.close());
  let release;
  const gate = new Promise((done) => { release = done; });
  const ui = await page(t, host, (method, args) => method === 'skills.get' && args.sessionId === 'fixture-A' ? gate : undefined, projection('fixture-A'));
  await ui.click('Skills'); await ui.click('查看正文');
  await select(ui, 'fixture-B');
  await act(async () => { release(await host.rpc('skills.get', { sessionId: 'fixture-A', name: 'same-name' })); await tick(); });
  assert.equal(ui.content().includes('Fixture body A'), false);
  await ui.click('查看正文');
  assert.ok(ui.content().includes('Fixture body B'));
});

await check('Mismatched response scope produces an explicit page error', async (t) => {
  const host = await fixture(options()); t.after(() => host.close());
  const ui = await page(t, host, (method) => method === 'skills.list' ? { ok: true, value: { skills: [northstar], complete: true, context: { sessionId: 'fixture-A' } } } : undefined, projection('fixture-B'));
  await ui.click('Skills');
  assert.ok(ui.alerts().some((message) => message.includes('上下文不匹配')));
  assert.equal(ui.content().includes('northstar-okr'), false);
});

await check('Agent views cannot mutate global config maps or Runtime Skills', async (t) => {
  const host = await fixture(options()); t.after(() => host.close());
  for (const method of ['mcp.upsert', 'mcp.remove', 'skills.register', 'skills.unregister']) {
    const result = await host.rpc(method, { sessionId: 'fixture-B', name: 'fixture', description: 'Fixture', content: 'Fixture' });
    assert.equal(result.ok, false);
    assert.ok(result.error.message.includes('Profile global'));
  }
  assert.equal(host.trace.edits, 0);
  assert.equal(host.trace.registrations, 0);
});

await check('Switching sessions discards a delayed MCP discovery response', async (t) => {
  const opts = options(); opts.scopedTools['fixture-A'] = [tool('mcp__alpha__ping')];
  const host = await fixture(opts); t.after(() => host.close());
  let release;
  const gate = new Promise((done) => { release = done; });
  const ui = await page(t, host, (method, args) => method === 'mcp.discover' && args.sessionId === 'fixture-A' ? gate : undefined, projection('fixture-A'));
  await select(ui, 'fixture-B');
  assert.ok(ui.content().includes('mcp__holo__query'));
  await act(async () => { release(await host.rpc('mcp.discover', { sessionId: 'fixture-A' })); await tick(); });
  assert.ok(ui.content().includes('mcp__holo__query'));
  assert.equal(ui.content().includes('mcp__alpha__ping'), false);
});

await check('A global write locks view selection until its result and refresh settle', async (t) => {
  const host = await fixture(options()); t.after(() => host.close());
  let release;
  const gate = new Promise((done) => { release = done; });
  const ui = await page(t, host, (method) => method === 'mcp.remove' ? gate : undefined);
  await ui.click('移除'); await ui.click('确认移除');
  assert.equal(ui.renderer.root.findByProps({ 'aria-label': '能力视图' }).props.disabled, true);
  await act(async () => { release(await host.rpc('mcp.remove', { entryId: 'include:fixture', name: 'demo', configPath: 'maps.A', sessionId: '' })); await tick(); });
  assert.equal(ui.renderer.root.findByProps({ 'aria-label': '能力视图' }).props.disabled, false);
});

await check('A refresh clears the previous catalog body and rebinds the body to the new catalog', async (t) => {
  const opts = options();
  opts.skillRows = { 'fixture-A': [skill('stable-skill', 'Fixture catalog body')] };
  const host = await fixture(opts); t.after(() => host.close());
  const ui = await page(t, host, undefined, projection('fixture-A'));
  await ui.click('Skills');
  await ui.click('查看正文');
  assert.ok(ui.content().includes('Fixture catalog body'), '首次读取应显示正文');
  const revisionNode = () => ui.renderer.root.findAll((node) => typeof node.props?.['data-catalog-revision'] === 'string')[0];
  const firstRevision = revisionNode().props['data-catalog-revision'];
  await ui.click('刷新 Skills');
  assert.equal(ui.content().includes('Fixture catalog body'), false, '刷新后不得保留旧目录正文');
  assert.equal(ui.renderer.root.findAllByProps({ 'data-catalog-revision': firstRevision }).length, 0, '刷新后应产生新的目录代次');
  assert.equal(ui.button('查看正文').props.disabled, false);
  const nextRevision = revisionNode().props['data-catalog-revision'];
  assert.notEqual(nextRevision, firstRevision);
  await ui.click('查看正文');
  assert.ok(ui.content().includes('Fixture catalog body'), '正文应重新绑定到刷新后的目录');
  assert.equal(ui.requests.filter((row) => row.method === 'skills.get').length, 2);
});

await tick();
writeReport();
