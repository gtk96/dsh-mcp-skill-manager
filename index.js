import { randomUUID } from 'node:crypto';
import z from '@deepseek-ai/schemastery';

export const name = 'mcp-skill-manager';
export const inject = ['configEditor', 'skills', 'tools'];

class ManagerError extends Error {}

const rpcPrefix = 'mcp-skill-manager.';
export const Config = z.object({
  /** Dot path to the MCP server map in the selected DSH config entry. */
  mcpConfigPath: z.string().default(''),
});

const secretName = /secret|token|password|credential|authorization|api.?key/i;
const forbiddenPathParts = new Set(['__proto__', 'prototype', 'constructor']);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pathParts(path) {
  if (typeof path !== 'string' || !path.trim()) {
    throw new ManagerError('configPath must be a non-empty dot path');
  }
  const parts = path.split('.').map((part) => part.trim());
  if (parts.some((part) => !part || forbiddenPathParts.has(part))) {
    throw new ManagerError('configPath contains an invalid path segment');
  }
  return parts;
}

function getAt(root, parts) {
  let value = root;
  for (const part of parts) {
    if (!isRecord(value)) return undefined;
    value = value[part];
  }
  return value;
}

function updatePath(root, parts, updateLeaf) {
  const next = { ...root };
  let source = root;
  let target = next;
  for (const part of parts.slice(0, -1)) {
    const sourceChild = isRecord(source[part]) ? source[part] : {};
    const targetChild = { ...sourceChild };
    target[part] = targetChild;
    source = sourceChild;
    target = targetChild;
  }
  const leafKey = parts.at(-1);
  const sourceLeaf = isRecord(source[leafKey]) ? source[leafKey] : {};
  target[leafKey] = updateLeaf({ ...sourceLeaf });
  return next;
}

function effectiveConfig(row) {
  return isRecord(row.entry?.options?.config) ? row.entry.options.config : {};
}

function entryKeys(entry) {
  return [entry?.id, entry?.options?.id, entry?.options?.name]
    .filter((value) => typeof value === 'string');
}

function entrySummary(entry) {
  return {
    id: entry.id,
    patchId: entry.options?.id,
    name: entry.options?.name,
  };
}

function redactServer(server) {
  if (!isRecord(server)) return { type: Array.isArray(server) ? 'array' : typeof server };
  return {
    fields: Object.keys(server),
    values: Object.fromEntries(
      Object.entries(server)
        .filter(([key]) => !secretName.test(key))
        .map(([key, value]) => [key, typeof value === 'string' ? '[configured]' : Array.isArray(value) ? '[array]' : isRecord(value) ? '[object]' : value]),
    ),
  };
}

function readMcpCatalog(ctx, config, request) {
  const requestedPath = typeof request.configPath === 'string' && request.configPath.trim()
    ? request.configPath
    : config.mcpConfigPath;
  const parts = typeof requestedPath === 'string' && requestedPath.trim()
    ? pathParts(requestedPath)
    : undefined;
  const entries = ctx.configEditor.configuration().map((row) => {
    const effective = effectiveConfig(row);
    const servers = parts ? getAt(effective, parts) : undefined;
    return {
      entry: entrySummary(row.entry),
      servers: isRecord(servers)
        ? Object.fromEntries(Object.entries(servers).map(([serverName, value]) => [serverName, redactServer(value)]))
        : {},
    };
  });
  return { configPath: parts?.join('.') ?? '', entries };
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
        if (error instanceof ManagerError) throw error;
        throw new ManagerError('Host operation failed; check the DSH logs.');
      }
    },
  };
}

function isSkillName(value) {
  return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new ManagerError(`${label} is required`);
  return value.trim();
}

function skillLookup(exec) {
  return {
    signal: exec.signal,
    scope: exec.agent,
    cwd: exec.agent?.session?.header?.cwd,
  };
}

export function apply(ctx, config = {}) {
  const runtimeSkills = new Map();
  const pendingSkills = new Set();
  const runtimeProvider = `${name}:${randomUUID()}`;
  const mcpTool = tool(
    'dsh_manage_mcp_servers',
    'List, add or update, and remove MCP server records in a DSH configuration entry. Listing redacts configured values. Supply configPath explicitly or configure mcpConfigPath on this plugin.',
    {
      action: { type: 'string', required: true, enum: ['list', 'upsert', 'remove'] },
      entryId: { type: 'string', description: 'Entry id, patch id, or name returned by the list action.' },
      configPath: { type: 'string', description: 'Dot path to the MCP server map, for example the path configured for this plugin.' },
      name: { type: 'string', description: 'MCP server key for upsert or remove.' },
      definition: { type: 'object', additionalProperties: true, description: 'MCP server configuration object for upsert.' },
    },
    async (args, exec) => {
      exec.signal.throwIfAborted();
      const action = requireString(args.action, 'action');
      const configuredPath = typeof args.configPath === 'string' && args.configPath.trim()
        ? args.configPath
        : config.mcpConfigPath;
      const rows = ctx.configEditor.configuration();
      if (action === 'list') {
        const parts = pathParts(configuredPath);
        return {
          action,
          configPath: parts.join('.'),
          entries: rows.map((row) => {
            const servers = getAt(effectiveConfig(row), parts);
            if (!isRecord(servers)) return undefined;
            return {
              entry: entrySummary(row.entry),
              servers: Object.fromEntries(Object.entries(servers).map(([serverName, value]) => [serverName, redactServer(value)])),
            };
          }).filter(Boolean),
        };
      }

      const entryId = requireString(args.entryId, 'entryId');
      const parts = pathParts(configuredPath);
      const matches = rows.filter(({ entry }) => entryKeys(entry).includes(entryId));
      if (matches.length > 1) throw new ManagerError('Multiple config entries match entryId; use the unique entry id');
      const row = matches[0];
      if (!row) throw new ManagerError(`No active config entry matches ${entryId}`);
      const serverName = requireString(args.name, 'name');
      if (forbiddenPathParts.has(serverName)) throw new ManagerError('name is not a valid server key');
      if (action === 'upsert' && !isRecord(args.definition)) {
        throw new ManagerError('definition must be a JSON object');
      }
      if (action !== 'upsert' && action !== 'remove') throw new ManagerError('action must be list, upsert, or remove');

      const inheritedServers = getAt(row.inherited, parts);
      const overrideServers = getAt(row.override, parts);
      const inheritedHasServer = isRecord(inheritedServers) && Object.hasOwn(inheritedServers, serverName);
      const overrideHasServer = isRecord(overrideServers) && Object.hasOwn(overrideServers, serverName);
      if (action === 'remove' && inheritedHasServer && !overrideHasServer) {
        throw new ManagerError(`Cannot remove inherited MCP server ${serverName}; edit its owning config entry instead`);
      }
      if (action === 'remove' && !overrideHasServer) {
        return { action, entryId, configPath: parts.join('.'), name: serverName, changed: false };
      }

      let inheritedRemains = false;
      await ctx.configEditor.edit(row.entry, (current, inherited) => {
        if (action === 'upsert') {
          return updatePath(isRecord(current) ? current : {}, parts, (servers) => {
            servers[serverName] = args.definition;
            return servers;
          });
        }
        if (action === 'remove') {
          const inheritedMap = getAt(inherited, parts);
          inheritedRemains = isRecord(inheritedMap) && Object.hasOwn(inheritedMap, serverName);
          return updatePath(isRecord(current) ? current : {}, parts, (servers) => {
            if (inheritedRemains) servers[serverName] = inheritedMap[serverName];
            else delete servers[serverName];
            return servers;
          });
        }
        throw new ManagerError('action must be list, upsert, or remove');
      });
      return {
        action,
        entryId,
        configPath: parts.join('.'),
        name: serverName,
        changed: true,
        ...(action === 'remove' && inheritedRemains ? { inheritedRemains: true } : {}),
      };
    },
  );
  const disposeMcpTool = ctx.tools.register(mcpTool);

  const skillsTool = tool(
    'dsh_manage_skills',
    'List and read the effective DSH skill catalog, or register and unregister an in-memory runtime skill for this plugin lifetime.',
    {
      action: { type: 'string', required: true, enum: ['list', 'get', 'register', 'unregister'] },
      name: { type: 'string', description: 'Skill name for get, register, or unregister.' },
      description: { type: 'string' },
      content: { type: 'string', description: 'Skill body content for register.' },
      whenToUse: { type: 'string' },
    },
    async (args, exec) => {
      exec.signal.throwIfAborted();
      const action = requireString(args.action, 'action');
      if (action === 'list') {
        const snapshot = await ctx.skills.snapshot(skillLookup(exec));
        return { action, skills: snapshot.skills, complete: snapshot.complete, scope: exec.agent ? 'agent' : 'profile' };
      }
      const skillName = requireString(args.name, 'name');
      if (action === 'get') {
        const skill = await ctx.skills.get(skillName, skillLookup(exec));
        return { action, skill: skill ?? null };
      }
      if (action === 'register') {
        if (!isSkillName(skillName)) {
          throw new ManagerError('name must be a kebab-case skill name');
        }
        if (runtimeSkills.has(skillName) || pendingSkills.has(skillName)) {
          throw new ManagerError(`Runtime skill ${skillName} is already registered by this plugin`);
        }
        const description = requireString(args.description, 'description');
        const content = requireString(args.content, 'content');
        pendingSkills.add(skillName);
        let dispose;
        try {
          const existing = await ctx.skills.snapshot(skillLookup(exec));
          exec.signal.throwIfAborted();
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
          const observed = await ctx.skills.snapshot(skillLookup(exec));
          if (!observed.complete) throw new ManagerError('Skill discovery is incomplete; runtime registration was rolled back');
          const registered = await ctx.skills.get(skillName, skillLookup(exec));
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
          runtimeSkills.set(skillName, dispose);
          return { action, name: skillName, persisted: false };
        } catch (error) {
          dispose?.();
          throw error;
        } finally {
          pendingSkills.delete(skillName);
        }
      }
      if (action === 'unregister') {
        if (pendingSkills.has(skillName)) throw new ManagerError(`Skill ${skillName} is currently being registered`);
        const dispose = runtimeSkills.get(skillName);
        if (!dispose) return { action, name: skillName, changed: false };
        dispose();
        runtimeSkills.delete(skillName);
        return { action, name: skillName, changed: true };
      }
      throw new ManagerError('action must be list, get, register, or unregister');
    },
  );
  const disposeSkillTool = ctx.tools.register(skillsTool);
  const handleRpc = async (method, payload, signal) => {
    try {
      if (payload !== undefined && !isRecord(payload)) {
        throw new ManagerError('RPC arguments must be an object');
      }
      const args = isRecord(payload) ? payload : {};
      signal.throwIfAborted();
      let value;
      switch (method) {
        case 'mcp.catalog':
          value = readMcpCatalog(ctx, config, args);
          break;
        case 'mcp.upsert':
          value = await mcpTool.execute({ ...args, action: 'upsert' }, { signal });
          break;
        case 'mcp.remove':
          value = await mcpTool.execute({ ...args, action: 'remove' }, { signal });
          break;
        case 'skills.list': {
          const result = await skillsTool.execute({ action: 'list' }, { signal });
          value = {
            complete: result.complete,
            scope: result.scope,
            skills: result.skills.map((skill) => ({
              name: skill.name,
              description: skill.description,
              source: skill.source,
              canUnregister: runtimeSkills.has(skill.name),
            })),
          };
          break;
        }
        case 'skills.get':
          value = await skillsTool.execute({ ...args, action: 'get' }, { signal });
          break;
        case 'skills.register':
          value = await skillsTool.execute({ ...args, action: 'register' }, { signal });
          break;
        case 'skills.unregister':
          value = await skillsTool.execute({ ...args, action: 'unregister' }, { signal });
          break;
        default:
          throw new ManagerError('Unknown mcp-skill-manager RPC method');
      }
      return { ok: true, value };
    } catch (error) {
      const knownError = error instanceof ManagerError;
      return {
        ok: false,
        error: {
          code: 'MCP_SKILL_MANAGER_OPERATION_FAILED',
          message: knownError ? error.message : 'Host operation failed; check the DSH logs.',
          details: {},
        },
      };
    }
  };
  const rpcMethods = ['mcp.catalog', 'mcp.upsert', 'mcp.remove', 'skills.list', 'skills.get', 'skills.register', 'skills.unregister'];
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
          const result = await handleRpc(method, message.payload, request.signal);
          return Response.json({ type: 'server-response', rpcId: message.rpcId, result });
        },
      });
    }
    }, 'mcp-skill-manager API routes');
  });

  ctx.effect(function* () {
    yield () => {
      disposeMcpTool();
      disposeSkillTool();
      for (const dispose of runtimeSkills.values()) dispose();
      runtimeSkills.clear();
    };
  }, 'mcp-skill-manager tools, settings RPC, and runtime skills');
}
