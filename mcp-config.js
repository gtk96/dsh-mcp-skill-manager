/**
 * Validation and read models for MCP settings edited from the settings page.
 *
 * The Profile patch is the single source of truth: an MCP server is one `@deepseek-ai/dsh-mcp-client`
 * entry, and the Loader applies it. This module never keeps a parallel copy; it validates what the page
 * sends and describes what the page may show.
 */

import { MCP_CLIENT } from './mcp-patch.js';

export { MCP_CLIENT };

export class McpConfigError extends Error {}

/** Official `serverName` contract in `@deepseek-ai/dsh-mcp-client`. */
export const serverNamePattern = /^[A-Za-z0-9_-]{1,32}$/;

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Fields the settings page may change, per transport. `serverName` and `transport` stay fixed. */
const transportFields = {
  stdio: ['command', 'args', 'cwd'],
  'streamable-http': ['url'],
};
const sharedFields = ['toolCallTimeoutMs', 'failOnStartupError', 'maxInstructionBytes'];
const reconnectFields = ['enabled', 'initialDelayMs', 'maxDelayMs', 'maxAttempts'];
const credentialField = { stdio: 'env', 'streamable-http': 'headers' };

export function isMcpEntry(entry) {
  return entry?.options?.name === MCP_CLIENT;
}

export function transportOf(config) {
  return config?.transport === 'stdio' ? 'stdio' : 'streamable-http';
}

/** A `!!js` scalar survives parsing as an expression node the Loader evaluates. */
export function isExpression(value) {
  return record(value) && typeof value.__jsExpr === 'string';
}

function text(value, label, { required = false, max = 8192 } = {}) {
  if (value === undefined) {
    if (required) throw new McpConfigError(`${label} 不能为空。`);
    return undefined;
  }
  if (typeof value !== 'string' || value.includes('\0') || value.length > max) throw new McpConfigError(`${label} 无效。`);
  if (required && !value.trim()) throw new McpConfigError(`${label} 不能为空。`);
  return value;
}

function positiveInt(value, label, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) throw new McpConfigError(`${label} 必须是 ${min}–${max} 的整数。`);
  return value;
}

function boolean(value, label) {
  if (typeof value !== 'boolean') throw new McpConfigError(`${label} 必须是布尔值。`);
  return value;
}

/** `null` removes a stored key; any string replaces it; a `!!js` expression is never rewritten here. */
function mergeCredentialMap(patch, current, label) {
  if (patch === undefined) return undefined;
  if (!record(patch)) throw new McpConfigError(`${label} 必须是对象。`);
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)) throw new McpConfigError(`${label} 的键 ${key} 无效。`);
    if (value === null) {
      delete next[key];
      continue;
    }
    if (typeof value !== 'string' || value.includes('\0')) throw new McpConfigError(`${label}.${key} 的值无效。`);
    next[key] = value;
  }
  return next;
}

/** Credential keys only; values never leave the Host. */
function credentialKeys(config, transport) {
  const field = credentialField[transport];
  const stored = config?.[field];
  return record(stored) ? Object.keys(stored).sort() : [];
}

/** The read model for one entry: every field the page may show, with credential values withheld. */
export function describeConfig(config) {
  const transport = transportOf(config);
  const fields = {};
  for (const field of [...transportFields[transport], ...sharedFields]) {
    const value = config?.[field];
    if (isExpression(value)) fields[field] = { expression: value.__jsExpr };
    else if (value !== undefined) fields[field] = value;
  }
  return {
    serverName: typeof config?.serverName === 'string' ? config.serverName : null,
    transport,
    fields,
    reconnect: record(config?.reconnect) ? { ...config.reconnect } : {},
    credentials: transport === 'stdio' ? 'env' : 'headers',
    credentialKeys: credentialKeys(config, transport),
  };
}

/**
 * Validate a page patch against the entry's fixed transport.
 * @param {object} current Live config; used for defaults the patch only partially addresses.
 * @param {object} patch Fields to change.
 * @returns {object} Only the changed fields, ready to merge over the live config.
 */
export function normalizePatch(current, patch) {
  if (!record(patch)) throw new McpConfigError('需要提供要修改的字段。');
  const transport = transportOf(current);
  const allowed = new Set([...transportFields[transport], ...sharedFields, 'reconnect', credentialField[transport]]);
  for (const key of Object.keys(patch)) {
    if (key === 'serverName' || key === 'transport') throw new McpConfigError(`${key} 不可修改。`);
    if (!allowed.has(key)) throw new McpConfigError(`字段 ${key} 不可通过此页面修改。`);
  }
  const next = {};
  if (transport === 'stdio') {
    if (patch.command !== undefined) next.command = text(patch.command, 'command', { required: true });
    if (patch.args !== undefined) {
      if (!Array.isArray(patch.args) || patch.args.length > 128) throw new McpConfigError('args 必须是字符串数组。');
      next.args = patch.args.map((arg, index) => text(arg, `args[${index}]`));
    }
    if (patch.cwd !== undefined) next.cwd = text(patch.cwd, 'cwd') ?? '';
  } else if (patch.url !== undefined) {
    next.url = text(patch.url, 'url', { required: true });
    if (!/^https?:\/\//.test(next.url)) throw new McpConfigError('url 必须以 http:// 或 https:// 开头。');
  }
  if (patch.toolCallTimeoutMs !== undefined) next.toolCallTimeoutMs = positiveInt(patch.toolCallTimeoutMs, 'toolCallTimeoutMs');
  if (patch.maxInstructionBytes !== undefined) next.maxInstructionBytes = positiveInt(patch.maxInstructionBytes, 'maxInstructionBytes');
  if (patch.failOnStartupError !== undefined) next.failOnStartupError = boolean(patch.failOnStartupError, 'failOnStartupError');
  if (patch.reconnect !== undefined) {
    if (!record(patch.reconnect)) throw new McpConfigError('reconnect 必须是对象。');
    for (const key of Object.keys(patch.reconnect)) {
      if (!reconnectFields.includes(key)) throw new McpConfigError(`reconnect.${key} 不是可用的重连选项。`);
    }
    const reconnect = { ...(record(current?.reconnect) ? current.reconnect : {}) };
    if (patch.reconnect.enabled !== undefined) reconnect.enabled = boolean(patch.reconnect.enabled, 'reconnect.enabled');
    for (const key of ['initialDelayMs', 'maxDelayMs', 'maxAttempts']) {
      if (patch.reconnect[key] !== undefined) reconnect[key] = positiveInt(patch.reconnect[key], `reconnect.${key}`);
    }
    next.reconnect = reconnect;
  }
  const merged = mergeCredentialMap(
    patch[credentialField[transport]],
    record(current?.[credentialField[transport]]) ? current[credentialField[transport]] : {},
    credentialField[transport],
  );
  if (merged !== undefined) next[credentialField[transport]] = merged;
  if (!Object.keys(next).length) throw new McpConfigError('没有任何可应用的修改。');
  return next;
}

/**
 * Validate a new server definition and turn it into a complete Loader config.
 * @param {object} input Fields from the create form.
 * @returns {{ serverName: string, transport: string, config: object }} The id-bearing definition.
 */
export function normalizeNewServer(input) {
  if (!record(input)) throw new McpConfigError('需要提供 Server 定义。');
  const serverName = text(input.serverName, 'serverName', { required: true, max: 32 })?.trim();
  if (typeof serverName !== 'string' || !serverNamePattern.test(serverName)) {
    throw new McpConfigError('serverName 只能包含字母、数字、下划线和连字符，长度 1–32。');
  }
  const transport = input.transport;
  if (transport !== 'stdio' && transport !== 'streamable-http') throw new McpConfigError('transport 必须是 stdio 或 streamable-http。');
  if (input.id !== undefined) throw new McpConfigError('条目 id 由 Host 分配，不能指定。');
  if (input.name !== undefined) throw new McpConfigError('模块名不能指定。');
  const { serverName: _name, transport: _transport, ...rest } = input;
  const config = normalizePatch(
    transport === 'stdio' ? { transport, args: [], env: {}, cwd: '' } : { transport, headers: {} },
    rest,
  );
  return { serverName, transport, config: { serverName, transport, ...config } };
}

/** One MCP entry as the Loader holds it, plus the override layer that may be rewritten. */
export function findEntry(ctx, entryId) {
  if (typeof entryId !== 'string' || !entryId) throw new McpConfigError('选择要修改的 MCP 条目。');
  // Only rows `configEditor` reports are addressable; ids elsewhere would fail inside the official edit.
  const rows = typeof ctx.configEditor.configuration === 'function' ? ctx.configEditor.configuration() : [];
  const matches = rows.filter(({ entry }) => entry?.options?.id === entryId);
  if (matches.length > 1) throw new McpConfigError(`多个配置条目匹配 ${entryId}；请使用唯一的条目 id。`);
  const row = matches[0];
  if (!row) throw new McpConfigError(`没有匹配 ${entryId} 的配置条目。`);
  return row;
}

export function createMcpConfig(ctx, compatibility) {
  /**
   * Rewrite one enabled entry. `configEditor.edit` persists and applies through the Loader path, so a
   * saved change is what makes DSH rebuild that connection.
   */
  async function update(args, exec) {
    await compatibility.assertWrite('mcp', exec.signal);
    const row = findEntry(ctx, args.entryId);
    if (!isMcpEntry(row.entry)) throw new McpConfigError('该条目不是 MCP 客户端配置。');
    if (row.entry.disabled) throw new McpConfigError('该条目的 MCP 客户端当前已禁用；先启用再编辑。');
    if (row.entry.fiber === undefined) throw new McpConfigError('该条目的 MCP 客户端未加载；先启用再编辑。');
    const snapshot = record(row.entry.options?.config) ? row.entry.options.config : {};
    if (typeof snapshot.serverName !== 'string' || !serverNamePattern.test(snapshot.serverName)) {
      throw new McpConfigError('该条目的 serverName 无效，无法安全改写。');
    }
    // Fail early on an unusable patch; the authoritative merge happens again inside the callback.
    normalizePatch(snapshot, args.patch);
    exec.signal.throwIfAborted();
    let applied;
    await ctx.configEditor.edit(row.entry, (live) => {
      exec.signal.throwIfAborted();
      if (!record(live)) throw new McpConfigError('该条目的配置不是对象，无法修改。');
      if (live.serverName !== snapshot.serverName) {
        throw new McpConfigError('该条目的 serverName 在修改期间发生变化，请刷新后重试。');
      }
      // Merge against the live config so untouched keys keep whatever another writer just stored.
      applied = normalizePatch(live, args.patch);
      return { ...live, ...applied };
    });
    return { changed: true, entryId: args.entryId, serverName: snapshot.serverName, fields: Object.keys(applied ?? {}) };
  }

  /** Drop this entry's profile override, returning it to the inherited definition. */
  async function reset(args, exec) {
    await compatibility.assertWrite('mcp', exec.signal);
    const row = findEntry(ctx, args.entryId);
    if (!isMcpEntry(row.entry)) throw new McpConfigError('该条目不是 MCP 客户端配置。');
    if (!record(row.override) || Object.keys(row.override).length === 0) {
      return { changed: false, entryId: args.entryId, serverName: row.entry.options?.config?.serverName ?? null };
    }
    if (row.entry.disabled) throw new McpConfigError('该条目的 MCP 客户端当前已禁用；先启用再重置。');
    exec.signal.throwIfAborted();
    await ctx.configEditor.edit(row.entry, (_live, inherited) => (record(inherited) ? inherited : {}));
    return { changed: true, entryId: args.entryId, serverName: row.entry.options?.config?.serverName ?? null };
  }

  return { update, reset };
}
