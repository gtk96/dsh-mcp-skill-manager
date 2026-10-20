/**
 * File-system skill authoring.
 *
 * The runtime's `skills` service only advertises what providers discover; the official filesystem
 * provider reads `<root>/<name>/SKILL.md` (or a flat `<root>/<name>.md`) and watches its roots, so
 * writing those files is enough for a change to take effect without restarting DSH. There is no write
 * API to call instead, so this module owns the files.
 *
 * Nothing here unlinks: removing a skill moves it under `<dshHome>/.trash/skills`, and disabling
 * renames the entry point so discovery skips it, which is reversible from the same page.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { writeTextAtomic } from './mcp-write.js';

export class SkillFileError extends Error {}

/** The runtime's public name grammar; a file outside it is ignored on load without an error. */
export const isSkillName = (name) => typeof name === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);

const ENTRY_FILE = 'SKILL.md';
const DISABLED_SUFFIX = '.disabled';
/** Keys this plugin owns, written in this order. */
const OWNED_KEYS = ['name', 'description', 'whenToUse', 'disable-model-invocation', 'user-invocable'];
/** Names the runtime rejects outright — a file carrying one is dropped, so never emit them. */
const LEGACY_KEYS = ['disableModelInvocation', 'modelInvocable', 'userInvocable'];
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** The filesystem provider's resolved config, read from the Loader entry that owns it. */
function providerConfig(ctx) {
  let entries;
  try {
    entries = ctx.loader?.entries?.() ?? [];
  } catch {
    return {};
  }
  for (const entry of entries) {
    const name = entry?.options?.name;
    if (typeof name === 'string' && name.startsWith('@deepseek-ai/dsh-skill-filesystem')) {
      return entry.options.config ?? {};
    }
  }
  return {};
}

/**
 * Writable skill roots, in the order discovery ranks them.
 *
 * Project roots are omitted on purpose: they depend on the session's cwd, which a settings page has
 * no way to pin down. Bundled skills are read-only by definition.
 * @param {object} ctx Host context.
 */
export function resolveSkillRoots(ctx) {
  const config = providerConfig(ctx);
  const dshHome = nonEmpty(config.dshHome) ?? (nonEmpty(process.env.DSH_HOME) ?? join(homedir(), '.dsh'));
  const agentsHome = nonEmpty(config.agentsHome)
    ?? (nonEmpty(process.env.DSH_AGENTS_HOME) ?? join(homedir(), '.agents'));
  const custom = Array.isArray(config.customSkillDirs) ? config.customSkillDirs.filter(nonEmpty) : [];
  const roots = [
    ...custom.map((path) => ({ source: 'custom', path, writable: true })),
  ];
  if (config.includeDefaultRoots !== false) {
    roots.push({ source: 'user-dsh', path: join(dshHome, 'skills'), writable: true });
    roots.push({ source: 'user-agents', path: join(agentsHome, 'skills'), writable: true });
  }
  return { dshHome, agentsHome, roots };
}

/** Split a skill file into its frontmatter object and body; undefined when the file has neither. */
export function parseSkillText(text) {
  const match = FRONTMATTER.exec(text);
  if (!match) return undefined;
  let data;
  try {
    data = parseYaml(match[1]);
  } catch {
    return undefined;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
  return { data, body: text.slice(match[0].length) };
}

/**
 * Render one skill file, keeping any frontmatter keys this plugin does not own.
 *
 * The caller sends the whole form, so an owned key that is absent or empty is dropped rather than
 * carried over from the file: clearing a field in the page must clear it on disk.
 * @param {{ name: string, description: string, whenToUse?: string, modelInvocable?: boolean,
 *   userInvocable?: boolean, content?: string }} input
 * @param {Record<string, unknown>} [existing] Frontmatter already on the file.
 */
export function renderSkillFile(input, existing = {}) {
  const data = {
    name: input.name,
    description: input.description,
  };
  const whenToUse = nonEmpty(input.whenToUse);
  if (whenToUse !== undefined) data.whenToUse = whenToUse;
  if (input.modelInvocable === false) data['disable-model-invocation'] = true;
  if (input.userInvocable === false) data['user-invocable'] = false;
  for (const [key, value] of Object.entries(existing)) {
    if (OWNED_KEYS.includes(key) || LEGACY_KEYS.includes(key)) continue;
    data[key] = value;
  }
  const front = stringifyYaml(data, { lineWidth: 0 }).trimEnd();
  return `---\n${front}\n---\n\n${String(input.content ?? '').trim()}\n`;
}

function bundleDir(root, name) {
  return join(root.path, name);
}

/** The active entry point for a skill, as a directory bundle first and a flat file second. */
function locate(root, name) {
  const bundle = join(root.path, name, ENTRY_FILE);
  if (existsSync(bundle)) return { kind: 'bundle', file: bundle, directory: join(root.path, name) };
  const flat = join(root.path, `${name}.md`);
  if (existsSync(flat)) return { kind: 'flat', file: flat, directory: root.path };
  return undefined;
}

function locateDisabled(root, name) {
  const bundle = join(root.path, name, ENTRY_FILE) + DISABLED_SUFFIX;
  if (existsSync(bundle)) return { kind: 'bundle', file: bundle, directory: join(root.path, name) };
  const flat = join(root.path, `${name}.md`) + DISABLED_SUFFIX;
  if (existsSync(flat)) return { kind: 'flat', file: flat, directory: root.path };
  return undefined;
}

/** Every skill this page hid, so the client can offer the inverse action. */
export function disabledSkills(ctx) {
  const { roots } = resolveSkillRoots(ctx);
  const listed = [];
  for (const root of roots) {
    let entries;
    try {
      entries = readdirSync(root.path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const file = entry.isDirectory()
        ? join(root.path, entry.name, ENTRY_FILE + DISABLED_SUFFIX)
        : entry.isFile() && entry.name.endsWith('.md' + DISABLED_SUFFIX)
          ? join(root.path, entry.name)
          : undefined;
      if (file === undefined || !existsSync(file)) continue;
      let parsed;
      try {
        parsed = parseSkillText(readFileSync(file, 'utf8'));
      } catch {
        continue;
      }
      const name = parsed?.data?.name;
      if (!isSkillName(name)) continue;
      listed.push({
        name,
        description: typeof parsed.data.description === 'string' ? parsed.data.description : undefined,
        root: root.source,
        rootPath: root.path,
        path: file,
      });
    }
  }
  return listed;
}

/** The OS command that reveals one file; kept pure so the platform branches stay testable. */
export function revealCommand(platform, target) {
  if (platform === 'darwin') return ['open', ['-R', target]];
  if (platform === 'win32') return ['explorer', ['/select,', target]];
  return ['xdg-open', [dirname(target)]];
}

/**
 * @param {object} ctx Host context.
 * @param {object} compatibility Write gate.
 */
export function createSkillFiles(ctx, compatibility) {
  /** Writables in discovery order, without the internals `resolveSkillRoots` also returns. */
  function roots() {
    return resolveSkillRoots(ctx).roots.map(({ source, path }) => ({ source, path }));
  }

  /**
   * The known root that holds `file`. Several custom directories share the source name `custom`, so a
   * root is addressed by its path: the longest matching prefix wins.
   */
  function rootOf(file) {
    if (typeof file !== 'string' || !file) return undefined;
    const target = resolve(file);
    return roots()
      .filter((root) => target.startsWith(resolve(root.path) + sep))
      .sort((left, right) => right.path.length - left.path.length)[0];
  }

  function rootFor(rootPath) {
    const wanted = nonEmpty(rootPath);
    if (wanted === undefined) throw new SkillFileError('需要指定 Skill 目录。');
    const target = resolve(wanted);
    const root = roots().find((candidate) => resolve(candidate.path) === target);
    if (root === undefined) throw new SkillFileError(`未知的 Skill 目录：${wanted}`);
    return root;
  }

  function requireName(value) {
    const name = nonEmpty(value);
    if (name === undefined) throw new SkillFileError('需要指定 Skill 名。');
    if (!isSkillName(name)) throw new SkillFileError('Skill 名必须是 kebab-case：小写字母与数字，用连字符分隔。');
    return name;
  }

  function requireDescription(value) {
    const description = nonEmpty(value);
    if (description === undefined) throw new SkillFileError('需要填写描述：运行时靠它判断何时使用这个 Skill。');
    return description;
  }

  /** Options the runtime parses; omitted means "use the defaults", not "write false". */
  function options(args) {
    return {
      whenToUse: nonEmpty(args.whenToUse),
      modelInvocable: args.modelInvocable === false ? false : true,
      userInvocable: args.userInvocable === false ? false : true,
    };
  }

  return {
    roots,
    rootOf,
    disabled: () => disabledSkills(ctx),

    /** @param {object} args */
    async create(args, exec) {
      await compatibility.assertWrite('skillFiles', exec.signal);
      const name = requireName(args.name);
      const description = requireDescription(args.description);
      const root = rootFor(args.root);
      if (locate(root, name) !== undefined || locateDisabled(root, name) !== undefined) {
        throw new SkillFileError(`已存在同名 Skill：${name}`);
      }
      exec.signal.throwIfAborted();
      mkdirSync(bundleDir(root, name), { recursive: true });
      const file = join(bundleDir(root, name), ENTRY_FILE);
      await writeTextAtomic(file, renderSkillFile({ name, description, ...options(args), content: args.content }), { mode: 0o644 });
      return { action: 'create', name, root: root.source, rootPath: root.path, path: file };
    },

    /** @param {object} args */
    async update(args, exec) {
      await compatibility.assertWrite('skillFiles', exec.signal);
      const name = requireName(args.name);
      const description = requireDescription(args.description);
      const root = rootFor(args.root);
      const found = locate(root, name);
      if (found === undefined) throw new SkillFileError(`找不到可编辑的 Skill：${name}`);
      const existing = parseSkillText(readFileSync(found.file, 'utf8'));
      const content = args.content === undefined ? existing?.body : args.content;
      exec.signal.throwIfAborted();
      await writeTextAtomic(
        found.file,
        renderSkillFile({ name, description, ...options(args), content }, existing?.data),
        { mode: 0o644 },
      );
      return { action: 'update', name, root: root.source, rootPath: root.path, path: found.file };
    },

    /** Move the skill into `<dshHome>/.trash/skills`; nothing is unlinked. */
    async remove(args, exec) {
      await compatibility.assertWrite('skillFiles', exec.signal);
      const name = requireName(args.name);
      const root = rootFor(args.root);
      const found = locate(root, name) ?? locateDisabled(root, name);
      if (found === undefined) throw new SkillFileError(`找不到要删除的 Skill：${name}`);
      exec.signal.throwIfAborted();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const target = join(resolveSkillRoots(ctx).dshHome, '.trash', 'skills', `${name}-${stamp}`);
      mkdirSync(dirname(target), { recursive: true });
      renameSync(found.kind === 'bundle' ? found.directory : found.file, target);
      return { action: 'remove', name, root: root.source, rootPath: root.path, trashed: target };
    },

    /** Hide or restore a skill by renaming its entry point; discovery skips a missing `SKILL.md`. */
    async setEnabled(args, exec) {
      await compatibility.assertWrite('skillFiles', exec.signal);
      const name = requireName(args.name);
      const root = rootFor(args.root);
      const active = locate(root, name);
      const disabled = locateDisabled(root, name);
      if (args.enabled === true) {
        if (active !== undefined) return { action: 'set-enabled', name, root: root.source, rootPath: root.path, enabled: true, changed: false };
        if (disabled === undefined) throw new SkillFileError(`找不到已停用的 Skill：${name}`);
        renameSync(disabled.file, disabled.file.slice(0, -DISABLED_SUFFIX.length));
        return { action: 'set-enabled', name, root: root.source, rootPath: root.path, enabled: true, changed: true };
      }
      if (disabled !== undefined) return { action: 'set-enabled', name, root: root.source, rootPath: root.path, enabled: false, changed: false };
      if (active === undefined) throw new SkillFileError(`找不到要停用的 Skill：${name}`);
      renameSync(active.file, active.file + DISABLED_SUFFIX);
      return { action: 'set-enabled', name, root: root.source, rootPath: root.path, enabled: false, changed: true };
    },

    /** Reveal one skill in the OS file manager; only paths inside a known root are accepted. */
    async reveal(args, exec) {
      await compatibility.assertWrite('skillFiles', exec.signal);
      const target = resolve(String(args.path ?? ''));
      const inside = resolveSkillRoots(ctx).roots
        .some((root) => target === resolve(root.path) || target.startsWith(resolve(root.path) + sep));
      if (!inside) throw new SkillFileError('只能定位到 Skill 目录内的文件。');
      const [command, argv] = revealCommand(process.platform, target);
      exec.signal.throwIfAborted();
      spawn(command, argv, { detached: true, stdio: 'ignore' }).unref();
      return { action: 'reveal', path: target };
    },
  };
}
