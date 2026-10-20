import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** Runtime versions this plugin has an isolated regression for. */
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

/**
 * Version and capability gate for writes. Method checks prove presence, not behavior, so a version
 * outside the tested list stays read-only regardless of what it appears to expose.
 */
export function createCompatibility(ctx, runtimeReader = readRuntimeVersion) {
  async function report() {
    let runtimeVersion = null;
    try { runtimeVersion = await runtimeReader(); } catch { /* An unidentifiable runtime stays read-only. */ }
    if (typeof runtimeVersion !== 'string') runtimeVersion = null;
    const versionStatus = runtimeVersion === null ? 'unknown'
      : testedRuntimeVersions.includes(runtimeVersion) ? 'tested' : 'unverified';
    const configEditor = ctx.get('configEditor');
    const skills = ctx.get('skills');
    const tools = ctx.get('tools');
    const capabilities = {
      mcpCatalog: hasMethods(configEditor, ['configuration']),
      configEdit: hasMethods(configEditor, ['configuration', 'edit']),
      runtimeSkills: hasMethods(skills, ['snapshot', 'get', 'register']),
      patchWrite: typeof ctx.get('profileContext')?.patchPath === 'string',
      // A profile directory is where the deny list persists; without one the guard would forget on restart.
      toolGuard: hasMethods(tools, ['guard']) && typeof ctx.get('profileContext')?.dir === 'string',
      toolGuardState: typeof ctx.get('profileContext')?.dir === 'string',
    };
    const tested = versionStatus === 'tested';
    const writes = {
      mcp: tested && capabilities.configEdit && capabilities.patchWrite,
      // The guard is a public `tools` method, so it needs no config editor — only the tested version and a profile.
      guards: tested && capabilities.toolGuard,
      skills: tested && capabilities.runtimeSkills,
    };
    const reason = versionStatus === 'unknown' ? '无法识别 DSH 运行版本'
      : versionStatus === 'unverified' ? `DSH ${runtimeVersion} 未通过本插件的版本回归`
        : !capabilities.configEdit ? '缺少配置编辑接口'
          : !capabilities.patchWrite ? '该 Profile 没有可写的 patch 文件'
            : null;
    return {
      pluginVersion: manifest.version,
      runtimeVersion,
      versionStatus,
      testedRuntimeVersions: [...testedRuntimeVersions],
      capabilities,
      writes,
      reason,
      checks: 'method-presence-only',
    };
  }

  async function assertWrite(kind, signal) {
    const status = await report();
    signal?.throwIfAborted();
    if (!status.writes[kind]) {
      const specific = kind === 'skills' && status.reason === null ? '缺少 Runtime Skill 接口'
        : kind === 'guards' && status.reason === null
          ? status.capabilities.toolGuard ? '该 Profile 目录不可写，停用状态无法保存' : '当前 DSH 未提供 tools.guard 接口'
          : status.reason;
      throw new CompatibilityError(`${specific ?? '当前 DSH 版本不允许写入'}；操作已阻止。`);
    }
  }

  return { report, assertWrite };
}