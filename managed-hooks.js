import { createHash, createHmac, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, lstat, open, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const hookEvents = Object.freeze(['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStart', 'SubagentStop']);
export class ManagedHooksError extends Error {}
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const forbiddenNames = new Set(['__proto__', 'prototype', 'constructor']);
const failure = {
  unavailable: '官方 Hook 模块或运行接口不可用。',
  failed: 'Hook 配置校验、缓存写入或桥接器加载失败。',
  cleanup: '旧 Hook 实例未能完全释放，禁止创建替代实例。',
  closed: 'Hook 管理器已退出。',
};

function validName(name) {
  if (typeof name !== 'string' || !/^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/.test(name) || forbiddenNames.has(name)) throw new ManagedHooksError('Hook 名称须为 1–64 位小写字母、数字、下划线或短横线。');
}

export function normalizeHook(name, value) {
  validName(name);
  if (!record(value) || Object.keys(value).some((key) => !['event', 'matcher', 'command', 'timeoutSec', 'enabled'].includes(key))) throw new ManagedHooksError('Hook 定义含不支持的字段。');
  if (!hookEvents.includes(value.event)) throw new ManagedHooksError('Hook 事件不受支持。');
  if (typeof value.command !== 'string' || !value.command.trim() || value.command.length > 8192 || value.command.includes('\0')) throw new ManagedHooksError('Hook 命令不能为空，长度最多 8192 字符。');
  if (!Number.isInteger(value.timeoutSec) || value.timeoutSec < 1 || value.timeoutSec > 600) throw new ManagedHooksError('Hook 超时须为 1–600 的整数秒。');
  if (value.matcher !== undefined && (typeof value.matcher !== 'string' || value.matcher.length > 512 || value.matcher.includes('\0'))) throw new ManagedHooksError('Hook matcher 须为最多 512 字符的字符串。');
  if (['UserPromptSubmit', 'Stop'].includes(value.event) && value.matcher?.trim()) throw new ManagedHooksError('此 Hook 事件不支持 matcher。');
  if (value.matcher && value.matcher !== '*') {
    try { new RegExp(value.matcher); } catch { throw new ManagedHooksError('Hook matcher 格式无效。'); }
  }
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') throw new ManagedHooksError('Hook enabled 须为布尔值。');
  return { event: value.event, ...(value.matcher?.trim() ? { matcher: value.matcher } : {}), command: value.command, timeoutSec: value.timeoutSec, enabled: value.enabled ?? false };
}

/** Derived cache only: the Profile's managedHooks remains the source of truth. */
export async function writeHookArtifact(text, ownerId) {
  const scope = `${process.env.DSH_PROFILE_DIR ?? process.env.DSH_HOME ?? process.cwd()}\0${ownerId}`;
  const folder = join(tmpdir(), 'dsh-managed-hooks-' + createHash('sha256').update(scope).digest('hex').slice(0, 32));
  await mkdir(folder, { mode: 0o700, recursive: true });
  const directory = await lstat(folder);
  if (directory.isSymbolicLink() || !directory.isDirectory()) throw new ManagedHooksError(failure.failed);
  await chmod(folder, 0o700);
  const file = join(folder, 'hooks.json');
  let handle;
  try {
    try { handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const before = await lstat(file);
      if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1) throw new ManagedHooksError(failure.failed);
      handle = await open(file, constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0));
      const actual = await handle.stat();
      if (!actual.isFile() || actual.nlink !== 1 || actual.ino !== before.ino || actual.dev !== before.dev) throw new ManagedHooksError(failure.failed);
    }
    await handle.chmod(0o600);
    await handle.truncate(0);
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    const final = await lstat(file);
    const actual = await handle.stat();
    if (final.isSymbolicLink() || !final.isFile() || final.ino !== actual.ino || final.dev !== actual.dev) throw new ManagedHooksError(failure.failed);
    return file;
  } finally { await handle?.close(); }
}

/** One official bridge instance owns all enabled rules in their saved order. */
export function createManagedHooks(ctx, config, compatibility, options = {}) {
  const readBridge = options.readBridge ?? (() => import('@deepseek-ai/dsh-hooks-claude-code'));
  const readProtocol = options.readProtocol ?? (() => import('@deepseek-ai/dsh-hook-protocol'));
  const writeArtifact = options.writeArtifact ?? writeHookArtifact;
  const startupTimeoutMs = options.startupTimeoutMs ?? 30_000;
  const cleanupTimeoutMs = options.cleanupTimeoutMs ?? 5_000;
  const key = randomBytes(32);
  let alive = true;
  let phase = 'disabled';
  let runtimeError;
  let mounted;
  let mountedRules;
  let dirty = false;
  let force = false;
  let pending;
  let closePromise;
  let modulesPromise;
  const definitions = () => config.managedHooks?.get?.() ?? {};
  const owner = () => {
    const rows = ctx.configEditor.configuration().filter(({ entry }) => entry.fiber === ctx.fiber || (ctx.fiber.entry && entry === ctx.fiber.entry));
    if (rows.length !== 1) throw new ManagedHooksError('无法唯一定位 Hook 配置所属条目。');
    return rows[0].entry;
  };
  const revision = (name, raw) => createHmac('sha256', key).update(JSON.stringify([name, raw])).digest('hex');
  const normalized = (raw) => {
    if (!record(raw)) throw new ManagedHooksError('Hook 配置必须是对象。');
    return Object.entries(raw).map(([name, value]) => [name, normalizeHook(name, value)]);
  };
  const runtime = () => ({ phase, ...(runtimeError ? { error: runtimeError } : {}), enabledCount: record(definitions()) ? Object.values(definitions()).filter((rule) => rule?.enabled === true).length : 0 });
  const bounded = (work, timeout, message) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ManagedHooksError(message)), timeout);
    Promise.resolve(work).then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
  async function loadModules() {
    if (!modulesPromise) {
      const attempt = Promise.all([Promise.resolve().then(readBridge), Promise.resolve().then(readProtocol)]).then(([bridge, protocol]) => {
        if (typeof bridge?.apply !== 'function' || typeof protocol?.matcherDiagnostic !== 'function') throw new ManagedHooksError(failure.unavailable);
        return { bridge, protocol };
      });
      modulesPromise = attempt;
      void attempt.catch(() => { if (modulesPromise === attempt) modulesPromise = undefined; });
    }
    const attempt = modulesPromise;
    try { return await bounded(attempt, startupTimeoutMs, failure.unavailable); }
    catch { if (modulesPromise === attempt) modulesPromise = undefined; throw new ManagedHooksError(failure.unavailable); }
  }
  function checkMatchers(rules, protocol) {
    for (const [, rule] of rules) {
      let diagnostic;
      try { diagnostic = protocol.matcherDiagnostic(rule.matcher, 'claude-code'); }
      catch { throw new ManagedHooksError('Hook matcher 格式无效。'); }
      if (diagnostic !== undefined) throw new ManagedHooksError('Hook matcher 格式无效。');
    }
  }
  async function prepare(rules) {
    const status = await compatibility.report();
    if (!status.capabilities.hookRuntime || !status.writes.hooks) throw new ManagedHooksError(failure.unavailable);
    const modules = await loadModules();
    checkMatchers(rules, modules.protocol);
    return modules;
  }
  async function release() {
    if (!mounted) return;
    const current = mounted;
    if (!current.disposal) {
      const work = (async () => {
        await current.fiber.dispose();
        if (current.fiber.state !== 4) await current.fiber.await();
      })();
      current.disposal = work;
      void work.catch(() => { if (current.disposal === work) current.disposal = undefined; });
    }
    await bounded(current.disposal, cleanupTimeoutMs, failure.cleanup);
    if (mounted === current) { mounted = undefined; mountedRules = undefined; }
  }
  async function reconcile() {
    if (!alive) return;
    let rules;
    try { rules = normalized(definitions()).filter(([, rule]) => rule.enabled); }
    catch { phase = 'failed'; runtimeError = failure.failed; try { await release(); } catch { runtimeError = failure.cleanup; } return; }
    if (!force && mounted && phase === 'active' && isDeepStrictEqual(mountedRules, rules)) return;
    force = false;
    phase = rules.length ? 'loading' : 'disabled';
    runtimeError = undefined;
    try { await release(); }
    catch { phase = 'failed'; runtimeError = failure.cleanup; return; }
    if (!rules.length || !alive) return;
    let modules;
    try { modules = await prepare(rules); }
    catch { phase = 'unavailable'; runtimeError = failure.unavailable; return; }
    if (!alive) return;
    if (!isDeepStrictEqual(rules, normalized(definitions()).filter(([, rule]) => rule.enabled))) { dirty = true; return; }
    try {
      const groups = {};
      for (const [, rule] of rules) {
        (groups[rule.event] ??= []).push({ ...(rule.matcher ? { matcher: rule.matcher } : {}), hooks: [{ type: 'command', command: rule.command, timeout: rule.timeoutSec }] });
      }
      const configPath = await bounded(writeArtifact(JSON.stringify({ hooks: groups }), owner().id), startupTimeoutMs, failure.failed);
      if (!alive) return;
      if (!isDeepStrictEqual(rules, normalized(definitions()).filter(([, rule]) => rule.enabled))) { dirty = true; return; }
      let bridgeFiber;
      const fiber = ctx.plugin({ name: 'managed-hooks-runtime', apply(child) {
        bridgeFiber = child.plugin(modules.bridge, { configPath, defaultTimeoutMs: 600_000 });
      } });
      mounted = { fiber };
      mountedRules = rules;
      await bounded((async () => { await fiber.await(); await bridgeFiber.await(); })(), startupTimeoutMs, failure.failed);
      if (!alive) return;
      if (!isDeepStrictEqual(rules, normalized(definitions()).filter(([, rule]) => rule.enabled))) { dirty = true; return; }
      phase = 'active';
    } catch {
      phase = 'failed'; runtimeError = failure.failed;
      try { await release(); } catch { runtimeError = failure.cleanup; }
    }
  }
  function sync() {
    if (!alive) return Promise.resolve();
    dirty = true;
    if (!pending) {
      pending = Promise.resolve().then(async () => {
        while (alive && dirty) { dirty = false; await reconcile(); }
      }).catch(() => { phase = 'failed'; runtimeError = failure.failed; }).finally(() => { pending = undefined; });
    }
    return pending;
  }
  async function list(signal) {
    signal?.throwIfAborted();
    const rows = normalized(definitions());
    let writable = false;
    try { owner(); writable = (await compatibility.report()).writes.hooks === true; } catch { /* Read-only catalog remains available. */ }
    return { rules: rows.map(([name, rule]) => ({ name, event: rule.event, ...(rule.matcher ? { matcher: rule.matcher } : {}), timeoutSec: rule.timeoutSec, enabled: rule.enabled, commandConfigured: true, revision: revision(name, definitions()[name]) })), events: [...hookEvents], writable, runtime: runtime() };
  }
  function assertCurrent(name, raw, expectedRevision) {
    if (!Object.hasOwn(raw, name) || typeof expectedRevision !== 'string' || revision(name, raw[name]) !== expectedRevision) throw new ManagedHooksError('Hook 已变化或修订信息缺失，请刷新列表后重试。');
  }
  async function mutate(args, signal, action) {
    await compatibility.assertWrite('hooks', signal);
    signal?.throwIfAborted();
    if (!alive) throw new ManagedHooksError(failure.closed);
    validName(args.name);
    if (action === 'set-enabled' && typeof args.enabled !== 'boolean') throw new ManagedHooksError('enabled 须为布尔值。');
    const entry = owner();
    const before = definitions();
    if (!record(before)) throw new ManagedHooksError('Hook 配置必须是对象。');
    const exists = Object.hasOwn(before, args.name);
    let rule;
    if (action === 'upsert') {
      if (!record(args.definition)) throw new ManagedHooksError('Hook 定义必须是对象。');
      if (args.definition.enabled !== undefined && typeof args.definition.enabled !== 'boolean') throw new ManagedHooksError('Hook enabled 须为布尔值。');
      if (args.definition.enabled === true) throw new ManagedHooksError('启用 Hook 请使用 set-enabled 操作。');
      if (exists) assertCurrent(args.name, before, args.expectedRevision);
      else if (args.expectedRevision !== undefined) throw new ManagedHooksError('Hook 已移除，请刷新列表后重试。');
      const prior = exists ? normalizeHook(args.name, before[args.name]) : undefined;
      rule = normalizeHook(args.name, { ...args.definition, command: exists && (args.definition.command === undefined || args.definition.command === '') ? prior.command : args.definition.command, enabled: prior?.enabled ?? false });
    } else {
      assertCurrent(args.name, before, args.expectedRevision);
      if (action === 'set-enabled') rule = { ...normalizeHook(args.name, before[args.name]), enabled: args.enabled };
    }
    if (rule?.enabled) await prepare([[args.name, rule]]);
    signal?.throwIfAborted();
    if (!alive) throw new ManagedHooksError(failure.closed);
    await ctx.configEditor.edit(entry, (current, inherited) => {
      signal?.throwIfAborted();
      if (!alive) throw new ManagedHooksError(failure.closed);
      if (record(inherited?.managedHooks) && Object.keys(inherited.managedHooks).length) throw new ManagedHooksError('Hook 配置存在继承定义，须修改其所属条目。');
      const raw = current.managedHooks ?? {};
      if (!record(raw)) throw new ManagedHooksError('Hook 配置必须是对象。');
      if (exists) assertCurrent(args.name, raw, args.expectedRevision);
      else if (Object.hasOwn(raw, args.name)) throw new ManagedHooksError('Hook 名称已存在，请刷新列表后重试。');
      const next = { ...raw };
      if (action === 'remove') delete next[args.name];
      else next[args.name] = rule;
      return { ...current, managedHooks: next };
    });
    await sync();
    return { saved: true, name: args.name, runtime: runtime() };
  }
  async function retry(args = {}, signal) {
    await compatibility.assertWrite('hooks', signal);
    signal?.throwIfAborted();
    if (!alive) throw new ManagedHooksError(failure.closed);
    force = true;
    await sync();
    return { retried: true, runtime: runtime() };
  }
  function close() {
    if (closePromise) return closePromise;
    alive = false;
    dirty = false;
    closePromise = (async () => {
      await pending;
      try { await release(); phase = 'disabled'; runtimeError = undefined; }
      catch { phase = 'failed'; runtimeError = failure.cleanup; throw new ManagedHooksError(failure.cleanup); }
    })();
    return closePromise;
  }
  ctx.on('loader/volatile-update', () => { void sync(); });
  ctx.effect(() => close, 'managed Hook runtime');
  void sync();
  return { list, upsert: (args, signal) => mutate(args, signal, 'upsert'), setEnabled: (args, signal) => mutate(args, signal, 'set-enabled'), remove: (args, signal) => mutate(args, signal, 'remove'), retry, sync, close };
}
