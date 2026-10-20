import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { check, fixture, page, tick, MCP_CLIENT } from './regression.test.mjs';

const servers = () => ({
  patch: '[]\n',
  base: [
    {
      id: 'mcp-bundle',
      name: MCP_CLIENT,
      config: { serverName: 'bundled', transport: 'streamable-http', url: 'https://bundle.invalid/mcp' },
      loaded: 'ok',
    },
    {
      id: 'mcp-local',
      name: MCP_CLIENT,
      config: { serverName: 'local', transport: 'stdio', command: 'npx', args: ['-y', 'fixture'], cwd: '', env: { TOKEN: 'stored' } },
      loaded: 'ok',
    },
    {
      id: 'mcp-broken',
      name: MCP_CLIENT,
      config: { serverName: 'broken', transport: 'stdio', command: 'missing' },
      loaded: 'failed',
    },
  ],
  globalTools: [{ name: 'mcp__bundled__query' }],
});

/** Locate the card whose title span is exactly `name`. */
function card(ui, name) {
  const found = ui.renderer.root.findAllByType('article')
    .find((node) => node.findAllByType('span').some((span) => span.children.join('') === name));
  assert.ok(found, 'Expected a card for ' + name);
  return found;
}

/** Click a button inside one card, then let the follow-up reads settle. */
async function cardClick(ui, name, label) {
  const button = card(ui, name).findAllByType('button')
    .find((node) => node.children.filter((child) => typeof child === 'string').join('') === label);
  assert.ok(button, `Expected "${label}" in the ${name} card`);
  assert.equal(!!button.props.disabled, false, `The "${label}" button in the ${name} card must be enabled`);
  await act(async () => { await button.props.onClick(); });
  await ui.flush();
}

const labels = (node) => node.findAllByType('button')
  .map((button) => button.children.filter((child) => typeof child === 'string').join(''))
  .filter(Boolean);

await check('The page lists every server with source, transport and tool count', async (t) => {
  const host = await fixture(servers());
  t.after(() => host.close());
  const ui = await page(t, host);
  const content = ui.content();
  for (const name of ['bundled', 'local', 'broken']) assert.ok(content.includes(name), name);
  assert.match(content, /streamable-http/);
  assert.match(content, /本 Profile/);
  assert.match(content, /上层配置/);
  assert.match(content, /加载失败/);
  assert.equal(ui.mutations().length, 0);
  assert.deepEqual(ui.logged, [], 'Rendering must not log warnings or errors');
});

await check('A configured server with no tools says so instead of looking healthy', async (t) => {
  const host = await fixture(servers());
  t.after(() => host.close());
  const ui = await page(t, host);
  assert.match(ui.content(), /没有返回工具/);
});

await check('A bundled server offers edit and disable but no delete', async (t) => {
  const host = await fixture(servers());
  t.after(() => host.close());
  const ui = await page(t, host);
  // Per-tool call switches are icon-only controls, so the card's text buttons stay the server actions.
  assert.deepEqual(labels(card(ui, 'bundled')), ['编辑', '禁用']);
  assert.deepEqual(labels(card(ui, 'broken')), ['编辑', '禁用'], 'A failed row is still toggleable, never editable');
});

await check('Creating a server sends the full definition and shows the applied notice', async (t) => {
  const host = await fixture(servers());
  t.after(() => host.close());
  const ui = await page(t, host);
  await ui.click('新增 Server');
  await ui.fill({ 名称: 'github', 启动命令: 'npx' });
  await ui.fill({ 参数: '-y\n@modelcontextprotocol/server-github' });
  await ui.submit('新增 MCP Server');
  const [sent] = ui.mutations().filter(({ method }) => method === 'mcp.create');
  assert.ok(sent, 'mcp.create must be sent');
  assert.equal(sent.args.serverName, 'github');
  assert.equal(sent.args.transport, 'stdio');
  assert.equal(sent.args.command, 'npx');
  assert.deepEqual(sent.args.args, ['-y', '@modelcontextprotocol/server-github']);
  assert.match(ui.statuses().join(' '), /已保存并生效/);
  assert.equal(ui.logged.length, 0);
});

await check('A toggle notice joins the outcome without doubling punctuation', async (t) => {
  const host = await fixture(servers());
  t.after(() => host.close());
  const ui = await page(t, host);
  const toggle = ui.button('禁用', card(ui, 'bundled'));
  await act(async () => { toggle.props.onClick(); await ui.flush(); });
  const notice = ui.statuses().join(' ');
  assert.match(notice, /已禁用/);
  assert.equal(notice.includes('。，'), false, 'A full stop must not precede a clause comma');
  assert.equal(/[。.]。/.test(notice), false);
  assert.equal(ui.logged.length, 0);
});

await check('A remote server is validated as a URL before it reaches the Host', async (t) => {
  const host = await fixture(servers());
  t.after(() => host.close());
  const ui = await page(t, host);
  await ui.click('新增 Server');
  await ui.fill({ 名称: 'remote', 传输方式: 'streamable-http' });
  await ui.fill({ 服务地址: 'ftp://example.invalid' });
  await ui.submit('新增 MCP Server');
  assert.equal(ui.mutations().length, 0);
  assert.match(ui.alerts().join(' '), /http/);
  await ui.fill({ 服务地址: 'https://example.invalid/mcp' });
  await ui.submit('新增 MCP Server');
  const [sent] = ui.mutations();
  assert.equal(sent.method, 'mcp.create');
  assert.equal(sent.args.transport, 'streamable-http');
  assert.equal(sent.args.url, 'https://example.invalid/mcp');
});

await check('An invalid name is refused in the page and never reaches the Host', async (t) => {
  const host = await fixture(servers());
  t.after(() => host.close());
  const ui = await page(t, host);
  await ui.click('新增 Server');
  await ui.fill({ 名称: 'bad name', 启动命令: 'npx' });
  await ui.submit('新增 MCP Server');
  assert.equal(ui.mutations().length, 0);
  assert.match(ui.alerts().join(' '), /名称/);
});

await check('Saving an untouched form sends nothing', async (t) => {
  const host = await fixture(servers());
  t.after(() => host.close());
  const ui = await page(t, host);
  await cardClick(ui, 'local', '编辑');
  assert.equal(ui.content().includes('stored'), false, 'A stored credential must never be displayed');
  assert.match(ui.content(), /已设置/);
  await ui.submit('编辑 MCP Server');
  assert.deepEqual(ui.mutations(), []);
  assert.match(ui.statuses().join(' '), /没有需要保存的修改/);
});

await check('Editing the command sends only that field in the patch', async (t) => {
  const host = await fixture(servers());
  t.after(() => host.close());
  const ui = await page(t, host);
  await cardClick(ui, 'local', '编辑');
  await ui.fill({ 启动命令: 'node' });
  await ui.submit('编辑 MCP Server');
  const [sent] = ui.mutations();
  assert.equal(sent.method, 'mcp.update');
  assert.equal(sent.args.entryId, 'mcp-local');
  assert.deepEqual(sent.args.patch, { command: 'node' });
});

await check('A new credential and a removed one travel in one merge map', async (t) => {
  const host = await fixture(servers());
  t.after(() => host.close());
  const ui = await page(t, host);
  await cardClick(ui, 'local', '编辑');
  // "删除" here is the credential row action, not the card action: scope the query to the form.
  const form = ui.renderer.root.findAll((node) => node.type === 'form' && node.props['aria-label'] === '编辑 MCP Server')[0];
  const removeRow = form.findAllByType('button').find((button) => button.children.join('') === '删除');
  assert.ok(removeRow, 'Expected the credential remove action inside the form');
  await act(async () => { await removeRow.props.onClick(); await tick(); });
  const add = form.findAllByType('button').find((button) => button.children.join('') === '添加一项');
  await act(async () => { await add.props.onClick(); await tick(); });
  const fields = ui.renderer.root.findAllByProps({ 'aria-label': '名称 1' });
  assert.equal(fields.length, 1);
  await act(async () => {
    fields[0].props.onChange({ currentTarget: { value: 'EXTRA' } });
  });
  await act(async () => {
    ui.renderer.root.findAllByProps({ 'aria-label': '值 1' })[0].props.onChange({ currentTarget: { value: 'added' } });
  });
  await ui.submit('编辑 MCP Server');
  const [sent] = ui.mutations();
  assert.equal(sent.method, 'mcp.update');
  assert.deepEqual(sent.args.patch, { env: { TOKEN: null, EXTRA: 'added' } });
});

await check('A disabled row cannot be edited and says why', async (t) => {
  const host = await fixture(servers());
  t.after(() => host.close());
  await host.rpc('mcp.set-enabled', { entryId: 'mcp-local', enabled: false });
  const ui = await page(t, host);
  const edit = card(ui, 'local').findAllByType('button')
    .find((button) => button.children.filter((child) => typeof child === 'string').join('') === '编辑');
  assert.equal(edit.props.disabled, true);
  assert.match(String(edit.props.title), /先启用再编辑/);
  assert.ok(labels(card(ui, 'local')).includes('启用'));
});

await check('Deleting asks once and then removes the row', async (t) => {
  const host = await fixture({
    ...servers(),
    patch: "- insert:\n    - id: mcp-temp\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        serverName: temp\n        transport: stdio\n        command: npx\n",
  });
  t.after(() => host.close());
  const ui = await page(t, host);
  await cardClick(ui, 'temp', '删除');
  assert.equal(ui.mutations().length, 0, 'The first click only asks for confirmation');
  await cardClick(ui, 'temp', '确认删除');
  const [sent] = ui.mutations();
  assert.equal(sent.method, 'mcp.remove');
  assert.equal(ui.content().includes('temp'), false);
  assert.match(ui.statuses().join(' '), /已删除/);
});

await check('A restart-required save is labelled as such', async (t) => {
  const host = await fixture({ ...servers(), hmr: false });
  t.after(() => host.close());
  const ui = await page(t, host);
  await ui.click('新增 Server');
  await ui.fill({ 名称: 'later', 传输方式: 'streamable-http' });
  await ui.fill({ 服务地址: 'https://later.invalid/mcp' });
  await ui.submit('新增 MCP Server');
  assert.match(ui.statuses().join(' '), /重启 DSH/);
});

await check('Skills render, open their body, and register through the same page', async (t) => {
  const host = await fixture({
    ...servers(),
    skillRows: { profile: [{ name: 'fixture-skill', description: 'Fixture', content: 'Fixture body', source: 'custom', provider: 'fixture' }] },
  });
  t.after(() => host.close());
  const ui = await page(t, host);
  await ui.click('Skills');
  assert.ok(ui.content().includes('fixture-skill'));
  await ui.click('查看正文');
  assert.ok(ui.content().includes('Fixture body'));
  // Registering a runtime skill is the secondary entry, so it lives behind the details disclosure.
  const runtime = '注册 Runtime Skill（重启后失效）';
  assert.ok(ui.content().includes(runtime));
  await ui.click(runtime);
  await ui.fill({ 名称: 'new-skill', 描述: 'New', 正文: 'New body' });
  await ui.submit(runtime);
  const [sent] = ui.mutations();
  assert.equal(sent.method, 'skills.register');
  assert.equal(sent.args.name, 'new-skill');
  assert.match(ui.statuses().join(' '), /已注册/);
});

await check('An empty catalog shows an empty state, not a blank panel', async (t) => {
  const host = await fixture({ patch: '[]\n' });
  t.after(() => host.close());
  const ui = await page(t, host);
  assert.match(ui.content(), /还没有配置 MCP Server/);
});

await check('An unverified runtime disables writes and shows one details line', async (t) => {
  const host = await fixture(servers());
  t.after(() => host.close());
  const ui = await page(t, host, {
    intercept: (method) => method === 'compatibility.status'
      ? { ok: true, value: { pluginVersion: '0.8.0', runtimeVersion: '0.3.0', versionStatus: 'unverified', testedRuntimeVersions: ['0.2.1-rc.2'], capabilities: { mcpCatalog: true, configEdit: true, runtimeSkills: true, patchWrite: true }, writes: { mcp: false, skills: false }, reason: 'Unverified', checks: 'method-presence-only' } }
      : undefined,
  });
  assert.match(ui.content(), /写入已禁用/);
  assert.equal(ui.button('新增 Server').props.disabled, true);
  assert.equal(ui.mutations().length, 0);
});

await check('Without a locale service the page keeps its built-in Chinese copy', async (t) => {
  const host = await fixture(servers());
  t.after(() => host.close());
  const ui = await page(t, host, { locale: false });
  assert.match(ui.content(), /新增 Server/);
  assert.deepEqual(ui.logged, []);
});

await check('The English dictionary renders English copy', async (t) => {
  const host = await fixture(servers());
  t.after(() => host.close());
  const ui = await page(t, host, { language: 'en' });
  assert.ok(ui.content().includes('Add server'));
  assert.ok(ui.content().includes('Upper layer'));
});

await check('Unmounting with reads still pending logs nothing', async (t) => {
  const host = await fixture(servers());
  t.after(() => host.close());
  const ui = await page(t, host, {
    intercept: (method) => method === 'mcp.discover' ? new Promise(() => {}) : undefined,
  });
  // The harness unmounts in `t.after`; a state update after unmount would log through console.error.
  assert.equal(ui.logged.length, 0);
});
