/**
 * Read model for the MCP page.
 *
 * Every server is one `@deepseek-ai/dsh-mcp-client` Loader entry. Entries come from `ctx.loader.entries()`
 * so disabled rows stay visible; `ctx.configEditor.configuration()` supplies which layer owns the current
 * definition. Tools are grouped by the documented `mcp__<serverName>__<tool>` prefix — prefix matching is
 * evidence of naming, not of provenance, so the page never claims a tool came from a server.
 */

import { readFileSync } from 'node:fs';

import { MCP_CLIENT, describeConfig, isMcpEntry, transportOf } from './mcp-config.js';
import { insertIds, parsePatch } from './mcp-patch.js';

export { MCP_CLIENT };

export class DiscoveryError extends Error {}

/** The line shown under a server name; credentials in a URL's userinfo never reach the page. */
function summarize(config, transport) {
  if (transport === 'stdio') {
    const command = typeof config?.command === 'string' ? config.command : '';
    const args = Array.isArray(config?.args) ? config.args.filter((arg) => typeof arg === 'string') : [];
    return [command, ...args].join(' ').trim() || '—';
  }
  if (typeof config?.url !== 'string') return '—';
  try {
    const url = new URL(config.url);
    if (url.username || url.password) {
      url.username = '';
      url.password = '';
    }
    return url.toString();
  } catch {
    // An unparsable URL is shown verbatim; it cannot carry a parsed userinfo section.
    return config.url;
  }
}

export function createDiscovery(ctx, toolGuards) {
  const optional = (name) => ctx.get(name);

  /** Ids this profile's own patch file inserts. */
  function profilePatchFacts() {
    const filename = optional('profileContext')?.patchPath;
    if (typeof filename !== 'string') return new Set();
    try {
      return insertIds(parsePatch(readFileSync(filename, 'utf8'), filename));
    } catch {
      // An unreadable patch file is reported by the write path; the page still lists live entries.
      return new Set();
    }
  }

  /**
   * Rows the official editor can address. `configEditor.configuration()` only returns entries whose
   * profile patch id is unique and whose parent tree belongs to the root Include, so editing anything
   * outside it would fail at write time.
   */
  function addressableRows() {
    const editor = optional('configEditor');
    if (typeof editor?.configuration !== 'function') return new Map();
    const rows = new Map();
    for (const row of editor.configuration()) {
      if (row?.entry !== undefined) rows.set(row.entry, row);
    }
    return rows;
  }

  /** Tool names visible to the calling scope; an unreadable registry is reported, never treated as empty. */
  function toolNames(agent) {
    const presets = optional('agentPresets');
    const scoped = (agent && presets?.serviceFor(agent, 'tools')) || optional('tools');
    if (typeof scoped?.schemas !== 'function') return { names: [], available: false };
    return { names: scoped.schemas(agent).map(({ name }) => name), available: true };
  }

  function entries() {
    const inserted = profilePatchFacts();
    const addressable = addressableRows();
    const rows = [];
    for (const entry of ctx.loader.entries()) {
      if (!isMcpEntry(entry) || entry.options.group) continue;
      const config = entry.options.config ?? {};
      const transport = transportOf(config);
      const disabled = entry.disabled === true;
      const loaded = entry.fiber !== undefined && entry.fiber.state === 2;
      const row = addressable.get(entry);
      rows.push({
        entryId: entry.options.id,
        serverName: typeof config.serverName === 'string' ? config.serverName : null,
        transport,
        summary: summarize(config, transport),
        source: inserted.has(entry.options.id) ? 'profile' : 'bundle',
        // Only a row this profile's patch file inserts can be deleted; anything else can only be disabled.
        removable: inserted.has(entry.options.id),
        disabled,
        loadFailed: entry.fiber?.state === 3,
        editable: row !== undefined && !disabled && loaded,
        editableReason: row === undefined ? 'unaddressable' : disabled ? 'disabled' : !loaded ? 'unloaded' : null,
        // The override is what a reset would drop; an inserted row has no inherited definition to return to.
        overridden: row !== undefined && Object.keys(row.override ?? {}).length > 0,
        config: describeConfig(config),
      });
    }
    const counts = new Map();
    for (const row of rows) counts.set(row.entryId, (counts.get(row.entryId) ?? 0) + 1);
    for (const row of rows) {
      if (counts.get(row.entryId) > 1) {
        row.editable = false;
        row.editableReason = 'duplicate';
        row.removable = false;
      }
    }
    rows.sort((left, right) => (left.serverName ?? left.entryId).localeCompare(right.serverName ?? right.entryId));
    return rows;
  }

  /**
   * Build the page model.
   * @param {{ agent?: object }} [target] Calling scope for tool visibility; the profile when omitted.
   * @returns The server rows and the tool grouping derived from the calling scope.
   */
  function mcp(target = {}) {
    const servers = entries();
    const { names, available } = toolNames(target.agent);
    const candidates = names.filter((name) => name.startsWith('mcp__'));
    const counts = new Map();
    for (const server of servers) {
      if (server.serverName) counts.set(server.serverName, (counts.get(server.serverName) ?? 0) + 1);
    }
    const listed = [];
    for (const server of servers) {
      const unique = server.serverName !== null && counts.get(server.serverName) === 1;
      const prefix = unique ? `mcp__${server.serverName}__` : undefined;
      server.tools = prefix === undefined ? [] : candidates.filter((name) => name.startsWith(prefix));
      server.toolCount = server.tools.length;
      // A server that returns no tools while its siblings do is the only symptom the bridge exposes.
      server.empty = available && !server.disabled && server.serverName !== null && unique && server.tools.length === 0;
      server.guardedCount = server.tools.filter((name) => toolGuards?.has(name) === true).length;
      listed.push(...server.tools);
    }
    const grouped = new Set(listed);
    return {
      toolsAvailable: available,
      servers,
      // Public names whose calls the guard denies; the page marks the matching rows.
      guardedTools: toolGuards?.names() ?? [],
      ungrouped: candidates.filter((name) => !grouped.has(name)),
      duplicateServerNames: [...counts].filter(([, count]) => count > 1).map(([serverName]) => serverName),
    };
  }

  return { mcp, entries, serviceFor: (serviceName, agent) => {
    const presets = optional('agentPresets');
    return (agent && presets?.serviceFor(agent, serviceName)) || optional(serviceName);
  } };
}
