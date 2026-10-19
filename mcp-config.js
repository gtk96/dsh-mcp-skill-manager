/**
 * Edits the DSH-owned MCP configuration entries in place.
 *
 * The Profile configuration is the single source of truth: an MCP server is one
 * `@deepseek-ai/dsh-mcp-client` entry in that file, and the Loader applies it. This module never
 * keeps a parallel copy and never creates or removes entries — `ctx.configEditor` exposes only
 * `entries`, `configuration` and `edit`, and `edit` alone applies through the normal Loader path
 * (`configEditor` service description). Anything that must add a server belongs in the MCP
 * settings of DSH itself.
 */

export const MCP_CLIENT = '@deepseek-ai/dsh-mcp-client';
/** Replaces a stored credential value in read output; writing it back keeps the stored value. */
export const REDACTED = '[configured]';

export class McpConfigError extends Error {}

const serverNamePattern = /^[A-Za-z0-9_-]{1,32}$/;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Fields the settings page may change, per transport. `serverName` and `transport` stay fixed. */
const transportFields = {
  stdio: ['command', 'args', 'cwd'],
  'streamable-http': ['url'],
};
const sharedFields = ['toolCallTimeoutMs', 'failOnStartupError', 'maxInstructionBytes'];
const reconnectFields = ['enabled', 'initialDelayMs', 'maxDelayMs', 'maxAttempts'];

export function isMcpEntry(entry) {
  return entry?.options?.name === MCP_CLIENT;
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

/** Credential maps are read as names only, so a value never reaches the page. */
function redactMap(value) {
  if (!record(value)) return {};
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, REDACTED]));
}

/** A stored value is preserved unless the page sends a real replacement. */
function mergeMap(patch, current) {
  if (patch === undefined) return current;
  if (!record(patch)) throw new McpConfigError('凭据映射必须是对象。');
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)) throw new McpConfigError(`凭据键 ${key} 无效。`);
    if (value === REDACTED) continue;
    if (typeof value !== 'string' || value.includes('\0')) throw new McpConfigError(`凭据 ${key} 的值无效。`);
    next[key] = value;
  }
  return next;
}

/** The read model for one entry: what may be edited, and the credential names only. */
export function describeConfig(config) {
  const transport = config?.transport === 'stdio' ? 'stdio' : 'streamable-http';
  const fields = {};
  for (const field of [...(transportFields[transport] ?? []), ...sharedFields]) {
    if (config?.[field] !== undefined) fields[field] = config[field];
  }
  return {
    serverName: typeof config?.serverName === 'string' ? config.serverName : null,
    transport,
    fields,
    reconnect: record(config?.reconnect) ? { ...config.reconnect } : {},
    ...(transport === 'stdio' ? { envKeys: Object.keys(redactMap(config?.env)) } : { headerKeys: Object.keys(redactMap(config?.headers)) }),
  };
}

/** Validate a page patch against the entry's fixed transport and the Loader config shape. */
export function normalizePatch(current, patch) {
  if (!record(patch)) throw new McpConfigError('需要提供要修改的字段。');
  const transport = current?.transport === 'stdio' ? 'stdio' : 'streamable-http';
  const allowed = new Set([...(transportFields[transport] ?? []), ...sharedFields, 'reconnect', ...(transport === 'stdio' ? ['env'] : ['headers'])]);
  for (const key of Object.keys(patch)) {
    if (key === 'serverName' || key === 'transport') throw new McpConfigError(`${key} 不可修改；新建 Server 请使用 DSH 的 MCP 设置。`);
    if (!allowed.has(key)) throw new McpConfigError(`字段 ${key} 不可通过此页面修改。`);
  }
  const next = {};
  if (transport === 'stdio') {
    if (patch.command !== undefined) next.command = text(patch.command, 'command', { required: true });
    if (patch.args !== undefined) {
      if (!Array.isArray(patch.args) || patch.args.length > 128) throw new McpConfigError('args 必须是字符串数组。');
      next.args = patch.args.map((arg, index) => text(arg, `args[${index}]`));
    }
    if (patch.cwd !== undefined) next.cwd = text(patch.cwd, 'cwd', { max: 8192 }) ?? '';
  } else if (patch.url !== undefined) {
    next.url = text(patch.url, 'url', { required: true });
    if (!/^https?:\/\//.test(next.url)) throw new McpConfigError('url 必须以 http:// 或 https:// 开头。');
  }
  if (patch.toolCallTimeoutMs !== undefined) next.toolCallTimeoutMs = positiveInt(patch.toolCallTimeoutMs, 'toolCallTimeoutMs');
  if (patch.maxInstructionBytes !== undefined) next.maxInstructionBytes = positiveInt(patch.maxInstructionBytes, 'maxInstructionBytes');
  if (patch.failOnStartupError !== undefined) {
    if (typeof patch.failOnStartupError !== 'boolean') throw new McpConfigError('failOnStartupError 必须是布尔值。');
    next.failOnStartupError = patch.failOnStartupError;
  }
  if (patch.reconnect !== undefined) {
    if (!record(patch.reconnect)) throw new McpConfigError('reconnect 必须是对象。');
    for (const key of Object.keys(patch.reconnect)) {
      if (!reconnectFields.includes(key)) throw new McpConfigError(`reconnect.${key} 不是可用的重连选项。`);
    }
    const reconnect = { ...(record(current?.reconnect) ? current.reconnect : {}) };
    if (patch.reconnect.enabled !== undefined) {
      if (typeof patch.reconnect.enabled !== 'boolean') throw new McpConfigError('reconnect.enabled 必须是布尔值。');
      reconnect.enabled = patch.reconnect.enabled;
    }
    for (const key of ['initialDelayMs', 'maxDelayMs', 'maxAttempts']) {
      if (patch.reconnect[key] !== undefined) reconnect[key] = positiveInt(patch.reconnect[key], `reconnect.${key}`);
    }
    next.reconnect = reconnect;
  }
  if (transport === 'stdio' && patch.env !== undefined) next.env = mergeMap(patch.env, record(current?.env) ? current.env : {});
  if (transport !== 'stdio' && patch.headers !== undefined) next.headers = mergeMap(patch.headers, record(current?.headers) ? current.headers : {});
  if (!Object.keys(next).length) throw new McpConfigError('没有任何可应用的修改。');
  return next;
}

/** One MCP entry, as the Loader holds it plus the override layer that may be rewritten. */
export function findEntry(ctx, entryId) {
  const rows = ctx.configEditor.configuration();
  const matches = rows.filter(({ entry }) => entry?.id === entryId || entry?.options?.id === entryId);
  if (matches.length > 1) throw new McpConfigError(`多个配置条目匹配 ${entryId}；请使用唯一的条目 id。`);
  const row = matches[0];
  if (!row) throw new McpConfigError(`没有匹配 ${entryId} 的配置条目。`);
  return row;
}

export function createMcpConfig(ctx, compatibility) {
  /**
   * Rewrite one MCP entry. `configEditor.edit` persists and applies through the Loader path, so a
   * saved change is what makes DSH rebuild that connection; no parallel connection is kept here.
   */
  async function update(args, exec) {
    await compatibility.assertWrite('mcp', exec.signal, exec.agent);
    if (typeof args.entryId !== 'string' || !args.entryId) throw new McpConfigError('选择要修改的 MCP 条目。');
    const row = findEntry(ctx, args.entryId);
    if (!isMcpEntry(row.entry)) throw new McpConfigError('该条目不是 MCP 客户端配置。');
    if (record(row.inherited) && Object.keys(row.inherited).length) {
      throw new McpConfigError(`条目 ${args.entryId} 的定义来自继承层（${Object.keys(row.inherited).join(', ')}），此处修改会改动其来源层，已拒绝。`);
    }
    const current = record(row.entry.options?.config) ? row.entry.options.config : {};
    if (typeof current.serverName !== 'string' || !serverNamePattern.test(current.serverName)) {
      throw new McpConfigError('该条目的 serverName 无效，无法安全改写。');
    }
    const patch = normalizePatch(current, args.patch);
    exec.signal.throwIfAborted();
    await ctx.configEditor.edit(row.entry, (live) => {
      exec.signal.throwIfAborted();
      if (!record(live)) throw new McpConfigError('该条目的配置不是对象，无法修改。');
      return { ...live, ...patch };
    });
    return { changed: true, entryId: args.entryId, serverName: current.serverName, fields: Object.keys(patch) };
  }

  return { update };
}
