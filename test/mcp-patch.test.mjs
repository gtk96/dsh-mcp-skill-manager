import assert from 'node:assert/strict';
import { check } from './regression.test.mjs';
import {
  insertIds,
  insertServerRow,
  parsePatch,
  removeInsertRow,
  removeOverride,
  renderPatch,
  setDisabled,
} from './mcp-patch.js';

const HEADER = `# Profile patch: this header must survive every edit.
- insert:
    - id: mcp-files
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: files
        command: !!js process.cwd()
        args: []
`;

const row = { id: 'mcp-new', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'new', transport: 'stdio', command: 'npx', args: ['-y'] } };

await check('An empty patch file parses as an empty sequence', () => {
  const document = parsePatch('');
  assert.deepEqual(document.toJS(), []);
  assert.equal(renderPatch(document).trim(), '[]');
});

await check('Parsing and rendering keep comments and !!js expressions verbatim', () => {
  const document = parsePatch(HEADER);
  const text = renderPatch(document);
  assert.match(text, /# Profile patch: this header must survive every edit\./);
  assert.match(text, /command: !!js process\.cwd\(\)/);
  assert.deepEqual(document.toJS()[0].insert[0].config.args, []);
});

await check('A new server appends to the last insert block and keeps existing rows', () => {
  const document = parsePatch(HEADER);
  const blockIndex = insertServerRow(document, row);
  assert.equal(blockIndex, 0);
  const rows = document.toJS()[0].insert;
  assert.equal(rows.length, 2);
  assert.equal(rows[1].id, 'mcp-new');
  assert.equal(rows[1].config.serverName, 'new');
  assert.deepEqual(insertIds(document), new Set(['mcp-files', 'mcp-new']));
  assert.match(renderPatch(document), /!!js process\.cwd\(\)/);
});

await check('A file without an insert block gains one', () => {
  const document = parsePatch('# only comments\n[]\n');
  insertServerRow(document, row);
  const blocks = document.toJS();
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].insert[0].id, 'mcp-new');
});

await check('Removing the only inserted row drops the block and keeps the file header', () => {
  const document = parsePatch(HEADER);
  assert.equal(removeInsertRow(document, 'mcp-files'), true);
  assert.equal(removeInsertRow(document, 'absent'), false);
  const text = renderPatch(document);
  assert.equal(document.toJS().length, 0);
  assert.match(text, /# Profile patch: this header must survive every edit\./);
});

await check('Removing one of several inserted rows leaves the block in place', () => {
  const document = parsePatch(HEADER);
  insertServerRow(document, row);
  assert.equal(removeInsertRow(document, 'mcp-new'), true);
  assert.deepEqual(insertIds(document), new Set(['mcp-files']));
  assert.equal(document.toJS()[0].insert.length, 1);
});

await check('Disabling an entry appends an override and is idempotent', () => {
  const document = parsePatch(HEADER);
  assert.equal(setDisabled(document, { id: 'mcp-files', name: '@deepseek-ai/dsh-mcp-client', disabled: true }), true);
  assert.equal(setDisabled(document, { id: 'mcp-files', name: '@deepseek-ai/dsh-mcp-client', disabled: true }), false);
  const blocks = document.toJS();
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[1], { id: 'mcp-files', name: '@deepseek-ai/dsh-mcp-client', disabled: true });
  assert.equal(renderPatch(document).match(/disabled: true/g).length, 1, 'One override row, not two');
});

await check('Re-enabling rewrites the existing override instead of appending another', () => {
  const document = parsePatch(`${HEADER}- id: mcp-files\n  name: '@deepseek-ai/dsh-mcp-client'\n  disabled: true\n`);
  assert.equal(setDisabled(document, { id: 'mcp-files', name: '@deepseek-ai/dsh-mcp-client', disabled: false }), true);
  const blocks = document.toJS();
  assert.equal(blocks.length, 2);
  assert.equal(blocks[1].disabled, false);
});

await check('Removing an override keeps a config row but deletes a switch-only row', () => {
  const withConfig = parsePatch(`${HEADER}- id: mcp-files\n  name: '@deepseek-ai/dsh-mcp-client'\n  disabled: true\n  config:\n    timeout: 5\n`);
  assert.equal(removeOverride(withConfig, 'mcp-files', '@deepseek-ai/dsh-mcp-client'), true);
  const kept = withConfig.toJS()[1];
  assert.equal(kept.disabled, undefined);
  assert.equal(kept.config.timeout, 5);

  const switchOnly = parsePatch(`${HEADER}- id: mcp-files\n  name: '@deepseek-ai/dsh-mcp-client'\n  disabled: true\n`);
  assert.equal(removeOverride(switchOnly, 'mcp-files', '@deepseek-ai/dsh-mcp-client'), true);
  assert.equal(switchOnly.toJS().length, 1);
  assert.equal(removeOverride(switchOnly, 'mcp-files', '@deepseek-ai/dsh-mcp-client'), false);
});
