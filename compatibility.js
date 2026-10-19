import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
export const testedRuntimeVersions = Object.freeze(['0.2.0-rc.2', '0.2.1-rc.2']);

export class CompatibilityError extends Error {}

export async function readRuntimeVersion() {
  try {
    const runtime = await import('@deepseek-ai/dsh/package.json', { with: { type: 'json' } });
    const version = runtime.default?.version;
    return typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version) ? version : null;
  } catch {
    return null;
  }
}

const hasMethods = (service, names) => names.every((name) => typeof service?.[name] === 'function');

/** Method checks do not execute services or establish their behavioral compatibility. */
export function createCompatibility(ctx, serviceFor, runtimeReader = readRuntimeVersion) {
  async function report(agent) {
    let runtimeVersion = null;
    try { runtimeVersion = await runtimeReader(); } catch { /* An unidentifiable runtime remains read-only. */ }
    if (typeof runtimeVersion !== 'string') runtimeVersion = null;
    const versionStatus = runtimeVersion === null ? 'unknown'
      : testedRuntimeVersions.includes(runtimeVersion) ? 'tested' : 'unverified';
    const configEditor = ctx.get('configEditor');
    const scopedService = (name) => {
      try { return serviceFor(name, agent); } catch { return undefined; }
    };
    const skills = scopedService('skills');
    const tools = scopedService('tools');
    const capabilities = {
      mcpCatalog: hasMethods(configEditor, ['configuration']),
      mcpDiscovery: hasMethods(tools, ['schemas', 'get']),
      skillCatalog: hasMethods(skills, ['snapshot', 'get']),
      configEdit: hasMethods(configEditor, ['configuration', 'edit']),
      runtimeSkills: hasMethods(skills, ['snapshot', 'get']) && hasMethods(ctx.get('skills'), ['register']),
      sessionSelection: hasMethods(ctx.get('agents'), ['list', 'get']),
      presetScope: hasMethods(ctx.get('agentPresets'), ['serviceFor', 'composedPreset']),
      hookCatalog: hasMethods(configEditor, ['configuration']),
      hookRuntime: hasMethods(ctx.get('shell'), ['resolve', 'execute'])
        && hasMethods(ctx.get('sessionProjections'), ['stateOf'])
        && hasMethods(ctx.get('workingDirectory'), ['get', 'ensure']),
    };
    const tested = versionStatus === 'tested';
    return {
      protocolVersion: 1,
      pluginVersion: manifest.version,
      runtimeVersion,
      versionStatus,
      testedRuntimeVersions: [...testedRuntimeVersions],
      installRange: manifest.peerDependencies['@deepseek-ai/dsh'],
      capabilities,
      writes: { mcp: tested && capabilities.configEdit, skills: tested && capabilities.runtimeSkills, hooks: runtimeVersion === '0.2.1-rc.2' && capabilities.configEdit },
      checks: 'method-presence-only',
    };
  }

  async function assertWrite(kind, signal, agent) {
    const status = await report(agent);
    signal?.throwIfAborted();
    if (!status.writes[kind]) {
      const reason = status.versionStatus === 'unknown' ? '无法识别 DSH 运行版本'
        : status.versionStatus === 'unverified' ? `DSH ${status.runtimeVersion} 未通过本插件的版本回归`
        : '缺少此操作所需的 DSH 接口';
      throw new CompatibilityError(`${reason}；当前操作只读，写入已阻止。请查看兼容检查。`);
    }
  }

  return { report, assertWrite };
}
