import { randomUUID } from 'node:crypto';
import z from '@deepseek-ai/schemastery';
import { createDiscovery, DiscoveryError } from './discovery.js';
import { createCompatibility, CompatibilityError } from './compatibility.js';
import { createMcpConfig, McpConfigError } from './mcp-config.js';
import { createMcpPatch, PatchWriteError } from './mcp-write.js';
import { createToolGuards, ToolGuardError } from './tool-guards.js';
import { createSkillFiles, SkillFileError, isSkillName } from './skill-files.js';

export const name = 'mcp-skill-manager';
export const inject = ['configEditor', 'skills', 'tools'];

class ManagerError extends Error {}

const rpcPrefix = 'mcp-skill-manager.';

/** No configuration: the page edits the profile patch, not this plugin's own options. */
export const Config = z.object({});

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
        if (error instanceof ManagerError || error instanceof DiscoveryError || error instanceof CompatibilityError
          || error instanceof McpConfigError || error instanceof PatchWriteError || error instanceof ToolGuardError
          || error instanceof SkillFileError) throw error;
        throw new ManagerError('Host operation failed; check the DSH logs.');
      }
    },
  };
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

/** The settings page is the only writer; Agent tools stay read-only and report configuration from the same model. */
export function apply(ctx, _config = {}) {
  const compatibility = createCompatibility(ctx);
  const toolGuards = createToolGuards(ctx, compatibility);
  const skillFiles = createSkillFiles(ctx, compatibility);
  const discovery = createDiscovery(ctx, toolGuards);
  const mcpConfig = createMcpConfig(ctx, compatibility);
  const mcpPatch = createMcpPatch(ctx, compatibility);
  const runtimeSkills = new Map();
  const pendingSkills = new Set();
  const pendingUnregister = new Set();
  let active = true;
  const runtimeProvider = `${name}:${randomUUID()}`;

  const mcpTool = tool(
    'dsh_manage_mcp_servers',
    'List this Profile’s MCP servers, their configured fields, and which tools are visible in the calling Agent scope. MCP configuration is changed only by a person in the settings page.',
    {
      action: { type: 'string', required: true, enum: ['list'] },
    },
    async (args, exec) => {
      exec.signal.throwIfAborted();
      requireString(args.action, 'action');
      return { action: 'list', ...discovery.mcp({ agent: exec.agent }) };
    },
  );
  const disposeMcpTool = ctx.tools.register(mcpTool);

  const skillsTool = tool(
    'dsh_manage_skills',
    'List and read the effective DSH skill catalog. Registering or unregistering a runtime skill is done only by a person in the settings page.',
    {
      action: { type: 'string', required: true, enum: ['list', 'get'] },
      name: { type: 'string', description: 'Skill name for get.' },
    },
    async (args, exec) => {
      exec.signal.throwIfAborted();
      const action = requireString(args.action, 'action');
      const service = discovery.serviceFor('skills', exec.agent);
      if (action === 'list') {
        const snapshot = await service.snapshot(skillLookup(exec));
        return { action, skills: snapshot.skills, complete: snapshot.complete, scope: exec.agent ? 'agent' : 'profile' };
      }
      const skillName = requireString(args.name, 'name');
      const skill = await service.get(skillName, skillLookup(exec));
      return { action, skill: skill ?? null };
    },
  );
  const disposeSkillTool = ctx.tools.register(skillsTool);

  /**
   * Deny calls to tools the page disabled. `tools.guard()` runs after the pre-execute waterfall and
   * before the tool body, and a plain-context guard applies to every agent — exactly the reach a
   * profile-level deny list needs. It hides nothing: the model still sees the schema and is told why
   * the call failed, because the bridge offers no way to unregister a foreign tool.
   */
  const disposeToolGuard = typeof ctx.tools.guard === 'function'
    ? ctx.tools.guard((exec) => toolGuards.reason(exec?.name))
    : undefined;

  /** Settings-page-only runtime skill writes; the Agent tool cannot reach this. */
  const skillWrite = async (action, args, exec) => {
    await compatibility.assertWrite('skills', exec.signal);
    const skillName = requireString(args.name, 'name');
    if (action === 'register') {
      if (!isSkillName(skillName)) throw new ManagerError('name must be a kebab-case skill name');
      if (runtimeSkills.has(skillName) || pendingSkills.has(skillName)) {
        throw new ManagerError(`Runtime skill ${skillName} is already registered by this plugin`);
      }
      const description = requireString(args.description, 'description');
      const content = requireNonBlank(args.content, 'content');
      pendingSkills.add(skillName);
      let dispose;
      try {
        const service = discovery.serviceFor('skills', exec.agent);
        const existing = await service.snapshot(skillLookup(exec));
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
        const observed = await service.snapshot(skillLookup(exec));
        if (!observed.complete) throw new ManagerError('Skill discovery is incomplete; runtime registration was rolled back');
        const registered = await service.get(skillName, skillLookup(exec));
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
      const service = discovery.serviceFor('skills', exec.agent);
      const effective = await service.get(skillName, skillLookup(exec));
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

  const MUTATIONS = new Set([
    'mcp.create', 'mcp.update', 'mcp.reset', 'mcp.remove', 'mcp.set-enabled', 'mcp.set-tool-disabled',
    'skills.register', 'skills.unregister', 'skills.save', 'skills.remove', 'skills.set-enabled', 'skills.reveal',
  ]);

  const handleRpc = async (method, payload, signal) => {
    try {
      if (payload !== undefined && !isRecord(payload)) throw new ManagerError('RPC arguments must be an object');
      const args = isRecord(payload) ? payload : {};
      if (args.sessionId !== undefined) throw new ManagerError('These operations address the Profile; a session id is not accepted.');
      signal.throwIfAborted();
      const exec = { signal, agent: undefined };
      let value;
      switch (method) {
        case 'compatibility.status':
          value = await compatibility.report();
          break;
        case 'mcp.discover':
          value = discovery.mcp();
          break;
        case 'mcp.create':
          value = await mcpPatch.create(args, exec);
          break;
        case 'mcp.update':
          value = await mcpConfig.update(args, exec);
          break;
        case 'mcp.reset':
          value = await mcpConfig.reset(args, exec);
          break;
        case 'mcp.remove':
          value = await mcpPatch.remove(args, exec);
          break;
        case 'mcp.set-enabled':
          value = await mcpPatch.setEnabled(args, exec);
          break;
        case 'mcp.set-tool-disabled':
          value = await toolGuards.set(args, exec);
          break;
        case 'skills.list': {
          const result = await skillsTool.execute({ action: 'list' }, exec);
          const counts = new Map();
          for (const skill of result.skills) counts.set(skill.name, (counts.get(skill.name) || 0) + 1);
          const checkedNames = [...counts].filter(([skillName, count]) => count > 1 || runtimeSkills.has(skillName)).map(([skillName]) => skillName);
          const service = discovery.serviceFor('skills', exec.agent);
          const effective = new Map(await Promise.all(checkedNames.map(async (skillName) => [skillName, await service.get(skillName, skillLookup(exec))])));
          const selected = new Map();
          for (const skill of result.skills) {
            if (checkedNames.includes(skill.name)) continue;
            if (!selected.has(skill.name)) selected.set(skill.name, skill);
          }
          for (const skillName of checkedNames) {
            const skill = effective.get(skillName);
            if (skill) selected.set(skillName, skill);
          }
          const writable = new Set(skillFiles.roots().map(({ source }) => source));
          const grouped = new Map();
          for (const skill of result.skills) {
            if (!grouped.has(skill.name)) grouped.set(skill.name, []);
            grouped.get(skill.name).push(skill);
          }
          value = {
            complete: result.complete,
            scope: result.scope,
            skills: [...selected.values()].map((skill) => {
              // A root is addressed by path: several custom directories share the source name `custom`.
              const root = skillFiles.rootOf(skill.path);
              const shadowed = (grouped.get(skill.name) ?? []).filter((entry) => entry.source !== skill.source
                || entry.provider !== skill.provider || entry.path !== skill.path);
              return {
                name: skill.name,
                description: skill.description,
                whenToUse: skill.whenToUse,
                invocation: isRecord(skill.invocation) ? skill.invocation : undefined,
                source: skill.source,
                provider: skill.provider,
                path: typeof skill.path === 'string' && !/^[a-z][a-z0-9+.-]*:\/\//i.test(skill.path) ? skill.path : undefined,
                canUnregister: skill.source === 'runtime' && skill.provider === runtimeProvider && runtimeSkills.has(skill.name),
                // Only a skill in a root this page can write gets the file actions.
                editable: writable.has(skill.source) && root !== undefined,
                rootPath: root?.path,
                shadowed: shadowed.length
                  ? shadowed.map((entry) => ({ source: entry.source, provider: entry.provider, path: entry.path }))
                  : undefined,
              };
            }),
            roots: skillFiles.roots(),
            disabled: skillFiles.disabled(),
          };
          break;
        }
        case 'skills.get': {
          const result = await skillsTool.execute({ ...args, action: 'get' }, exec);
          value = result;
          break;
        }
        case 'skills.register':
          value = await skillWrite('register', args, exec);
          break;
        case 'skills.unregister':
          value = await skillWrite('unregister', args, exec);
          break;
        case 'skills.save':
          value = args.mode === 'create'
            ? await skillFiles.create(args, exec)
            : await skillFiles.update(args, exec);
          break;
        case 'skills.remove':
          value = await skillFiles.remove(args, exec);
          break;
        case 'skills.set-enabled':
          value = await skillFiles.setEnabled(args, exec);
          break;
        case 'skills.reveal':
          value = await skillFiles.reveal(args, exec);
          break;
        default:
          throw new ManagerError('Unknown mcp-skill-manager RPC method');
      }
      return { ok: true, value };
    } catch (error) {
      const known = error instanceof ManagerError || error instanceof DiscoveryError || error instanceof CompatibilityError
        || error instanceof McpConfigError || error instanceof PatchWriteError || error instanceof ToolGuardError
        || error instanceof SkillFileError;
      return {
        ok: false,
        error: {
          code: error instanceof CompatibilityError ? 'MCP_SKILL_MANAGER_INCOMPATIBLE' : 'MCP_SKILL_MANAGER_OPERATION_FAILED',
          message: known ? error.message : 'Host operation failed; check the DSH logs.',
          details: {},
        },
      };
    }
  };

  const rpcMethods = [
    'compatibility.status', 'mcp.discover', 'mcp.create', 'mcp.update', 'mcp.reset', 'mcp.remove', 'mcp.set-enabled',
    'mcp.set-tool-disabled', 'skills.list', 'skills.get', 'skills.register', 'skills.unregister',
    'skills.save', 'skills.remove', 'skills.set-enabled', 'skills.reveal',
  ];

  /** Every write changes executable configuration, so the caller must be the confirming owner session. */
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
            if (MUTATIONS.has(method)) {
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
      disposeToolGuard?.();
      for (const dispose of runtimeSkills.values()) dispose();
      runtimeSkills.clear();
    };
  }, 'mcp-skill-manager tools, settings RPC, and runtime skills');
}
