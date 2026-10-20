import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, fixture, page } from './regression.test.mjs';
import { isSkillName, parseSkillText, renderSkillFile, revealCommand } from './skill-files.js';
import runtimeFixture from '@deepseek-ai/dsh/package.json' with { type: 'json' };

/**
 * The skills the filesystem provider would report right now, derived from the real files.
 * The fixture's catalog would otherwise go stale the moment a write renames an entry point.
 */
function liveSkills(root) {
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return []; }
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, 'SKILL.md');
    if (!existsSync(file)) continue;
    const parsed = parseSkillText(readFileSync(file, 'utf8'));
    if (parsed === undefined) continue;
    skills.push({
      name: parsed.data.name,
      description: parsed.data.description,
      ...(typeof parsed.data.whenToUse === 'string' ? { whenToUse: parsed.data.whenToUse } : {}),
      invocation: {
        modelInvocable: parsed.data['disable-model-invocation'] !== true,
        userInvocable: parsed.data['user-invocable'] !== false,
      },
      content: parsed.body.trim(),
      source: 'user-dsh',
      provider: 'fixture-filesystem',
      path: file,
    });
  }
  return skills;
}

/** A fixture bound to a real, temporary skill home, with the catalog reading the same files. */
async function hostWith(extra = {}) {
  const state = {};
  const host = await fixture({
    ...extra,
    snapshot: ({ runtime }) => ({ skills: [...liveSkills(state.root), ...runtime.values()], complete: true }),
    get: ({ name, runtime }) => liveSkills(state.root).find((skill) => skill.name === name) ?? runtime.get(name),
  });
  state.root = host.skillRoot();
  mkdirSync(state.root, { recursive: true });
  const file = (name) => join(state.root, name, 'SKILL.md');
  /** Write one skill file the way the runtime's provider expects to find it. */
  const seed = (name, { description = 'Fixture', content = 'Fixture body', whenToUse, frontmatter } = {}) => {
    mkdirSync(join(state.root, name), { recursive: true });
    writeFileSync(file(name), renderSkillFile({ name, description, content, whenToUse }, frontmatter));
    return file(name);
  };
  return { host, root: state.root, file, seed };
}

// ---------------------------------------------------------------------------
// Pure rendering rules: what lands in a SKILL.md this page writes.
// ---------------------------------------------------------------------------

await check('A rendered skill file carries only canonical frontmatter keys', () => {
  assert.equal(isSkillName('my-skill'), true);
  assert.equal(isSkillName('My-Skill'), false);
  assert.equal(isSkillName('my_skill'), false);
  assert.equal(isSkillName('-lead'), false);
  const text = renderSkillFile({ name: 'my-skill', description: 'Does a thing', content: 'Body text\n' });
  assert.equal(text, '---\nname: my-skill\ndescription: Does a thing\n---\n\nBody text\n');
  // The runtime drops a whole file that carries a legacy key, so one must never be written back.
  const legacy = renderSkillFile(
    { name: 'my-skill', description: 'Does a thing', content: 'Body' },
    { name: 'stale', description: 'stale', userInvocable: false, modelInvocable: false, owner: 'me' },
  );
  assert.doesNotMatch(legacy, /userInvocable|modelInvocable|disableModelInvocation/);
  assert.match(legacy, /owner: me/, 'A key this page does not own survives an edit');
  assert.doesNotMatch(legacy, /stale/);
  const restricted = renderSkillFile({ name: 'my-skill', description: 'D', content: 'B', modelInvocable: false, userInvocable: false });
  const parsed = parseSkillText(restricted);
  assert.equal(parsed.data['disable-model-invocation'], true);
  assert.equal(parsed.data['user-invocable'], false);
  assert.equal(parseSkillText('no frontmatter here'), undefined);
});

await check('The reveal command is chosen per platform', () => {
  assert.deepEqual(revealCommand('darwin', '/a/SKILL.md'), ['open', ['-R', '/a/SKILL.md']]);
  assert.deepEqual(revealCommand('win32', '/a/SKILL.md'), ['explorer', ['/select,', '/a/SKILL.md']]);
  assert.deepEqual(revealCommand('linux', '/a/b/SKILL.md'), ['xdg-open', ['/a/b']]);
});

// ---------------------------------------------------------------------------
// Host writes, against a real filesystem.
// ---------------------------------------------------------------------------

await check('Creating a skill writes a bundle the runtime would discover', async (t) => {
  const { host, file, root } = await hostWith();
  t.after(() => host.close());
  const created = await host.rpc('skills.save', {
    mode: 'create', name: 'new-skill', description: 'Does a thing', content: 'Step one.\n', root,
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.equal(created.value.path, file('new-skill'));
  assert.equal(created.value.rootPath, root);
  const saved = parseSkillText(readFileSync(file('new-skill'), 'utf8'));
  assert.equal(saved.data.name, 'new-skill');
  assert.equal(saved.data.description, 'Does a thing');
  assert.equal(saved.body.trim(), 'Step one.');
  assert.doesNotMatch(readFileSync(file('new-skill'), 'utf8'), /disable-model-invocation/);
  const listed = (await host.rpc('skills.list')).value.skills;
  assert.deepEqual(listed.map((skill) => [skill.name, skill.editable, skill.rootPath]), [['new-skill', true, root]]);
  const again = await host.rpc('skills.save', { mode: 'create', name: 'new-skill', description: 'D', content: 'B', root });
  assert.equal(again.ok, false);
  assert.match(again.error.message, /已存在/);
});

await check('The write path refuses an unusable name or a blank description', async (t) => {
  const { host, root } = await hostWith();
  t.after(() => host.close());
  for (const name of ['Bad Name', 'bad_name', 'bad--name', '']) {
    const result = await host.rpc('skills.save', { mode: 'create', name, description: 'D', content: 'B', root });
    assert.equal(result.ok, false, name);
    assert.match(result.error.message, /kebab-case|需要指定/);
  }
  const blank = await host.rpc('skills.save', { mode: 'create', name: 'ok-name', description: '  ', content: 'B', root });
  assert.equal(blank.ok, false);
  assert.match(blank.error.message, /描述/);
  assert.deepEqual(readdirSync(root), [], 'A refused create leaves the root untouched');
});

await check('Editing rewrites the body and keeps keys this page does not own', async (t) => {
  const { host, file, root, seed } = await hostWith();
  t.after(() => host.close());
  seed('edit-me', { description: 'First', content: 'First body', whenToUse: 'When testing', frontmatter: { owner: 'fixture' } });
  writeFileSync(file('edit-me'), readFileSync(file('edit-me'), 'utf8')
    .replace('description: First', 'description: First\ndisable-model-invocation: true'));
  const before = (await host.rpc('skills.list')).value.skills[0];
  assert.equal(before.invocation.modelInvocable, false, 'The catalog reports the stored policy');
  assert.equal(before.whenToUse, 'When testing');
  const saved = await host.rpc('skills.save', {
    mode: 'edit', name: 'edit-me', description: 'Second', content: 'Second body', root, modelInvocable: false,
  });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const parsed = parseSkillText(readFileSync(file('edit-me'), 'utf8'));
  assert.equal(parsed.data.description, 'Second');
  assert.equal(parsed.body.trim(), 'Second body');
  assert.equal(parsed.data.owner, 'fixture', 'A key this page does not own survives');
  assert.equal(parsed.data['disable-model-invocation'], true);
  assert.equal('whenToUse' in parsed.data, false, 'A cleared field is cleared on disk');
  const after = (await host.rpc('skills.list')).value.skills[0];
  assert.equal(after.description, 'Second');
  assert.equal(after.whenToUse, undefined);
  assert.deepEqual(after.invocation, { modelInvocable: false, userInvocable: true });
});

await check('An edit that omits the policy restores both kinds of invocation', async (t) => {
  const { host, file, root } = await hostWith();
  t.after(() => host.close());
  const target = join(root, 'open-me');
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'SKILL.md'),
    '---\nname: open-me\ndescription: D\ndisable-model-invocation: true\nuser-invocable: false\n---\n\nB\n');
  assert.deepEqual((await host.rpc('skills.list')).value.skills[0].invocation, { modelInvocable: false, userInvocable: false });
  const saved = await host.rpc('skills.save', { mode: 'edit', name: 'open-me', description: 'D2', content: 'B', root });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const parsed = parseSkillText(readFileSync(file('open-me'), 'utf8'));
  assert.equal('disable-model-invocation' in parsed.data, false);
  assert.equal('user-invocable' in parsed.data, false);
  const missing = await host.rpc('skills.save', { mode: 'edit', name: 'missing-one', description: 'D', content: 'B', root });
  assert.equal(missing.ok, false);
  assert.match(missing.error.message, /找不到可编辑/);
});

await check('Disabling renames the entry point and reverses cleanly', async (t) => {
  const { host, file, root, seed } = await hostWith();
  t.after(() => host.close());
  seed('toggle-me');
  const off = await host.rpc('skills.set-enabled', { name: 'toggle-me', root, enabled: false });
  assert.equal(off.value.changed, true);
  assert.equal(existsSync(file('toggle-me')), false, 'The entry point is renamed, never unlinked');
  assert.equal(existsSync(file('toggle-me') + '.disabled'), true);
  const listed = (await host.rpc('skills.list')).value;
  assert.deepEqual(listed.skills, [], 'A hidden skill leaves the catalog');
  assert.deepEqual(listed.disabled.map((entry) => [entry.name, entry.rootPath, entry.description]),
    [['toggle-me', root, 'Fixture']], 'The hidden skill is still addressable');
  const repeated = await host.rpc('skills.set-enabled', { name: 'toggle-me', root, enabled: false });
  assert.equal(repeated.value.changed, false, 'Repeating a state rewrites nothing');
  const on = await host.rpc('skills.set-enabled', { name: 'toggle-me', root, enabled: true });
  assert.equal(on.value.changed, true);
  assert.equal(existsSync(file('toggle-me')), true);
  assert.deepEqual((await host.rpc('skills.list')).value.disabled, []);
});

await check('Deleting moves the skill aside instead of erasing it', async (t) => {
  const { host, root, seed } = await hostWith();
  t.after(() => host.close());
  seed('drop-me', { content: 'Recoverable body' });
  const saved = await host.rpc('skills.remove', { name: 'drop-me', root });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(existsSync(join(root, 'drop-me')), false);
  assert.match(saved.value.trashed, /\.trash[/\\]skills[/\\]drop-me-/);
  assert.equal(readFileSync(join(saved.value.trashed, 'SKILL.md'), 'utf8').includes('Recoverable body'), true);
  const missing = await host.rpc('skills.remove', { name: 'drop-me', root });
  assert.equal(missing.ok, false);
  assert.match(missing.error.message, /找不到/);
});

await check('A hidden skill is still addressable, restorable and deletable', async (t) => {
  const { host, root, seed } = await hostWith();
  t.after(() => host.close());
  seed('hidden-me');
  await host.rpc('skills.set-enabled', { name: 'hidden-me', root, enabled: false });
  const entry = (await host.rpc('skills.list')).value.disabled[0];
  assert.equal(entry.rootPath, root);
  assert.equal(existsSync(entry.path), true);
  const removed = await host.rpc('skills.remove', { name: entry.name, root: entry.rootPath });
  assert.equal(removed.ok, true, JSON.stringify(removed));
  assert.deepEqual((await host.rpc('skills.list')).value.disabled, []);
});

await check('A skill file outside every writable root cannot be written or addressed', async (t) => {
  const { host, root } = await hostWith();
  t.after(() => host.close());
  const outside = await host.rpc('skills.save', { mode: 'create', name: 'stray', description: 'D', content: 'B', root: '/tmp' });
  assert.equal(outside.ok, false);
  assert.match(outside.error.message, /未知的 Skill 目录/);
  const noRoot = await host.rpc('skills.save', { mode: 'create', name: 'stray', description: 'D', content: 'B' });
  assert.equal(noRoot.ok, false);
  assert.match(noRoot.error.message, /目录/);
  const revealed = await host.rpc('skills.reveal', { path: '/etc/passwd' });
  assert.equal(revealed.ok, false);
  assert.match(revealed.error.message, /Skill 目录内/);
  const traversal = await host.rpc('skills.reveal', { path: join(root, '..', '..', 'elsewhere') });
  assert.equal(traversal.ok, false, 'A path that escapes the root is refused');
});

await check('An unverified runtime blocks every skill file write', async (t) => {
  const previous = runtimeFixture.version;
  runtimeFixture.version = '0.2.1-alpha.4';
  t.after(() => { runtimeFixture.version = previous; });
  const { host, root } = await hostWith();
  t.after(() => host.close());
  assert.equal((await host.rpc('compatibility.status')).value.writes.skillFiles, false);
  const created = await host.rpc('skills.save', { mode: 'create', name: 'blocked', description: 'D', content: 'B', root });
  assert.equal(created.ok, false);
  assert.equal(created.error.code, 'MCP_SKILL_MANAGER_INCOMPATIBLE');
  assert.deepEqual(readdirSync(root), []);
});

await check('Skill file writes need an owner session', async (t) => {
  const { host, root } = await hostWith({ admitDenied: true });
  t.after(() => host.close());
  const created = await host.rpc('skills.save', { mode: 'create', name: 'denied', description: 'D', content: 'B', root });
  assert.equal(created.error.code, 'MCP_SKILL_MANAGER_FORBIDDEN');
  assert.deepEqual(readdirSync(root), []);
});

// ---------------------------------------------------------------------------
// The page.
// ---------------------------------------------------------------------------

/** Switch state by name, so an unspecified directory order cannot fail a test. */
const switchState = (ui) => ui.switches().map(({ tool, allowed }) => [tool, allowed]).sort(([a], [b]) => a.localeCompare(b));

await check('The skill list filters, reports a hidden row, and explains a shadowed name', async (t) => {
  const { host, root, seed } = await hostWith();
  t.after(() => host.close());
  seed('alpha-skill', { description: 'First skill', content: 'Alpha body' });
  seed('beta-skill', { description: 'Second skill', content: 'Beta body' });
  await host.rpc('skills.set-enabled', { name: 'beta-skill', root, enabled: false });
  const ui = await page(t, host);
  await ui.click('Skills');
  assert.match(ui.content(), /alpha-skill/);
  assert.match(ui.content(), /beta-skill/);
  assert.deepEqual(switchState(ui), [['alpha-skill', true], ['beta-skill', false]]);
  assert.equal(ui.offRows().length, 1, 'The hidden skill is dimmed, not missing');
  await ui.fill({ 搜索: 'beta' });
  assert.doesNotMatch(ui.content(), /alpha-skill/);
  await ui.fill({ 搜索: 'nothing matches this' });
  assert.match(ui.content(), /没有匹配的 Skill/);
  await ui.fill({ 搜索: '' });
  await ui.click('查看正文');
  assert.match(ui.content(), /Alpha body/);
  assert.equal(ui.logged.length, 0);
});

await check('The switch hides and restores a skill file', async (t) => {
  const { host, file, seed } = await hostWith();
  t.after(() => host.close());
  seed('toggle-me');
  const ui = await page(t, host);
  await ui.click('Skills');
  await ui.toggleSwitch('toggle-me');
  const [sent] = ui.mutations().filter(({ method }) => method === 'skills.set-enabled');
  assert.ok(sent, 'skills.set-enabled must be sent');
  assert.equal(sent.args.name, 'toggle-me');
  assert.equal(sent.args.enabled, false);
  assert.match(ui.statuses().join(' '), /已停用/);
  assert.equal(existsSync(file('toggle-me') + '.disabled'), true);
  assert.deepEqual(switchState(ui), [['toggle-me', false]], 'The row survives so it can be restored');
  assert.equal(ui.offRows().length, 1);
});

await check('The path row reveals the file and copies it', async (t) => {
  const { host, file, seed } = await hostWith();
  t.after(() => host.close());
  seed('reveal-me');
  const ui = await page(t, host, {
    // The reveal would otherwise launch the OS file manager for real.
    intercept: (method) => (method === 'skills.reveal' ? { ok: true, value: { action: 'reveal' } } : undefined),
  });
  await ui.click('Skills');
  const target = file('reveal-me');
  assert.deepEqual(ui.pathButtons().map(({ path }) => path), [target]);
  assert.equal(ui.pathButtons()[0].title, '在访达中显示');
  await ui.reveal(target);
  const [sent] = ui.requests.filter(({ method }) => method === 'skills.reveal');
  assert.ok(sent, 'skills.reveal must be sent');
  assert.equal(sent.args.path, target);
  assert.deepEqual(ui.logged, []);
});

await check('Creating a skill from the page sends the root the catalog offered', async (t) => {
  const { host, file, root } = await hostWith();
  t.after(() => host.close());
  const ui = await page(t, host);
  await ui.click('Skills');
  await ui.click('新建 Skill');
  await ui.fill({ 名称: 'ui-skill', 描述: 'From the page', 正文: 'Body from the page' });
  await ui.submit('新建 Skill');
  const [sent] = ui.mutations().filter(({ method }) => method === 'skills.save');
  assert.ok(sent, 'skills.save must be sent');
  assert.equal(sent.args.mode, 'create');
  assert.equal(sent.args.name, 'ui-skill');
  assert.equal(sent.args.root, root);
  assert.equal(sent.args.modelInvocable, true);
  assert.equal(sent.args.userInvocable, true);
  assert.match(ui.statuses().join(' '), /已创建/);
  assert.equal(parseSkillText(readFileSync(file('ui-skill'), 'utf8')).data.description, 'From the page');
  assert.equal(ui.logged.length, 0);
});

await check('The page refuses a non-kebab-case name without calling the Host', async (t) => {
  const { host } = await hostWith();
  t.after(() => host.close());
  const ui = await page(t, host);
  await ui.click('Skills');
  await ui.click('新建 Skill');
  await ui.fill({ 名称: 'Bad Name', 描述: 'D', 正文: 'B' });
  await ui.submit('新建 Skill');
  assert.deepEqual(ui.mutations(), []);
  assert.match(ui.alerts().join(' '), /小写字母/);
});

await check('Editing from the page loads the stored body before it is saved', async (t) => {
  const { host, root, seed } = await hostWith();
  t.after(() => host.close());
  seed('load-me', { description: 'Stored description', content: 'Stored body' });
  const ui = await page(t, host);
  await ui.click('Skills');
  assert.equal(ui.field('正文'), undefined, 'No body is read until an edit is opened');
  await ui.click('编辑');
  assert.equal(ui.field('正文').props.value, 'Stored body');
  assert.equal(ui.field('描述').props.value, 'Stored description');
  await ui.fill({ 描述: 'Changed' });
  await ui.submit('编辑 Skill');
  const [sent] = ui.mutations().filter(({ method }) => method === 'skills.save');
  assert.equal(sent.args.mode, 'edit');
  assert.equal(sent.args.name, 'load-me');
  assert.equal(sent.args.root, root);
  assert.equal(sent.args.description, 'Changed');
  assert.equal(sent.args.content, 'Stored body', 'An untouched body is sent back unchanged');
  assert.match(ui.statuses().join(' '), /已保存/);
});

await check('Deleting a skill file asks once, then moves it to the trash', async (t) => {
  const { host, root, seed } = await hostWith();
  t.after(() => host.close());
  seed('bye-skill');
  const ui = await page(t, host);
  await ui.click('Skills');
  await ui.click('删除');
  assert.equal(ui.mutations().length, 0, 'The first click only asks for confirmation');
  await ui.click('确认删除');
  const [sent] = ui.mutations();
  assert.equal(sent.method, 'skills.remove');
  assert.equal(sent.args.name, 'bye-skill');
  assert.equal(sent.args.root, root);
  assert.equal(existsSync(join(root, 'bye-skill')), false);
  assert.match(ui.statuses().join(' '), /回收目录/);
});

await check('A read-only runtime offers no skill file actions', async (t) => {
  const previous = runtimeFixture.version;
  runtimeFixture.version = '0.2.1-alpha.4';
  t.after(() => { runtimeFixture.version = previous; });
  const { host, seed } = await hostWith();
  t.after(() => host.close());
  seed('locked-skill');
  const ui = await page(t, host);
  await ui.click('Skills');
  assert.equal(ui.button('新建 Skill').props.disabled, true);
  assert.deepEqual(ui.switches(), []);
  assert.equal(ui.pathButtons().length, 0, 'A path is only offered when writes are live');
  assert.equal(ui.mutations().length, 0);
});
