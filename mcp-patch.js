/**
 * Comment-preserving edits to the profile's `cordis.patch.yml`.
 *
 * The file is the only persistent place a profile can add or disable a Loader entry, and official code
 * (`plugin-manager/src/patch.ts`, `config-editor`) rewrites it in place. This module mirrors those edits:
 * the YAML document keeps its comments and `!!js` scalars, and every mutation is a pure function over a
 * parsed document so the same rules can be tested without a profile.
 *
 * Only the top-level patch array is addressed. Rows nested inside a `group` are owned by that group and
 * are not server entries the settings page can create or remove.
 */

import { isMap, isScalar, isSeq, parseDocument, Scalar } from 'yaml';

/** The official MCP bridge; one Loader entry is one server. */
export const MCP_CLIENT = '@deepseek-ai/dsh-mcp-client';

/** YAML tag the include dialect uses for expressions. Values stay verbatim; this module never evaluates them. */
const jsTag = { tag: 'tag:yaml.org,2002:js', resolve: (value) => value };

export class PatchError extends Error {}

/**
 * Parse a profile patch file.
 * @param {string} text File contents; an empty file is a valid empty patch list.
 * @param {string} [filename] Diagnostic label.
 * @returns The parsed YAML document, whose contents are always a sequence.
 */
export function parsePatch(text, filename = 'cordis.patch.yml') {
  const document = parseDocument(text, { customTags: [jsTag] });
  const error = document.errors[0];
  if (error !== undefined) throw new PatchError(`${filename}: ${error.message}`);
  if (document.contents === null) document.contents = document.createNode([]);
  if (!isSeq(document.contents)) throw new PatchError(`${filename}: patch 必须是顶层 YAML 数组`);
  return document;
}

/**
 * Render a parsed patch document back to text.
 * @param {import('yaml').Document} document Parsed document.
 * @returns File contents with block style and original comments.
 */
export function renderPatch(document) {
  document.contents.flow = false;
  return String(document);
}

/** Index of the last top-level row that names this entry, optionally matching the module name. */
function findRowIndex(document, entryId, name) {
  const items = document.contents.items;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const row = items[index];
    if (!isMap(row) || document.getIn([index, 'id']) !== entryId) continue;
    if (name !== undefined) {
      const rowName = document.getIn([index, 'name']);
      if (rowName !== undefined && rowName !== name) continue;
    }
    return index;
  }
  return -1;
}

/**
 * Locate an entry inserted by this patch file.
 * @param {import('yaml').Document} document Parsed document.
 * @param {string} entryId Entry id.
 * @returns {{ blockIndex: number, rowIndex: number } | undefined} Positions, or undefined when not inserted here.
 */
export function findInsertRow(document, entryId) {
  const items = document.contents.items;
  for (let blockIndex = 0; blockIndex < items.length; blockIndex += 1) {
    const block = items[blockIndex];
    if (!isMap(block)) continue;
    const insert = block.get('insert', true);
    if (!isSeq(insert)) continue;
    for (let rowIndex = 0; rowIndex < insert.items.length; rowIndex += 1) {
      const row = insert.items[rowIndex];
      if (isMap(row) && row.get('id') === entryId) return { blockIndex, rowIndex };
    }
  }
  return undefined;
}

/**
 * List every entry id this patch file inserts.
 * @param {import('yaml').Document} document Parsed document.
 * @returns {Set<string>} Inserted ids.
 */
export function insertIds(document) {
  const ids = new Set();
  for (const block of document.contents.items) {
    if (!isMap(block)) continue;
    const insert = block.get('insert', true);
    if (!isSeq(insert)) continue;
    for (const row of insert.items) {
      if (isMap(row) && typeof row.get('id') === 'string') ids.add(row.get('id'));
    }
  }
  return ids;
}

/**
 * Append one server row to the last insert block, creating the block when the file has none.
 * @param {import('yaml').Document} document Parsed document.
 * @param {{ id: string, name: string, config: object }} row Row to append.
 * @returns {number} Index of the block that received the row.
 */
export function insertServerRow(document, row) {
  const items = document.contents.items;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const block = items[index];
    if (!isMap(block)) continue;
    const insert = block.get('insert', true);
    if (!isSeq(insert)) continue;
    insert.add(document.createNode(row));
    return index;
  }
  document.add(document.createNode({ insert: [row] }));
  return items.length - 1;
}

/**
 * Move a removed row's leading comment onto the following node, matching official patch edits.
 * A comment above the first row can be the file header, so it must survive the removal.
 */
function carryComment(document, index, comment) {
  if (!comment) return;
  const items = document.contents.items;
  const next = items[index];
  if (next !== undefined && next !== null && typeof next === 'object') {
    next.commentBefore = next.commentBefore ? `${comment}\n${next.commentBefore}` : comment;
  } else if (items.length === 0) {
    document.contents.commentBefore = comment;
  } else {
    document.comment = document.comment ? `${comment}\n${document.comment}` : comment;
  }
}

/**
 * Remove an entry this patch file inserted.
 * @param {import('yaml').Document} document Parsed document.
 * @param {string} entryId Entry id.
 * @returns {boolean} Whether an inserted row was removed.
 */
export function removeInsertRow(document, entryId) {
  const found = findInsertRow(document, entryId);
  if (found === undefined) return false;
  const block = document.contents.items[found.blockIndex];
  const insert = block.get('insert', true);
  insert.deleteIn([found.rowIndex]);
  if (insert.items.length === 0) {
    const comment = block.commentBefore;
    document.deleteIn([found.blockIndex]);
    carryComment(document, found.blockIndex, comment);
  }
  return true;
}

/**
 * Find the profile override row for an entry.
 * @param {import('yaml').Document} document Parsed document.
 * @param {string} entryId Entry id.
 * @param {string} [name] Module name; a row without one matches any.
 * @returns {number} Row index, or -1.
 */
function findOverrideRow(document, entryId, name) {
  const items = document.contents.items;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const row = items[index];
    if (!isMap(row) || row.has('insert') || document.getIn([index, 'id']) !== entryId) continue;
    const rowName = document.getIn([index, 'name']);
    if (name !== undefined && rowName !== undefined && rowName !== name) continue;
    return index;
  }
  return -1;
}

/**
 * Write `disabled` on the entry's override row, appending one when the file has none.
 * A `!!js` value never compares equal, so its row is rewritten rather than trusted.
 * @param {import('yaml').Document} document Parsed document.
 * @param {{ id: string, name: string, disabled: boolean }} override Override to store.
 * @returns {boolean} Whether the document changed.
 */
export function setDisabled(document, override) {
  const index = findOverrideRow(document, override.id, override.name);
  if (index < 0) {
    document.add(document.createNode({ id: override.id, name: override.name, disabled: override.disabled }));
    return true;
  }
  const current = document.contents.items[index].get('disabled', true);
  if (isScalar(current) && !current.tag && current.value === override.disabled) return false;
  document.setIn([index, 'disabled'], override.disabled);
  return true;
}

/**
 * Delete every override row for an entry, leaving its inherited definition alone.
 * A row that only carried `disabled` disappears; a row that also carries `config` keeps it.
 * @param {import('yaml').Document} document Parsed document.
 * @param {string} entryId Entry id.
 * @param {string} name Module name.
 * @returns {boolean} Whether anything was removed.
 */
export function removeOverride(document, entryId, name) {
  const matches = [];
  for (let index = document.contents.items.length - 1; index >= 0; index -= 1) {
    const row = document.contents.items[index];
    if (!isMap(row) || row.has('insert')) continue;
    if (document.getIn([index, 'id']) !== entryId) continue;
    const rowName = document.getIn([index, 'name']);
    if (rowName !== undefined && rowName !== name) continue;
    matches.push(index);
  }
  let changed = false;
  // Deleting a row shifts the indices after it, so removal runs from the highest index down.
  for (const index of matches) {
    const row = document.contents.items[index];
    const comment = row.commentBefore;
    if (row.has('disabled')) {
      row.delete('disabled');
      changed = true;
    }
    const onlyIdentity = row.items.every((pair) => isScalar(pair.key)
      && (pair.key.value === 'id' || pair.key.value === 'name'));
    if (!onlyIdentity) continue;
    document.deleteIn([index]);
    carryComment(document, index, comment);
    changed = true;
  }
  return changed;
}
