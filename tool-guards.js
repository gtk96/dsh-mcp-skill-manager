/**
 * Per-tool call guard for MCP tools.
 *
 * The official bridge (`@deepseek-ai/dsh-mcp-client`) registers every tool a server advertises and its
 * config exposes no allow/deny list, so a tool cannot be removed from the model's catalog here. The
 * harness does expose `ctx.tools.guard(fn)`, which runs before every call and denies it by returning a
 * reason — that is the only hook this plugin may own without replacing the official bridge.
 *
 * The deny list lives beside the profile, not in `cordis.patch.yml`: writing the patch reconciles the
 * Loader, which would reload this plugin (and the page) on every toggle. A dot-directory in the profile
 * is not watched by HMR and cannot compose into the Loader, so it stays a private runtime policy.
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { writeTextAtomic } from './mcp-write.js';

export class ToolGuardError extends Error {}

/** `publicToolName()` output: `mcp__<serverName>__<rawName>` with both sides normalized by the bridge. */
export const toolNamePattern = /^mcp__[A-Za-z0-9_-]{1,32}__[A-Za-z0-9_-]{1,128}$/;

/** Model-facing denial. It must say both what happened and what not to do next. */
function denialReason(toolName) {
  return `Tool "${toolName}" is disabled for calls by the user (DSH Settings > MCP & Skills). `
    + 'Do not retry it; if the task requires it, ask the user to re-enable it.';
}

/** `<profile>/.mcp-skill-manager/tool-guards.json`, or undefined when the runtime has no writable profile. */
function statePath(ctx) {
  const dir = ctx.get('profileContext')?.dir;
  return typeof dir === 'string' && dir ? join(dir, '.mcp-skill-manager', 'tool-guards.json') : undefined;
}

function parseState(ctx, filename) {
  if (filename === undefined) return new Set();
  let text;
  try {
    text = readFileSync(filename, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return new Set();
    ctx.logger?.warn?.(`mcp-skill-manager: cannot read ${filename}: ${String(error)}`);
    return new Set();
  }
  try {
    const parsed = JSON.parse(text);
    const listed = Array.isArray(parsed?.disabled) ? parsed.disabled : [];
    // A hand-edited file may carry anything; only names this plugin could have written are honored.
    return new Set(listed.filter((name) => typeof name === 'string' && toolNamePattern.test(name)));
  } catch {
    ctx.logger?.warn?.(`mcp-skill-manager: ${filename} is not valid JSON; starting with no guarded tools`);
    return new Set();
  }
}

function normalizeToolName(value) {
  if (typeof value !== 'string' || !value.trim()) throw new ToolGuardError('需要指定工具名。');
  const name = value.trim();
  if (!toolNamePattern.test(name)) throw new ToolGuardError('只能停用 MCP 工具；工具名形如 mcp__server__tool。');
  return name;
}

/**
 * @param {object} ctx Host context.
 * @param {object} compatibility Write gate.
 * @param {{ filename?: string }} [overrides] Test seams.
 */
export function createToolGuards(ctx, compatibility, { filename } = {}) {
  const filename_ = filename ?? statePath(ctx);
  const disabled = parseState(ctx, filename_);

  /** Whether the call guard would deny this public tool name. */
  function has(toolName) {
    return typeof toolName === 'string' && disabled.has(toolName);
  }

  /** The denial string for a guarded tool, or undefined to let the call run. */
  function reason(toolName) {
    return has(toolName) ? denialReason(toolName) : undefined;
  }

  /** Persist the set; a runtime without a profile directory keeps it in memory only. */
  async function persist() {
    if (filename_ === undefined) return false;
    mkdirSync(dirname(filename_), { recursive: true });
    await writeTextAtomic(filename_, JSON.stringify({ version: 1, disabled: [...disabled].sort() }, null, 2) + '\n');
    return true;
  }

  /**
   * Guard or unguard one tool. Unchanging input is a no-op so a double click cannot rewrite the file.
   * @param {{ toolName: string, disabled: boolean }} args
   * @param {{ signal: AbortSignal }} exec
   */
  async function set(args, exec) {
    await compatibility.assertWrite('guards', exec.signal);
    const toolName = normalizeToolName(args.toolName);
    if (typeof args.disabled !== 'boolean') throw new ToolGuardError('disabled 必须是布尔值。');
    if (disabled.has(toolName) === args.disabled) {
      return { changed: false, toolName, disabled: args.disabled, persisted: filename_ !== undefined };
    }
    exec.signal.throwIfAborted();
    if (args.disabled) disabled.add(toolName);
    else disabled.delete(toolName);
    try {
      const persisted = await persist();
      return { changed: true, toolName, disabled: args.disabled, persisted };
    } catch (error) {
      // Keep memory and disk in agreement: a failed save must not leave a guard the next start forgets.
      if (args.disabled) disabled.delete(toolName);
      else disabled.add(toolName);
      throw new ToolGuardError(`停用状态未能保存：${error?.message ?? error}`);
    }
  }

  return {
    has,
    reason,
    set,
    names: () => [...disabled].sort(),
    path: () => filename_,
  };
}
