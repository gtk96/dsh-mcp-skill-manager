import assert from 'node:assert/strict';
import { check, fixture, tick } from './regression.test.mjs';

const localSkill = { name: 'fixture-skill', description: 'Fixture description', content: 'Fixture readable body', source: 'custom', provider: 'fixture-provider', path: '/fixture/SKILL.md' };

await check('Host registers both tools and every settings route using real Cordis', async (t) => {
  const host = await fixture();
  t.after(() => host.close());
  assert.equal(host.fiber.state, 2);
  assert.deepEqual([...host.tools.keys()].sort(), ['dsh_manage_mcp_servers', 'dsh_manage_skills']);
  assert.equal(host.routes.size, 11);
  for (const method of ['mcp.create', 'mcp.update', 'mcp.reset', 'mcp.remove', 'mcp.set-enabled']) {
    assert.ok(host.routes.has('/api/mcp-skill-manager.' + method), method);
  }
  assert.equal(host.routes.has('/api/mcp-skill-manager.hooks.list'), false, 'The Hook surface is gone');
});

await check('Web arrival and removal do not stop Host tools or leak routes', async (t) => {
  const host = await fixture({ web: false });
  t.after(() => host.close());
  await host.attachWeb();
  assert.equal(host.routes.size, 11);
  await host.detachWeb();
  assert.equal(host.routes.size, 0);
  assert.equal(host.tools.size, 2);
  await host.attachWeb();
  assert.equal(host.routes.size, 11);
});

await check('Disposal removes owned routes, tools and Runtime Skills', async () => {
  const host = await fixture();
  await host.rpc('skills.register', { name: 'fixture-skill', description: 'Fixture', content: 'Fixture instructions' });
  assert.equal(host.runtime.size, 1);
  await host.close();
  assert.equal(host.routes.size, 0);
  assert.equal(host.tools.size, 0);
  assert.equal(host.runtime.size, 0);
});

await check('Plugin unload releases a Runtime Skill while post-registration discovery is pending', async () => {
  let release;
  const observed = new Promise((done) => { release = done; });
  let snapshots = 0;
  const host = await fixture({
    snapshot: ({ runtime }) => ++snapshots === 2 ? observed : { skills: [...runtime.values()], complete: true },
  });
  const registering = host.rpc('skills.register', { name: 'late-skill', description: 'Late', content: 'Fixture instructions' });
  await tick();
  assert.equal(snapshots, 2);
  assert.equal(host.runtime.size, 1);
  const saved = [...host.runtime.values()];
  await host.close();
  assert.equal(host.runtime.size, 0);
  release({ skills: saved, complete: true });
  assert.equal((await registering).ok, false);
  assert.equal(host.runtime.size, 0);
});

await check('External provider errors are sanitized at both the tool and the RPC boundary', async (t) => {
  const host = await fixture({ snapshot: () => { throw new TypeError('fixture-provider-detail'); } });
  t.after(() => host.close());
  await assert.rejects(host.call('dsh_manage_skills', { action: 'list' }), (error) => !error.message.includes('fixture-provider-detail'));
  const result = await host.rpc('skills.list');
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result).includes('fixture-provider-detail'), false);
});

await check('Malformed RPC envelopes are rejected before any provider call', async (t) => {
  const host = await fixture();
  t.after(() => host.close());
  const endpoint = 'mcp-skill-manager.skills.register';
  const route = host.routes.get('/api/' + endpoint);
  const request = new Request('https://fixture.invalid/api/' + endpoint, { method: 'POST', body: JSON.stringify({ type: 'wrong', rpcId: 'fixture', method: endpoint }) });
  assert.equal((await route.fetch(request)).status, 400);
  assert.equal(host.trace.registrations, 0);
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

await check('Incomplete initial discovery prevents any Runtime registration', async (t) => {
  const host = await fixture({ snapshot: () => ({ skills: [], complete: false }) });
  t.after(() => host.close());
  const refused = await host.rpc('skills.register', { name: 'fixture-skill', description: 'Fixture', content: 'Fixture' });
  assert.equal(refused.ok, false);
  assert.match(refused.error.message, /incomplete/);
  assert.equal(host.trace.registrations, 0);
  assert.equal(host.runtime.size, 0);
});

await check('Incomplete post-registration discovery rolls back and clears the pending name', async (t) => {
  let incomplete = true;
  const host = await fixture({ snapshot: ({ runtime, trace }) => ({ skills: [...runtime.values()], complete: !(incomplete && trace.registrations > 0) }) });
  t.after(() => host.close());
  const args = { name: 'fixture-skill', description: 'Fixture', content: 'Fixture' };
  const rolledBack = await host.rpc('skills.register', args);
  assert.equal(rolledBack.ok, false);
  assert.match(rolledBack.error.message, /rolled back|incomplete/);
  assert.equal(host.runtime.size, 0);
  assert.equal(host.trace.rollbacks, 1);
  incomplete = false;
  assert.equal((await host.rpc('skills.register', args)).value.persisted, false);
});

await check('Cancellation during registration rolls back the borrowed Skill', async (t) => {
  const controller = new AbortController();
  const host = await fixture({ get: ({ name, runtime }) => { const value = runtime.get(name); controller.abort(); return value; } });
  t.after(() => host.close());
  const cancelled = await host.rpc('skills.register', { name: 'fixture-skill', description: 'Fixture', content: 'Fixture' }, controller.signal);
  assert.equal(cancelled.ok, false);
  assert.equal(host.runtime.size, 0);
  assert.equal(host.trace.rollbacks, 1);
});

await check('Runtime Skill registration preserves body whitespace and rejects blank bodies', async (t) => {
  const host = await fixture();
  t.after(() => host.close());
  const content = '\n  indented line\n\n';
  const args = { name: 'spaced-skill', description: 'Fixture', content };
  assert.equal((await host.rpc('skills.register', args)).value.persisted, false);
  assert.equal(host.runtime.get('spaced-skill').content, content);
  assert.equal((await host.rpc('skills.get', { name: 'spaced-skill' })).value.skill.content, content);
  const blank = await host.rpc('skills.register', { ...args, name: 'blank-skill', content: ' \n\t' });
  assert.equal(blank.ok, false);
  assert.match(blank.error.message, /required|content/);
  assert.equal(host.runtime.has('blank-skill'), false);
});

await check('A shadowed Runtime Skill cannot be offered or removed as an external Skill', async (t) => {
  const shadow = [];
  const host = await fixture({ skillRows: { profile: shadow } });
  t.after(() => host.close());
  await host.rpc('skills.register', { name: 'shared-skill', description: 'Fixture', content: 'Fixture instructions' });
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
  const gate = new Promise((done) => { release = done; });
  const host = await fixture({ get: ({ name, runtime }) => gated ? gate.then(() => runtime.get(name)) : runtime.get(name) });
  t.after(() => host.close());
  await host.rpc('skills.register', { name: 'concurrent-skill', description: 'Fixture', content: 'Instructions' });
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

await check('The skills list hides paths that are URLs and reports complete catalogs', async (t) => {
  const host = await fixture({ skillRows: { profile: [localSkill, { ...localSkill, name: 'remote-skill', path: 'https://example.invalid/SKILL.md' }] } });
  t.after(() => host.close());
  const rows = (await host.rpc('skills.list')).value.skills;
  assert.equal(rows.find((row) => row.name === 'fixture-skill').path, '/fixture/SKILL.md');
  assert.equal(rows.find((row) => row.name === 'remote-skill').path, undefined);
  assert.equal((await host.rpc('skills.get', { name: 'fixture-skill' })).value.skill.content, localSkill.content);
});

await check('The Agent MCP tool lists servers and stays read-only', async (t) => {
  const host = await fixture({
    base: [{ id: 'mcp-a', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'a', transport: 'stdio', command: 'a' }, loaded: 'ok' }],
    globalTools: [{ name: 'mcp__a__query' }],
  });
  t.after(() => host.close());
  const value = await host.call('dsh_manage_mcp_servers', { action: 'list' });
  assert.deepEqual(value.servers.map((row) => row.serverName), ['a']);
  assert.deepEqual(value.servers[0].tools, ['mcp__a__query']);
  await assert.rejects(host.call('dsh_manage_mcp_servers', { action: 'upsert' }), /one of|list/);
  assert.equal(host.profile.trace.edits, 0);
});

await check('The Agent MCP tool reads the calling scope, not the profile scope', async (t) => {
  const host = await fixture({
    base: [{ id: 'mcp-a', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'a', transport: 'stdio', command: 'a' }, loaded: 'ok' }],
    scopedTools: { 'fixture-agent': [{ name: 'mcp__a__scoped' }] },
  });
  t.after(() => host.close());
  const agent = { id: 'fixture-agent' };
  const value = await host.call('dsh_manage_mcp_servers', { action: 'list' }, { agent });
  assert.deepEqual(value.servers[0].tools, ['mcp__a__scoped'], 'A scoped call must see its own tools');
  assert.equal(host.trace.toolScopes.at(-1), 'fixture-agent');
  const profile = await host.call('dsh_manage_mcp_servers', { action: 'list' });
  assert.deepEqual(profile.servers[0].tools, [], 'A profile call sees no agent-scoped tool');
});

await check('Both optional DSH peers accept the verified baselines', async () => {
  const { readFileSync } = await import('node:fs');
  const semver = (await import('semver')).default;
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  for (const name of ['@deepseek-ai/dsh', '@deepseek-ai/dsh-mcp-client', '@deepseek-ai/dsh-atomic-write']) {
    const range = manifest.peerDependencies[name];
    assert.ok(range, name);
    for (const version of ['0.2.0-rc.2', '0.2.1-rc.2', '0.2.1-rc.3']) assert.equal(semver.satisfies(version, range), true, `${name}: ${version}`);
    assert.equal(semver.satisfies('0.1.9', range), false);
    assert.equal(manifest.peerDependenciesMeta[name].optional, true);
  }
  assert.equal(manifest.dependencies.yaml, '^2.9.0');
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-hooks-claude-code'], undefined, 'Hook dependencies are gone');
  assert.equal(manifest.files.includes('managed-hooks.js'), false);
});
