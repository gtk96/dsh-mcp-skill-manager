/**
 * Persist add/remove/disable operations to the active profile's patch file.
 *
 * Official code serializes profile writes the same way: `hmr.runExclusive` first (so an automatic module
 * or configuration reload cannot interleave), then the `<profile>/package.json` file lock, then an atomic
 * rename. This module mirrors that order and falls back to a local implementation of the two atomic-write
 * helpers when the runtime does not publish them, so the plugin still loads.
 *
 * The patch file is written first and reconciled second: a rejected reconciliation restores the previous
 * bytes and reconciles again, because the saved file is what a restart would otherwise apply.
 */

import { readFileSync } from 'node:fs';
import { open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { randomBytes } from 'node:crypto';

import { normalizeNewServer, serverNamePattern } from './mcp-config.js';
import {
  MCP_CLIENT,
  insertServerRow,
  parsePatch,
  removeAllOverrides,
  removeInsertRow,
  removeOverride,
  renderPatch,
  setDisabled,
} from './mcp-patch.js';

export class PatchWriteError extends Error {}

const LOCK_RETRY_INITIAL_MS = 20;
const LOCK_RETRY_MAX_MS = 200;
const DEFAULT_LOCK_WAIT_MS = 10_000;

/** Whether the holder recorded in `<file>.lock` is provably gone. */
function holderExited(record) {
  if (!/^\d+\n$/.test(record)) return false;
  const pid = Number(record.trim());
  if (pid === 0 || pid > 0x7fffffff || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error?.code === 'ESRCH';
  }
}

/** Local `<file>.lock` implementation; same on-disk format as `@deepseek-ai/dsh-atomic-write`. */
async function localWithFileLock(filename, operation, { waitMs = DEFAULT_LOCK_WAIT_MS } = {}) {
  const lockPath = `${filename}.lock`;
  const deadline = Date.now() + waitMs;
  let delay = LOCK_RETRY_INITIAL_MS;
  for (;;) {
    try {
      await writeFile(lockPath, `${process.pid}\n`, { mode: 0o600, flag: 'wx' });
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST' && error?.code !== 'EPERM') throw error;
      try {
        if (holderExited(await readFile(lockPath, 'utf8'))) {
          await rm(lockPath, { force: true });
          continue;
        }
      } catch {
        continue;
      }
    }
    if (Date.now() >= deadline) throw new PatchWriteError(`等待写入锁超时：${lockPath}`);
    await wait(delay);
    delay = Math.min(delay * 2, LOCK_RETRY_MAX_MS);
  }
  try {
    return await operation();
  } finally {
    await rm(lockPath, { force: true });
  }
}

/** Local replacement for `writeFileAtomic`: exclusive temp sibling, then rename. */
async function localWriteFileAtomic(filename, content, { mode = 0o600 } = {}) {
  const temp = `${filename}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    const handle = await open(temp, 'wx', mode);
    try {
      await handle.writeFile(content, 'utf8');
    } finally {
      await handle.close();
    }
    await rename(temp, filename);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

let atomicWriteModule;

/** Load the runtime helper once; a runtime that does not publish it keeps the local fallback. */
async function atomicWrite() {
  if (atomicWriteModule !== undefined) return atomicWriteModule;
  try {
    const module = await import('@deepseek-ai/dsh-atomic-write');
    atomicWriteModule = {
      withFileLock: typeof module.withFileLock === 'function' ? module.withFileLock : localWithFileLock,
      writeFileAtomic: typeof module.writeFileAtomic === 'function' ? module.writeFileAtomic : localWriteFileAtomic,
    };
  } catch {
    atomicWriteModule = { withFileLock: localWithFileLock, writeFileAtomic: localWriteFileAtomic };
  }
  return atomicWriteModule;
}

/**
 * Write one file atomically with the same helper the patch uses; other modules own their own locks.
 * @param {string} filename Target path.
 * @param {string} text Contents.
 */
export async function writeTextAtomic(filename, text) {
  const { writeFileAtomic } = await atomicWrite();
  await writeFileAtomic(filename, text, { mode: 0o600 });
}

function readTextOrEmpty(filename) {
  try {
    return readFileSync(filename, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '[]\n';
    throw error;
  }
}

/** One entry id, unique across every Loader row the profile composes. */
function uniqueId(ctx, serverName) {
  const slug = serverName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'server';
  const base = `mcp-${slug}`.slice(0, 40);
  const used = new Set([...ctx.loader.entries()].map((entry) => entry.options.id));
  if (!used.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Server names already claimed by any composed MCP row, including disabled ones. */
function claimedServerNames(ctx) {
  const names = new Set();
  for (const entry of ctx.loader.entries()) {
    if (entry.options.name !== MCP_CLIENT) continue;
    const serverName = entry.options.config?.serverName;
    if (typeof serverName === 'string' && serverNamePattern.test(serverName)) names.add(serverName);
  }
  return names;
}

function findLiveEntry(ctx, entryId) {
  if (typeof entryId !== 'string' || !entryId) throw new PatchWriteError('需要指定条目 id。');
  const matches = [...ctx.loader.entries()].filter((entry) => entry.options.id === entryId
    && entry.options.name === MCP_CLIENT && !entry.options.group);
  if (matches.length === 0) throw new PatchWriteError(`没有匹配 ${entryId} 的 MCP 条目。`);
  if (matches.length > 1) throw new PatchWriteError(`多个 MCP 条目匹配 ${entryId}。`);
  return matches[0];
}

/**
 * @param {object} ctx Host context.
 * @param {object} compatibility Write gate.
 * @param {{ filename?: string, hmr?: object }} [overrides] Test seams.
 */
export function createMcpPatch(ctx, compatibility, { filename, hmr } = {}) {
  const profile = ctx.get('profileContext');
  const patchPath = filename ?? profile?.patchPath;
  const profileDir = profile?.dir;

  function target() {
    if (typeof patchPath !== 'string' || !patchPath) throw new PatchWriteError('该 Profile 没有可写的 patch 文件。');
    return patchPath;
  }

  async function writePatch(path, text) {
    const { writeFileAtomic } = await atomicWrite();
    await writeFileAtomic(path, text, { mode: 0o600 });
  }

  /** Profile writes share one lock with official services: the profile manifest. */
  async function withPatchLock(operation) {
    const { withFileLock } = await atomicWrite();
    // The lock holder creates it beside the manifest, so the directory must already exist; a profile does.
    return withFileLock(typeof profileDir === 'string' && profileDir ? join(profileDir, 'package.json') : target(), operation, { waitMs: DEFAULT_LOCK_WAIT_MS });
  }

  /**
   * Run one document mutation under the official lock order and apply it.
   * @param {(document: import('yaml').Document) => boolean} mutate Returns whether the document changed.
   * @param {{ requiredIds?: string[], refetch?: () => boolean }} [options] Reconcile targets and a post-check.
   * @returns {Promise<{ application: 'applied' | 'restart-required' | 'overridden', changed: boolean }>}
   */
  async function commit(mutate, { requiredIds = [], refetch } = {}) {
    const hmrService = hmr ?? ctx.get('hmr');
    const run = () => withPatchLock(async () => {
      const path = target();
      const before = readTextOrEmpty(path);
      const document = parsePatch(before, path);
      if (!mutate(document)) return { changed: false, application: hmrService === undefined ? 'restart-required' : 'applied' };
      const after = renderPatch(document);
      if (after === before) return { changed: false, application: hmrService === undefined ? 'restart-required' : 'applied' };
      await writePatch(path, after);
      if (hmrService === undefined) return { changed: true, application: 'restart-required' };
      try {
        await hmrService.reconcileProfile(requiredIds);
      } catch (error) {
        await writePatch(path, before);
        try {
          // The rollback restores a state the caller no longer requires entries for, so it demands none.
          await hmrService.reconcileProfile();
        } catch {
          // Both the save and its rollback failed to apply; the file is back on disk, so a restart recovers.
          throw new PatchWriteError(`配置已写回原状，但重载失败，请重启 DSH：${error?.message ?? error}`);
        }
        throw new PatchWriteError(`保存未生效，已恢复原配置：${error?.message ?? error}`);
      }
      return { changed: true, application: refetch?.() === false ? 'overridden' : 'applied' };
    });
    return hmrService === undefined ? run() : hmrService.runExclusive(run);
  }

  /** Whether the Loader now holds this id with the expected enablement. */
  function liveState(id) {
    const entry = [...ctx.loader.entries()].find((row) => row.options.id === id);
    return entry === undefined ? undefined : { disabled: entry.disabled === true };
  }

  /** Add one server as an inserted patch row. */
  async function create(args, exec) {
    await compatibility.assertWrite('mcp', exec.signal);
    const definition = normalizeNewServer(args);
    if (claimedServerNames(ctx).has(definition.serverName)) {
      throw new PatchWriteError(`serverName ${definition.serverName} 已被其他 MCP 条目使用。`);
    }
    const id = uniqueId(ctx, definition.serverName);
    exec.signal.throwIfAborted();
    const outcome = await commit((document) => {
      insertServerRow(document, { id, name: MCP_CLIENT, config: definition.config });
      return true;
    }, {
      requiredIds: [id],
      // A home patch or command-line overlay may re-disable or drop the new row.
      refetch: () => liveState(id)?.disabled === false,
    });
    return { ...outcome, entryId: id, serverName: definition.serverName };
  }

  /** Remove a server this plugin inserted, or disable a row another layer owns. */
  async function remove(args, exec) {
    await compatibility.assertWrite('mcp', exec.signal);
    const entry = findLiveEntry(ctx, args.entryId);
    const id = entry.options.id;
    exec.signal.throwIfAborted();
    let removed;
    const outcome = await commit((document) => {
      if (removeInsertRow(document, id)) {
        removed = 'insert';
        // The row is gone, so every override that addressed it, config included, now points at nothing.
        removeAllOverrides(document, id, entry.options.name);
        return true;
      }
      removed = 'disabled';
      removeOverride(document, id, entry.options.name);
      return setDisabled(document, { id, name: entry.options.name, disabled: true });
    }, {
      // A deleted row must disappear; a disabled one must report itself disabled.
      refetch: () => removed === 'insert' ? liveState(id) === undefined : liveState(id)?.disabled === true,
    });
    return { ...outcome, removed, entryId: id };
  }

  /** Enable or disable a row without removing its definition. */
  async function setEnabled(args, exec) {
    await compatibility.assertWrite('mcp', exec.signal);
    if (typeof args.enabled !== 'boolean') throw new PatchWriteError('enabled 必须是布尔值。');
    const entry = findLiveEntry(ctx, args.entryId);
    exec.signal.throwIfAborted();
    const outcome = await commit((document) => setDisabled(document, {
      id: entry.options.id,
      name: entry.options.name,
      disabled: !args.enabled,
    }), {
      requiredIds: args.enabled ? [entry.options.id] : [],
      refetch: () => {
        const live = [...ctx.loader.entries()].find((row) => row.options.id === entry.options.id);
        return live !== undefined && live.disabled === !args.enabled;
      },
    });
    return { ...outcome, entryId: entry.options.id, enabled: args.enabled };
  }

  return { create, remove, setEnabled, patchPath: () => target() };
}
