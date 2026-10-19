import { randomUUID } from 'node:crypto';
import z from '@deepseek-ai/schemastery';
import { createDiscovery, DiscoveryError } from './discovery.js';
import { createCompatibility, CompatibilityError } from './compatibility.js';
import { createMcpConfig, McpConfigError } from './mcp-config.js';
import { createManagedHooks, ManagedHooksError } from './managed-hooks.js';

export const name = 'mcp-skill-manager';
export const inject = ['configEditor', 'skills', 'tools'];

class ManagerError extends Error {}

const rpcPrefix = 'mcp-skill-manager.';
export const Config = z.object({
  managedHooks: z.dict(z.any()).default({}).volatile(),
});


function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tool(name, description, parameters, execute) {
  const required = Object.entries(parameters)
    .filter(([, schema]) => schema.required === true)
    .map(([key]) => key);
  const properties = Object.fromEntries(
    Object.entries(parameters).map(([key, schema]) => {
      const { required: _required, ...jsonSchema } = schema;
      return [key, jsonSchema];
    }),
  );
  const parameterSchema = {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: true,
  };

  return {
    name,
    description,
    parameters: parameterSchema,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      if (!isRecord(args)) throw new ManagerError('Tool arguments must be an object');
      for (const key of required) {
        if (!Object.hasOwn(args, key)) throw new ManagerError(`${key} is required`);
      }
      for (const [key, schema] of Object.entries(parameters)) {
        const value = args[key];
        if (value === undefined) continue;
        const validType = schema.type === 'object'
          ? isRecord(value)
          : schema.type === 'array'
            ? Array.isArray(value)
            : schema.type === 'null'
              ? value === null
              : schema.type === 'integer'
                ? Number.isInteger(value)
                : typeof value === schema.type;
        if (!validType) throw new ManagerError(`${key} must be ${schema.type}`);
        if (schema.enum && !schema.enum.includes(value)) {
          throw new ManagerError(`${key} must be one of: ${schema.enum.join(', ')}`);
        }
      }
      try {
        return await execute(args, exec);
      } catch (error) {
        if (error instanceof ManagerError || error instanceof DiscoveryError || error instanceof CompatibilityError || error instanceof McpConfigError || error instanceof ManagedHooksError) throw error;
        throw new ManagerError('Host operation failed; check the DSH logs.');
      }
    },
  };
}

function isSkillName(value) {
  return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function requireNonBlank(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new ManagerError(`${label} is required`);
  return value;
}

function requireString(value, label) {
  return requireNonBlank(value, label).trim();
}

function skillLookup(exec) {
  return {
    signal: exec.signal,
    scope: exec.agent,
    cwd: exec.agent?.session?.header?.cwd,
  };
}

export function apply(ctx, config = {}) {
  const discovery = createDiscovery(ctx);
  const compatibility = createCompatibility(ctx, discovery.serviceFor);
  const mcpConfig = createMcpConfig(ctx, compatibility);
  const managedHooks = createManagedHooks(ctx, config, compatibility);
  const discoverMcp = (target, signal) => discovery.mcp(target, signal);
  const runtimeSkills = new Map();
  const pendingSkills = new Set();
  const pendingUnregister = new Set();
  let active = true;
  const runtimeProvider = `${name}:${randomUUID()}`;
  const mcpTool = tool(
    'dsh_manage_mcp_servers',
    'Discover the MCP servers configured in this Profile, which of their tools are registered in the calling Agent scope, and which servers expose no tools at all. Connectivity is reported as unknown. MCP configuration is changed only by a person in the settings page.',
    {
      action: { type: 'string', required: true, enum: ['discover'] },
    },
    async (args, exec) => {
      exec.signal.throwIfAborted();
      const action = requireString(args.action, 'action');
      if (action !== 'discover') throw new ManagerError('MCP 配置只能由人在设置页修改；此工具只提供发现。');
      return { action, ...await discoverMcp(discovery.view({}, exec.agent), exec.signal) };
    },
  );
  /** Shared MCP map writer for the settings page; the Agent tool refuses these actions before reaching it. */
  const disposeMcpTool = ctx.tools.register(mcpTool);
  const skillsTool = tool(
    'dsh_manage_skills',
    'List and read the effective DSH skill catalog. Registering or unregistering a Runtime Skill is done only by a person in the MCP & Skills settings page, because it injects instructions every later turn sees.',
    {
      action: { type: 'string', required: true, enum: ['list', 'get'] },
      name: { type: 'string', description: 'Skill name for get.' },
    },
    async (args, exec) => {
      exec.signal.throwIfAborted();
      const action = requireString(args.action, 'action');
      if (action === 'list') {
        const snapshot = await discovery.serviceFor('skills', exec.agent).snapshot(skillLookup(exec));
        return { action, skills: snapshot.skills, complete: snapshot.complete, scope: exec.agent ? 'agent' : 'profile' };
      }
      if (action !== 'get') throw new ManagerError('Runtime Skill 的注册与注销只能由人在设置页操作；此工具只提供目录与正文读取。');
      const skillName = requireString(args.name, 'name');
      {
        const skill = await discovery.serviceFor('skills', exec.agent).get(skillName, skillLookup(exec));
        return { action, skill: skill ?? null };
      }
    },
  );
  const disposeSkillTool = ctx.tools.register(skillsTool);
  /** Settings-page-only Runtime Skill writes; the Agent tool cannot reach this. */
  const skillWrite = async (action, args, exec) => {
    await compatibility.assertWrite('skills', exec.signal, exec.agent);
    const skillName = requireString(args.name, 'name');
    if (action === 'register') {
      if (!isSkillName(skillName)) {
        throw new ManagerError('name must be a kebab-case skill name');
      }
      if (runtimeSkills.has(skillName) || pendingSkills.has(skillName)) {
        throw new ManagerError(`Runtime skill ${skillName} is already registered by this plugin`);
      }
      const description = requireString(args.description, 'description');
      const content = requireNonBlank(args.content, 'content');
      pendingSkills.add(skillName);
      let dispose;
      try {
        const existing = await discovery.serviceFor('skills', exec.agent).snapshot(skillLookup(exec));
        exec.signal.throwIfAborted();
        if (!active) throw new ManagerError('Plugin unloaded while registering a runtime skill');
        if (!existing.complete) throw new ManagerError('Skill discovery is incomplete; retry before registering a runtime skill');
        if (existing.skills.some((skill) => skill.name === skillName)) {
          throw new ManagerError(`Skill ${skillName} already exists in the effective DSH catalog`);
        }
        dispose = ctx.skills.register({
          name: skillName,
          description,
          content,
          source: 'runtime',
          provider: runtimeProvider,
          ...(typeof args.whenToUse === 'string' && args.whenToUse.trim() ? { whenToUse: args.whenToUse.trim() } : {}),
          invocation: { modelInvocable: true, userInvocable: true },
        });
        runtimeSkills.set(skillName, dispose);
        const observed = await discovery.serviceFor('skills', exec.agent).snapshot(skillLookup(exec));
        if (!observed.complete) throw new ManagerError('Skill discovery is incomplete; runtime registration was rolled back');
        const registered = await discovery.serviceFor('skills', exec.agent).get(skillName, skillLookup(exec));
        exec.signal.throwIfAborted();
        if (
          !registered
          || registered.source !== 'runtime'
          || registered.provider !== runtimeProvider
          || registered.content !== content
          || registered.description !== description
        ) {
          throw new ManagerError(`Skill ${skillName} did not become the effective runtime definition`);
        }
        if (!active) throw new ManagerError('Plugin unloaded while registering a runtime skill');
        return { action, name: skillName, persisted: false };
      } catch (error) {
        dispose?.();
        if (runtimeSkills.get(skillName) === dispose) runtimeSkills.delete(skillName);
        throw error;
      } finally {
        pendingSkills.delete(skillName);
      }
    }
    if (pendingSkills.has(skillName)) throw new ManagerError(`Skill ${skillName} is currently being registered`);
    if (pendingUnregister.has(skillName)) throw new ManagerError(`Skill ${skillName} is currently being unregistered`);
    const dispose = runtimeSkills.get(skillName);
    if (!dispose) return { action, name: skillName, changed: false };
    pendingUnregister.add(skillName);
    try {
      const effective = await discovery.serviceFor('skills', exec.agent).get(skillName, skillLookup(exec));
      exec.signal.throwIfAborted();
      if (effective?.source !== 'runtime' || effective.provider !== runtimeProvider) {
        throw new ManagerError(`Skill ${skillName} is no longer the effective runtime definition; refresh the catalog`);
      }
      if (runtimeSkills.get(skillName) !== dispose) return { action, name: skillName, changed: false };
      dispose();
      runtimeSkills.delete(skillName);
      return { action, name: skillName, changed: true };
    } finally {
      pendingUnregister.delete(skillName);
    }
  };
  const hooksTool = tool(
    'dsh_manage_hooks',
    'List this Profile’s DSH command Hook rules with their revisions and bridge load status, without command contents. Hook rules are changed only by a person in the MCP & Skills settings page, because enabling one runs commands on this machine.',
    {
      action: { type: 'string', required: true, enum: ['list'] },
    },
    async (args, exec) => {
      exec.signal.throwIfAborted();
      const action = requireString(args.action, 'action');
      if (action !== 'list') throw new ManagerError('Hook rules are changed only from the settings page; this tool is read-only.');
      const result = await managedHooks.list(exec.signal);
      exec.signal.throwIfAborted();
      return { ...result, context: discovery.view({ sessionId: '' }).context };
    },
  );
  const disposeHooksTool = ctx.tools.register(hooksTool);
  /** Settings-page RPC is the only writer path; the Agent tool stays read-only. */
  const hooksRpc = async (action, args, signal) => {
    signal.throwIfAborted();
    let result;
    if (action === 'list') result = await managedHooks.list(signal);
    else if (action === 'upsert') result = await managedHooks.upsert(args, signal);
    else if (action === 'set-enabled') result = await managedHooks.setEnabled(args, signal);
    else if (action === 'remove') result = await managedHooks.remove(args, signal);
    else if (action === 'retry') result = await managedHooks.retry(args, signal);
    else throw new ManagerError('Unknown Hook management action');
    signal.throwIfAborted();
    return { ...result, context: discovery.view({ sessionId: '' }).context };
  };
  const handleRpc = async (method, payload, signal) => {
    try {
      if (payload !== undefined && !isRecord(payload)) throw new ManagerError('RPC arguments must be an object');
      const args = isRecord(payload) ? payload : {};
      if (args.sessionId !== undefined && typeof args.sessionId !== 'string') throw new ManagerError('sessionId must be a string');
      signal.throwIfAborted();
      const mutation = ['mcp.update', 'skills.register', 'skills.unregister', 'hooks.upsert', 'hooks.set-enabled', 'hooks.remove', 'hooks.retry'].includes(method);
      if (mutation && args.sessionId?.trim()) throw new ManagerError('This operation changes the Profile global configuration or Runtime Skills; select the Profile global view first.');
      const target = method.startsWith('skills.') ? discovery.view(args) : undefined;
      const exec = { signal, agent: target?.agent };
      let value;
      switch (method) {
        case 'compatibility.status': {
          const selected = discovery.view(args);
          value = { ...await compatibility.report(selected.agent), context: selected.context };
          discovery.assertCurrent(selected, signal);
          break;
        }
        case 'contexts.list':
          value = await discovery.contexts(signal);
          break;
        case 'mcp.discover':
          value = await discoverMcp(discovery.view(args), signal);
          break;
        case 'mcp.update':
          value = await mcpConfig.update(args, exec);
          break;
        case 'hooks.list':
        case 'hooks.upsert':
        case 'hooks.set-enabled':
        case 'hooks.remove':
        case 'hooks.retry':
          value = await hooksRpc(method.slice('hooks.'.length), args, signal);
          break;
        case 'skills.list': {
          const result = await skillsTool.execute({ action: 'list' }, exec);
          const counts = new Map();
          for (const skill of result.skills) counts.set(skill.name, (counts.get(skill.name) || 0) + 1);
          const checkedNames = [...counts].filter(([skillName, count]) => count > 1 || runtimeSkills.has(skillName)).map(([skillName]) => skillName);
          const service = discovery.serviceFor('skills', exec.agent);
          const effective = new Map(await Promise.all(checkedNames.map(async (skillName) => [skillName, await service.get(skillName, skillLookup(exec))])));
          discovery.assertCurrent(target, signal);
          const selected = new Map();
          for (const skill of result.skills) {
            if (checkedNames.includes(skill.name)) continue;
            if (!selected.has(skill.name)) selected.set(skill.name, skill);
          }
          for (const skillName of checkedNames) {
            const skill = effective.get(skillName);
            if (skill) selected.set(skillName, skill);
          }
          value = {
            complete: result.complete,
            scope: result.scope,
            context: target.context,
            skills: [...selected.values()].map((skill) => ({
              name: skill.name,
              description: skill.description,
              source: skill.source,
              provider: skill.provider,
              path: typeof skill.path === 'string' && !/^[a-z][a-z0-9+.-]*:\/\//i.test(skill.path) ? skill.path : undefined,
              canUnregister: !target.agent && skill.source === 'runtime' && skill.provider === runtimeProvider && runtimeSkills.has(skill.name),
            })),
          };
          break;
        }
        case 'skills.get':
          value = await skillsTool.execute({ ...args, action: 'get' }, exec);
          discovery.assertCurrent(target, signal);
          value = { ...value, context: target.context };
          break;
        case 'skills.register':
          value = await skillWrite('register', args, exec);
          break;
        case 'skills.unregister':
          value = await skillWrite('unregister', args, exec);
          break;
        default:
          throw new ManagerError('Unknown mcp-skill-manager RPC method');
      }
      return { ok: true, value };
    } catch (error) {
      const knownError = error instanceof ManagerError || error instanceof DiscoveryError || error instanceof CompatibilityError || error instanceof McpConfigError || error instanceof ManagedHooksError;
      return {
        ok: false,
        error: {
          code: error instanceof CompatibilityError ? 'MCP_SKILL_MANAGER_INCOMPATIBLE' : 'MCP_SKILL_MANAGER_OPERATION_FAILED',
          message: knownError ? error.message : 'Host operation failed; check the DSH logs.',
          details: {},
        },
      };
    }
  };
  const rpcMethods = ['compatibility.status', 'contexts.list', 'mcp.discover', 'mcp.update', 'skills.list', 'skills.get', 'skills.register', 'skills.unregister', 'hooks.list', 'hooks.upsert', 'hooks.set-enabled', 'hooks.remove', 'hooks.retry'];
  /** Enabling a Hook or saving a stdio MCP server runs a command on this machine, so the caller must be the confirming owner session. */
  const privilegedWriteMethods = new Set(['hooks.upsert', 'hooks.set-enabled', 'hooks.remove', 'hooks.retry', 'mcp.update', 'contexts.list', 'skills.register', 'skills.unregister']);
  const admitPrivilegedWrite = (peer) => {
    if (!isRecord(peer?.principal) || peer.principal.kind !== 'owner') throw new ManagerError('此操作会写入可执行配置；调用方必须是本机所有者会话。');
    if (peer.interactions !== 'answer') throw new ManagerError('此操作会写入可执行配置；需要能够确认操作的本机会话。');
  };
  ctx.inject(['connection'], (webCtx) => {
    webCtx.effect(function* () {
    for (const method of rpcMethods) {
      const endpoint = rpcPrefix + method;
      yield webCtx.connection.fetch.register({
        path: '/api/' + endpoint,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          let message;
          try {
            message = await request.json();
          } catch {
            return new Response('Invalid JSON request', { status: 400 });
          }
          if (!isRecord(message) || message.type !== 'client-request'
            || typeof message.rpcId !== 'string' || message.method !== endpoint) {
            return new Response('Invalid RPC request', { status: 400 });
          }
          // Any session-scoped RPC reads another Agent's catalog, so it needs the same caller check as a write.
          const sessionScoped = isRecord(message.payload) && typeof message.payload.sessionId === 'string' && message.payload.sessionId.trim() !== '';
          if (privilegedWriteMethods.has(method) || sessionScoped) {
            let denied;
            // The trust check lives on the shared carrier; a rejection here means no owner Peer was admitted.
            try {
              const admission = webCtx.connection.admit ? webCtx.connection.admit(request) : undefined;
              admitPrivilegedWrite(admission && 'peer' in admission ? admission.peer : undefined);
            } catch (error) {
              denied = error instanceof ManagerError ? error : new ManagerError('此请求需要本机所有者会话；调用方校验失败。');
            }
            if (denied) {
              return Response.json({ type: 'server-response', rpcId: message.rpcId, result: { ok: false, error: { code: 'MCP_SKILL_MANAGER_FORBIDDEN', message: denied.message, details: {} } } });
            }
          }
          const result = await handleRpc(method, message.payload, request.signal);
          return Response.json({ type: 'server-response', rpcId: message.rpcId, result });
        },
      });
    }
    }, 'mcp-skill-manager API routes');
  });

  ctx.effect(function* () {
    yield () => {
      active = false;
      disposeMcpTool();
      disposeSkillTool();
      disposeHooksTool();
      for (const dispose of runtimeSkills.values()) dispose();
      runtimeSkills.clear();
    };
  }, 'mcp-skill-manager tools, settings RPC, and runtime skills');
}
