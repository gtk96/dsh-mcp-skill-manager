const MCP_CLIENT = '@deepseek-ai/dsh-mcp-client';

export class DiscoveryError extends Error {}

export function createDiscovery(ctx) {
  const optional = (name) => ctx.get(name);
  const serviceFor = (name, agent) => {
    const presets = optional('agentPresets');
    return (agent && presets?.serviceFor(agent, name)) || optional(name);
  };
  const presetOf = (agent) => agent
    ? optional('agentPresets')?.composedPreset(agent.ctx) ?? agent.session?.header?.agentPreset
    : undefined;

  function view(args = {}, fallbackAgent) {
    if (args.sessionId !== undefined && typeof args.sessionId !== 'string') {
      throw new DiscoveryError('sessionId must be a string');
    }
    const explicit = typeof args.sessionId === 'string';
    const sessionId = explicit ? args.sessionId.trim() : fallbackAgent?.id ?? '';
    const agent = explicit
      ? (sessionId ? optional('agents')?.get(sessionId) : undefined)
      : fallbackAgent;
    if (sessionId && !agent) {
      throw new DiscoveryError('Selected session has no live Agent; open that session and refresh. Its global view is not used as a substitute.');
    }
    return {
      agent,
      context: {
        sessionId,
        kind: agent ? 'agent' : 'profile',
        cwd: agent?.session?.header?.cwd ?? null,
        preset: presetOf(agent) ?? null,
      },
    };
  }

  function assertCurrent(target, signal) {
    signal?.throwIfAborted();
    const agents = optional('agents');
    if (target.agent && agents && agents.get(target.context.sessionId) !== target.agent) {
      throw new DiscoveryError('Selected Agent changed or was unloaded; refresh the session list.');
    }
    if (target.agent && (presetOf(target.agent) ?? null) !== target.context.preset) {
      throw new DiscoveryError('Selected Agent preset changed; refresh this view.');
    }
  }

  async function contexts(signal) {
    signal.throwIfAborted();
    const agents = optional('agents')?.list() ?? [];
    const live = new Map(agents.map((agent) => [agent.id, agent]));
    const query = optional('sessionQuery');
    const records = query
      ? await query.listSessions(signal)
      : (optional('sessions')?.list() ?? []).map((session) => ({ header: session.header }));
    signal.throwIfAborted();
    const headers = new Map(records.map((record) => [record.header.id, record.header]));
    for (const agent of agents) headers.set(agent.id, agent.session?.header ?? { id: agent.id });
    return {
      contexts: [...headers.values()].map((header) => ({
        sessionId: header.id,
        cwd: header.cwd ?? null,
        preset: live.has(header.id) ? presetOf(live.get(header.id)) ?? null : header.agentPreset ?? null,
        live: live.has(header.id),
      })),
    };
  }

  async function mcp(target, signal) {
    assertCurrent(target, signal);
    const warnings = [];
    let tools = [];
    let toolsAvailable = false;
    const configured = [];
    const toolService = serviceFor('tools', target.agent);
    const rootTools = optional('tools');
    try {
      if (typeof toolService?.schemas !== 'function') throw new Error('unavailable');
      tools = toolService.schemas(target.agent).map(({ name }) => {
        const definition = toolService.get?.(name, target.agent);
        const globalDefinition = rootTools?.get?.(name);
        return {
          name,
          definitionView: !target.agent ? 'profile'
            : !definition ? 'unknown'
            : definition === globalDefinition ? 'same-as-profile' : 'session-specific',
        };
      });
      toolsAvailable = true;
    } catch {
      warnings.push('所选作用域的工具目录读取失败，不能据此判断 MCP 是否存在。');
    }
    try {
      for (const { entry } of ctx.configEditor.configuration()) {
        if (entry.options?.name !== MCP_CLIENT) continue;
        configured.push({
          kind: 'profile-config',
          entryId: entry.id,
          patchId: entry.options.id,
          serverName: typeof entry.options.config?.serverName === 'string' ? entry.options.config.serverName : null,
          moduleName: MCP_CLIENT,
          fiberState: typeof entry.fiber?.state === 'number' ? entry.fiber.state : null,
          connectionState: 'unknown',
        });
      }
    } catch {
      warnings.push('Profile 中的原生 MCP 配置条目读取失败。');
    }
    const presets = optional('agentPresets');
    if (target.context.preset && presets) {
      try {
        const inventory = await presets.compositionInventory();
        for (const preset of inventory) {
          if (preset.id !== target.context.preset) continue;
          for (const row of preset.rows) {
            if (row.moduleName !== MCP_CLIENT) continue;
            configured.push({
              kind: 'preset-config',
              preset: preset.id,
              entryId: row.entryId,
              moduleName: MCP_CLIENT,
              enabled: row.enabled,
              fiberState: typeof row.fiberState === 'number' ? row.fiberState : null,
              connectionState: 'unknown',
            });
          }
        }
      } catch {
        warnings.push('所选预设中的 MCP 配置条目读取失败。');
      }
    }
    assertCurrent(target, signal);
    return {
      context: target.context,
      toolsAvailable,
      complete: warnings.length === 0,
      provenanceComplete: false,
      connectionStateSupported: false,
      configured,
      candidates: tools.filter(({ name }) => name.startsWith('mcp__')).map((tool) => ({
        ...tool,
        evidence: 'name-convention',
        connectionState: 'unknown',
      })),
      tools,
      warnings,
    };
  }

  return { view, contexts, mcp, assertCurrent, serviceFor };
}
