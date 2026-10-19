import { isDeepStrictEqual } from 'node:util';

export class ManagedMcpError extends Error {}
const nativeModule = '@deepseek-ai/dsh-mcp-client';
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);

export function normalizeServer(serverName, value) {
  if (typeof serverName !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(serverName)
    || ['__proto__', 'prototype', 'constructor'].includes(serverName)) throw new ManagedMcpError('Server 名称须为 1–32 位字母、数字、下划线或短横线。');
  if (!record(value)) throw new ManagedMcpError('MCP 定义必须是对象。');
  const fields = ['transport', 'command', 'args', 'cwd', 'url', 'envFromEnv', 'headersFromEnv'];
  if (Object.keys(value).some((key) => !fields.includes(key))) throw new ManagedMcpError('MCP 定义包含不支持的字段；凭据仅支持环境变量引用。');
  const text = (key, required = false) => {
    if (value[key] === undefined && !required) return undefined;
    if (typeof value[key] !== 'string' || (required && !value[key].trim()) || value[key].length > 8192 || value[key].includes('\0')) throw new ManagedMcpError(`字段 ${key} 无效。`);
    return value[key];
  };
  const refs = (key, header = false) => {
    const input = value[key] ?? {};
    if (!record(input) || Object.keys(input).length > 64) throw new ManagedMcpError(`字段 ${key} 必须是环境变量名映射。`);
    const entries = Object.entries(input);
    for (const [target, source] of entries) {
      if (!(header ? /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/ : /^[A-Za-z_][A-Za-z0-9_]*$/).test(target)
        || ['__proto__', 'prototype', 'constructor'].includes(target)
        || typeof source !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(source)) throw new ManagedMcpError(`字段 ${key} 只接受合法环境变量名，不接受凭据值。`);
    }
    return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
  };
  if (value.transport === 'stdio') {
    if (value.url !== undefined || value.headersFromEnv !== undefined) throw new ManagedMcpError('stdio 不接受 HTTP 字段。');
    const args = value.args ?? [];
    if (!Array.isArray(args) || args.length > 128 || args.some((arg) => typeof arg !== 'string' || arg.length > 8192 || arg.includes('\0'))) throw new ManagedMcpError('args 必须是字符串数组。');
    const cwd = text('cwd');
    return { transport: 'stdio', command: text('command', true), args: [...args], ...(cwd ? { cwd } : {}), envFromEnv: refs('envFromEnv') };
  }
  if (value.transport === 'streamable-http') {
    if (['command', 'args', 'cwd', 'envFromEnv'].some((key) => value[key] !== undefined)) throw new ManagedMcpError('HTTP 不接受 stdio 字段。');
    const input = text('url', true);
    let url;
    try { url = new URL(input); } catch { throw new ManagedMcpError('请输入合法的 HTTP/HTTPS MCP 地址。'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new ManagedMcpError('HTTP 地址仅支持 HTTP/HTTPS，不接受内嵌凭据、查询参数或片段；认证请引用环境变量。');
    return { transport: 'streamable-http', url: url.href, headersFromEnv: refs('headersFromEnv', true) };
  }
  throw new ManagedMcpError('请选择 stdio 或 streamable-http。');
}

function bridgeConfig(serverName, definition) {
  const resolveRefs = (refs) => Object.fromEntries(Object.entries(refs).map(([target, source]) => {
    const value = process.env[source];
    if (value === undefined) throw new ManagedMcpError(`缺少环境变量 ${source}，请先为 DSH 配置该变量。`);
    return [target, value];
  }));
  return definition.transport === 'stdio'
    ? { serverName, transport: 'stdio', command: definition.command, args: definition.args, ...(definition.cwd ? { cwd: definition.cwd } : {}), env: resolveRefs(definition.envFromEnv), failOnStartupError: true }
    : { serverName, transport: 'streamable-http', url: definition.url, headers: resolveRefs(definition.headersFromEnv), failOnStartupError: true };
}

/** Own only this plugin's declared connections; native MCP keeps transport and tool lifecycles. */
export function createManagedMcp(ctx, config, compatibility, readBridge = () => import('@deepseek-ai/dsh-mcp-client'), options = {}) {
  const startupTimeoutMs = options.startupTimeoutMs ?? 30_000;
  const cleanupTimeoutMs = options.cleanupTimeoutMs ?? 5_000;
  const bounded = (work, ms, message, onTimeout) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { onTimeout?.(); reject(new ManagedMcpError(message)); }, ms);
    Promise.resolve(work).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
  const connections = new Map();
  let alive = true;
  let queue = Promise.resolve();
  let bridgePromise;
  const definitions = () => config.managedServers.get();
  const loadBridge = () => {
    if (bridgePromise) return bridgePromise;
    const pending = Promise.resolve().then(readBridge).then((bridge) => {
      if (typeof bridge.apply !== 'function') throw new Error('unsupported bridge');
      return bridge;
    }).catch(() => {
      if (bridgePromise === pending) bridgePromise = undefined;
      throw new ManagedMcpError('官方 MCP 桥接器不可用；请检查 DSH 的 MCP Client 模块。');
    });
    bridgePromise = pending;
    return pending;
  };
  const boundedBridge = () => {
    const pending = loadBridge();
    return bounded(pending, startupTimeoutMs, '官方 MCP 桥接器加载超时，请重试。', () => {
      if (bridgePromise === pending) bridgePromise = undefined;
    });
  };
  const owner = () => {
    const rows = ctx.configEditor.configuration().filter(({ entry }) => entry.fiber === ctx.fiber
      || (ctx.fiber.entry && entry === ctx.fiber.entry));
    if (rows.length !== 1) throw new ManagedMcpError('无法唯一定位当前管理插件的配置条目，不能保存 MCP。');
    return rows[0].entry;
  };
  function assertUnique(serverName, current) {
    if (own(current, serverName)) throw new ManagedMcpError('此 Server 名称已存在；新增操作不会覆盖已有配置。');
    for (const { entry } of ctx.configEditor.configuration()) {
      if (entry.options?.name === nativeModule && entry.options.config?.serverName === serverName) throw new ManagedMcpError('此名称已被 Profile 中的原生 MCP 使用。');
    }
  }
  async function dispose(connection) {
    if (!connection.fiber) return;
    if (!connection.disposal) {
      const pending = (async () => {
        let failed = false;
        try { await connection.fiber.dispose(); } catch { failed = true; }
        // Cordis await() keeps the startup error after a failed fiber is disposed.
        if (connection.fiber.state !== 4) {
          try { await connection.fiber.await(); } catch { failed = true; }
        }
        if (failed) throw new ManagedMcpError('旧 MCP 连接未能完全释放；请重试清理，不会创建同名替代实例。');
      })();
      connection.disposal = pending;
      void pending.catch(() => { if (connection.disposal === pending) connection.disposal = undefined; });
    }
    await bounded(connection.disposal, cleanupTimeoutMs, '旧 MCP 连接清理超时；请重试清理，不会创建同名替代实例。');
  }
  async function reconcile() {
    if (!alive) return;
    const desired = definitions();
    let bridgeAttempt;
    // A persisted definition must not start a command on a runtime this plugin has not verified.
    // A caller that supplies no report is treated as already authorized by its own composition.
    let writable = true;
    if (typeof compatibility?.report === 'function') {
      try { writable = (await compatibility.report()).writes.mcp === true; } catch { writable = false; }
    }
    if (!alive) return;
    if (!writable) {
      for (const [name, connection] of connections) {
        try {
          await dispose(connection);
          connections.delete(name);
        } catch {
          connection.phase = 'cleanup-failed';
          connection.error = '本地 MCP 连接未能完全释放；请重启后再试。';
        }
      }
      return;
    }
    for (const [name, connection] of connections) {
      if (own(desired, name) && isDeepStrictEqual(connection.raw, desired[name]) && connection.phase !== 'cleanup-failed') continue;
      try {
        await dispose(connection);
        connections.delete(name);
      } catch (error) {
        connection.phase = 'cleanup-failed';
        connection.error = error.message;
      }
    }
    for (const [serverName, raw] of Object.entries(desired)) {
      if (!alive) return;
      if (connections.has(serverName)) continue;
      const connection = { raw: structuredClone(raw), transport: raw?.transport, fiber: null, phase: 'loading' };
      let startupTimedOut = false;
      connections.set(serverName, connection);
      try {
        const definition = normalizeServer(serverName, raw);
        const actual = bridgeConfig(serverName, definition);
        const bridge = await (bridgeAttempt ??= boundedBridge());
        if (!alive) return;
        const latest = definitions();
        if (!own(latest, serverName) || !isDeepStrictEqual(latest[serverName], raw)) {
          connections.delete(serverName);
          continue;
        }
        // A distinct owner contains each bridge instance and its failures.
        let bridgeFiber;
        connection.fiber = ctx.plugin({ name: `managed-mcp-${serverName}`, apply(child) {
          bridgeFiber = child.plugin(bridge, actual);
        } });
        await bounded((async () => {
          await connection.fiber.await();
          await bridgeFiber.await();
        })(), startupTimeoutMs, '本地 MCP 启动超时，请检查桥接器后重试加载。', () => { startupTimedOut = true; });
        const current = definitions();
        if (!alive || !own(current, serverName) || !isDeepStrictEqual(current[serverName], raw)) {
          try {
            await dispose(connection);
            connections.delete(serverName);
          } catch (error) {
            connection.phase = 'cleanup-failed';
            connection.error = error.message;
          }
        }
      } catch (error) {
        connection.phase = 'failed';
        connection.error = error instanceof ManagedMcpError ? error.message : '本地 MCP 加载失败，请检查官方桥接器。';
        if (connection.fiber && startupTimedOut) {
          void dispose(connection).catch(() => {});
        }
      }
    }
  }
  const sync = () => {
    const next = queue.then(reconcile);
    queue = next.catch(() => {});
    return next;
  };
  function catalog() {
    let writable = true;
    try { owner(); } catch { writable = false; }
    // Every persisted declaration is listed, including ones this runtime has not (or must not) start,
    // so a configuration is never invisible just because it is not running.
    const declared = definitions();
    const names = new Set([...Object.keys(record(declared) ? declared : {}), ...connections.keys()]);
    return {
      writable,
      servers: [...names].map((serverName) => {
        const connection = connections.get(serverName);
        if (!connection) {
          return { kind: 'managed-config', serverName, transport: declared?.[serverName]?.transport, phase: 'not-started', connectionState: 'unknown' };
        }
        return {
          kind: 'managed-config', serverName, transport: connection.transport,
          ...(connection.fiber ? { fiberState: connection.fiber.state } : {}),
          phase: ['failed', 'cleanup-failed'].includes(connection.phase) || connection.fiber?.state === 3 ? 'failed' : 'declared',
          ...(connection.error ? { error: connection.error } : {}),
          connectionState: 'unknown',
        };
      }),
    };
  }
  async function add(args, signal) {
    await compatibility.assertWrite('mcp', signal);
    const definition = normalizeServer(args.serverName, args.definition);
    const entry = owner();
    assertUnique(args.serverName, definitions());
    // Check references and bridge availability before persisting; resolved values are never stored.
    bridgeConfig(args.serverName, definition);
    await boundedBridge();
    signal.throwIfAborted();
    await ctx.configEditor.edit(entry, (current) => {
      signal.throwIfAborted();
      const servers = current.managedServers ?? {};
      if (!record(servers)) throw new ManagedMcpError('当前 MCP 配置格式无效，未作修改。');
      assertUnique(args.serverName, servers);
      return { ...current, managedServers: { ...servers, [args.serverName]: definition } };
    });
    await sync();
    return { saved: true, serverName: args.serverName, connectionState: 'unknown' };
  }
  const owns = (entry) => entry.fiber === ctx.fiber || (ctx.fiber.entry && entry === ctx.fiber.entry)
    || entry.options?.name === 'dsh-mcp-skill-manager' || entry.options?.name === 'mcp-skill-manager'
    || (entry.fiber?.runtime && entry.fiber.runtime === ctx.fiber.runtime);
  async function retry(args, signal) {
    await compatibility.assertWrite('mcp', signal);
    const serverName = args.serverName;
    if (typeof serverName !== 'string') throw new ManagedMcpError('请选择需要重试的 MCP。');
    const next = queue.then(async () => {
      signal.throwIfAborted();
      if (!alive) throw new ManagedMcpError('管理插件已退出，不能重试。');
      const connection = connections.get(serverName);
      if (!connection || !['failed', 'cleanup-failed'].includes(connection.phase)) throw new ManagedMcpError('只允许重试本插件本地加载或清理失败的连接。');
      try { await dispose(connection); }
      catch (error) { connection.phase = 'cleanup-failed'; connection.error = error.message; throw error; }
      connections.delete(serverName);
      signal.throwIfAborted();
      await reconcile();
      return { retried: true, serverName, connectionState: 'unknown' };
    });
    queue = next.catch(() => {});
    return next;
  }
  ctx.on('loader/volatile-update', () => { void sync().catch(() => {}); });
  ctx.effect(() => async () => {
    alive = false;
    await queue;
    const results = await Promise.allSettled([...connections.values()].map(dispose));
    connections.clear();
    if (results.some((result) => result.status === 'rejected')) throw new ManagedMcpError('部分 MCP 连接未能完全释放，请检查官方桥接器。');
  }, 'managed MCP connections');
  void sync().catch(() => {});
  return { add, retry, catalog, sync, owns };
}
