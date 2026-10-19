window.__ModuleLoader__.load({ id: "dsh-mcp-skill-manager", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
const React = require("react");
const h = React.createElement;

const css = `
.dsh-msm-page{display:flex;flex-direction:column;gap:16px;max-width:920px;color:var(--dsw-alias-label-primary,#1f2329);}
.dsh-msm-page *{box-sizing:border-box;}
.dsh-msm-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;}
.dsh-msm-title{margin:0;font-size:22px;font-weight:600;}
.dsh-msm-subtitle{margin:6px 0 0;color:var(--dsw-alias-label-secondary,#59636e);font-size:13px;line-height:1.5;}
.dsh-msm-tabs{display:flex;gap:8px;border-bottom:1px solid var(--dsw-alias-border-l1,#d9dde3);}
.dsh-msm-tab{border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,#59636e);cursor:pointer;padding:9px 12px;font:inherit;}
.dsh-msm-tab[aria-selected="true"]{border-bottom-color:var(--dsw-alias-brand-primary,#4677f5);color:var(--dsw-alias-label-primary,#1f2329);font-weight:600;}
.dsh-msm-panel{display:flex;flex-direction:column;gap:14px;}
.dsh-msm-row{display:flex;align-items:flex-end;gap:10px;}
.dsh-msm-field{display:flex;flex:1;flex-direction:column;gap:5px;min-width:0;}
.dsh-msm-label{color:var(--dsw-alias-label-primary,#1f2329);font-size:13px;font-weight:500;}
.dsh-msm-hint,.dsh-msm-muted{color:var(--dsw-alias-label-secondary,#59636e);font-size:12px;line-height:1.5;}
.dsh-msm-input,.dsh-msm-select,.dsh-msm-textarea{width:100%;border:1px solid var(--dsw-alias-border-l2,#cfd5dd);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2329);padding:8px 10px;font:inherit;font-size:13px;}
.dsh-msm-input:focus,.dsh-msm-select:focus,.dsh-msm-textarea:focus{outline:2px solid var(--dsw-alias-brand-primary,#4677f5);outline-offset:1px;}
.dsh-msm-textarea{min-height:140px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;line-height:1.5;}
.dsh-msm-textarea-short{min-height:72px;}
.dsh-msm-button{border:1px solid var(--dsw-alias-border-l2,#cfd5dd);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2329);cursor:pointer;padding:8px 12px;font:inherit;font-size:13px;white-space:nowrap;}
.dsh-msm-button:hover{border-color:var(--dsw-alias-brand-primary,#4677f5);}
.dsh-msm-button-primary{border-color:var(--dsw-alias-brand-primary,#4677f5);background:var(--dsw-alias-brand-primary,#4677f5);color:#fff;}
.dsh-msm-button-danger{color:var(--dsw-alias-state-error-primary,#d1242f);}
.dsh-msm-button:disabled{cursor:not-allowed;opacity:.55;}
.dsh-msm-card{display:flex;flex-direction:column;gap:10px;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);padding:12px;}
.dsh-msm-card-header{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.dsh-msm-card-title{margin:0;font-size:14px;font-weight:600;overflow-wrap:anywhere;}
.dsh-msm-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
.dsh-msm-pre{max-height:180px;overflow:auto;margin:0;border-radius:6px;background:var(--dsw-alias-bg-layer-2,#f4f6f8);padding:10px;color:var(--dsw-alias-label-secondary,#59636e);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;}
.dsh-msm-list{display:flex;flex-direction:column;gap:9px;}
.dsh-msm-notice{border-radius:6px;background:var(--dsw-alias-bg-layer-2,#f4f6f8);padding:9px 11px;color:var(--dsw-alias-label-secondary,#59636e);font-size:13px;line-height:1.5;}
.dsh-msm-error{border:1px solid var(--dsw-alias-state-error-primary,#d1242f);color:var(--dsw-alias-state-error-primary,#d1242f);}
.dsh-msm-success{color:var(--dsw-alias-state-success-primary,#18864b);}
.dsh-msm-form{display:flex;flex-direction:column;gap:11px;border-top:1px solid var(--dsw-alias-border-l1,#d9dde3);padding-top:13px;}
.dsh-msm-empty{padding:14px;border:1px dashed var(--dsw-alias-border-l2,#cfd5dd);border-radius:8px;color:var(--dsw-alias-label-secondary,#59636e);font-size:13px;}
@media(max-width:680px){.dsh-msm-header,.dsh-msm-row{align-items:stretch;flex-direction:column}.dsh-msm-card-header{align-items:flex-start;flex-direction:column}}
`;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorText(error) {
  return error && typeof error.message === "string" ? error.message : "操作失败，请稍后重试。";
}

function createManagerPage(connection) {
async function requestHost(method, args) {
  const result = await connection.rpc.call("/api", "mcp-skill-manager." + method, args ?? {});
  if (!isRecord(result) || typeof result.ok !== "boolean") {
    throw new Error("Host RPC 返回格式无效，请检查插件与 DSH 的版本兼容性。");
  }
  if (result.ok !== true) throw new Error(result.error && result.error.message || "Host 操作失败。");
  return result.value;
}

function Field(props) {
  return h("label", { className: "dsh-msm-field" },
    h("span", { className: "dsh-msm-label" }, props.label),
    props.children,
    props.hint ? h("span", { className: "dsh-msm-hint" }, props.hint) : null);
}

function ManagerPage() {
  const sessionId = "";
  const [writeCount, setWriteCount] = React.useState(0);
  const compatibilityRequest = React.useRef(0);
  const [compatibility, setCompatibility] = React.useState(null);
  const [compatibilityBusy, setCompatibilityBusy] = React.useState(true);
  const [compatibilityError, setCompatibilityError] = React.useState("");
  const testedVersion = compatibility?.versionStatus === "tested" && compatibility.testedRuntimeVersions.includes(compatibility.runtimeVersion);
  const canEditMcp = testedVersion && compatibility?.capabilities?.configEdit === true && compatibility?.writes?.mcp === true;
  const canEditSkills = testedVersion && compatibility?.capabilities?.runtimeSkills === true && compatibility?.writes?.skills === true;
  const [runtimeCatalog, setRuntimeCatalog] = React.useState(null);
  const [runtimeBusy, setRuntimeBusy] = React.useState(true);
  const [runtimeError, setRuntimeError] = React.useState("");
  const [toolFilter, setToolFilter] = React.useState("");
  const [nativeBusy, setNativeBusy] = React.useState(false);
  const [nativeError, setNativeError] = React.useState("");
  const [nativeNotice, setNativeNotice] = React.useState("");
  /** Draft values per MCP entry, and which entries have their editor expanded. */
  const [mcpDrafts, setMcpDrafts] = React.useState({});
  const [mcpOpen, setMcpOpen] = React.useState({});
  const canAddNative = canEditMcp && !nativeBusy && writeCount === 0;
  const runtimeRequest = React.useRef(0);
  const skillRequest = React.useRef(0);
  const bodyRequest = React.useRef(0);
  const catalogGeneration = React.useRef(0);
  const [catalogRevision, setCatalogRevision] = React.useState(0);
  const [tab, setTab] = React.useState("mcp");
  const [skills, setSkills] = React.useState([]);
  const [skillsBusy, setSkillsBusy] = React.useState(true);
  const [skillsComplete, setSkillsComplete] = React.useState(true);
  const [skillsError, setSkillsError] = React.useState("");
  const [skillsNotice, setSkillsNotice] = React.useState("");
  const [selectedSkill, setSelectedSkill] = React.useState(null);
  const [unregisterName, setUnregisterName] = React.useState("");
  const [skillFormOpen, setSkillFormOpen] = React.useState(false);
  const [skillName, setSkillName] = React.useState("");
  const [skillDescription, setSkillDescription] = React.useState("");
  const [skillWhenToUse, setSkillWhenToUse] = React.useState("");
  const [skillContent, setSkillContent] = React.useState("");
  const hookRequest = React.useRef(0);
  const hookWriteLock = React.useRef(false);
  const [hooksCatalog, setHooksCatalog] = React.useState(null);
  const [hooksBusy, setHooksBusy] = React.useState(false);
  const [hooksError, setHooksError] = React.useState("");
  const [hooksNotice, setHooksNotice] = React.useState("");
  const [hookFormOpen, setHookFormOpen] = React.useState(false);
  const [hookEditing, setHookEditing] = React.useState(null);
  const [hookName, setHookName] = React.useState("");
  const [hookEvent, setHookEvent] = React.useState("SessionStart");
  const [hookMatcher, setHookMatcher] = React.useState("");
  const [hookCommand, setHookCommand] = React.useState("");
  const [hookTimeout, setHookTimeout] = React.useState("30");
  const [hookConfirm, setHookConfirm] = React.useState(null);
  const hookEvents = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "SubagentStart", "SubagentStop"];
  const canEditHooks = compatibility?.runtimeVersion === "0.2.1-rc.2"
    && compatibility?.writes?.hooks === true && hooksCatalog?.writable === true;
  const hooksLocked = hooksBusy || hookWriteLock.current || writeCount > 0;
  const hasMatcher = (event) => event !== "UserPromptSubmit" && event !== "Stop";

  function callHost(method, args = {}) {
    return requestHost(method, { ...args, sessionId });
  }

  function checkContext(result) {
    if (result?.context?.sessionId !== sessionId) throw new Error("返回的会话上下文不匹配，请确认 Host 与 Client 使用同一插件版本。");
  }

  async function refreshCompatibility() {
    const requestId = ++compatibilityRequest.current;
    setCompatibility(null);
    setCompatibilityBusy(true);
    setCompatibilityError("");
    setSkillFormOpen(false);
    setUnregisterName("");
    try {
      const result = await callHost("compatibility.status");
      if (requestId !== compatibilityRequest.current) return;
      if (!isRecord(result) || result.protocolVersion !== 1 || typeof result.pluginVersion !== "string"
        || !(result.runtimeVersion === null || typeof result.runtimeVersion === "string")
        || !["tested", "unverified", "unknown"].includes(result.versionStatus)
        || !Array.isArray(result.testedRuntimeVersions) || !result.testedRuntimeVersions.every((version) => typeof version === "string")
        || !isRecord(result.capabilities) || !Object.values(result.capabilities).every((value) => typeof value === "boolean")
        || !isRecord(result.writes) || typeof result.writes.mcp !== "boolean" || typeof result.writes.skills !== "boolean"
        || (result.writes.hooks !== undefined && typeof result.writes.hooks !== "boolean")
        || (result.capabilities.hookCatalog !== undefined && typeof result.capabilities.hookCatalog !== "boolean")
        || (result.capabilities.hookRuntime !== undefined && typeof result.capabilities.hookRuntime !== "boolean")) {
        throw new Error("兼容检查协议不匹配，请确认 Host 与 Client 插件版本一致；写入已禁用。");
      }
      checkContext(result);
      setCompatibility(result);
    } catch (error) {
      if (requestId === compatibilityRequest.current) setCompatibilityError(errorText(error));
    } finally {
      if (requestId === compatibilityRequest.current) setCompatibilityBusy(false);
    }
  }

  async function refreshHooks(fromWrite = false) {
    if ((!fromWrite && hookWriteLock.current) || (!fromWrite && writeCount > 0)) return;
    const requestId = ++hookRequest.current;
    setHooksBusy(true);
    setHooksCatalog(null);
    setHooksError("");
    setHookConfirm(null);
    if (!fromWrite) { setHookFormOpen(false); setHookEditing(null); }
    try {
      const result = await callHost("hooks.list");
      if (requestId !== hookRequest.current) return;
      const validRevision = (revision) => typeof revision === "string" && revision.trim().length > 0;
      if (!isRecord(result) || typeof result.writable !== "boolean" || !Array.isArray(result.events)
        || result.events.length !== hookEvents.length || result.events.some((event) => !hookEvents.includes(event))
        || new Set(result.events).size !== hookEvents.length || !Array.isArray(result.rules)
        || result.rules.some((rule) => !isRecord(rule) || typeof rule.name !== "string" || !rule.name
          || !hookEvents.includes(rule.event) || typeof rule.enabled !== "boolean"
          || typeof rule.commandConfigured !== "boolean" || !validRevision(rule.revision)
          || !Number.isInteger(rule.timeoutSec) || rule.timeoutSec < 1 || rule.timeoutSec > 600
          || (rule.matcher !== undefined && typeof rule.matcher !== "string")
          || (rule.command !== undefined))
        || !isRecord(result.runtime) || !["disabled", "loading", "active", "failed", "unavailable"].includes(result.runtime.phase)
        || !Number.isSafeInteger(result.runtime.enabledCount) || result.runtime.enabledCount < 0
        || (result.runtime.error !== undefined && typeof result.runtime.error !== "string")) {
        throw new Error("Hook 目录返回格式无效，当前写入已禁用。");
      }
      if (result.context?.kind !== "profile" || result.context.sessionId !== "") throw new Error("Hook 目录上下文不匹配，当前写入已禁用。");
      checkContext(result);
      setHooksCatalog(result);
      return true;
    } catch (error) {
      if (requestId === hookRequest.current) {
        setHooksCatalog(null);
        setHooksError(errorText(error));
      }
      return false;
    } finally {
      if (requestId === hookRequest.current) setHooksBusy(false);
    }
  }

  function editHook(rule) {
    if (!canEditHooks || hooksLocked) return;
    setHookEditing(rule);
    setHookName(rule.name);
    setHookEvent(rule.event);
    setHookMatcher(rule.matcher || "");
    setHookTimeout(String(rule.timeoutSec));
    setHookCommand("");
    setHookConfirm(null);
    setHooksError("");
    setHookFormOpen(true);
  }

  function createHook() {
    if (!canEditHooks || hooksLocked) return;
    setHookEditing(null);
    setHookName("");
    setHookEvent("SessionStart");
    setHookMatcher("");
    setHookTimeout("30");
    setHookCommand("");
    setHookConfirm(null);
    setHooksError("");
    setHookFormOpen(true);
  }

  async function writeHook(method, args, notice) {
    if (!canEditHooks || hooksLocked) {
      setHooksError("Hook 目录正在刷新或写入权限不可用，请刷新后重试。");
      return;
    }
    hookWriteLock.current = true;
    setHooksBusy(true);
    setHooksError("");
    setHooksNotice("");
    setWriteCount((count) => count + 1);
    try {
      const result = await callHost(method, args);
      if (result?.saved === false) throw new Error("Hook 配置未保存，请刷新目录后重试。");
      if (method !== "hooks.retry" && result?.saved !== true) throw new Error("Hook 写入结果不明确，请刷新目录核对后再操作。");
      setHookFormOpen(false);
      setHookConfirm(null);
      const reloaded = await refreshHooks(true);
      // The write is already durable, so a failed catalogue reload must not read as a failed save.
      if (reloaded) setHooksNotice(notice);
      else setHooksNotice(`${notice} 已持久化，但目录重新读取失败，运行状态未知；请点「刷新 Hooks」重试。`);
    } catch (error) {
      setHooksError(errorText(error));
    } finally {
      hookWriteLock.current = false;
      setWriteCount((count) => count - 1);
      setHooksBusy(false);
    }
  }

  async function saveHook(event) {
    event.preventDefault();
    if (!canEditHooks || hooksLocked) return;
    const timeoutSec = Number(hookTimeout);
    if (!Number.isInteger(timeoutSec) || timeoutSec < 1 || timeoutSec > 600) {
      setHooksError("超时时间必须是 1–600 的整数秒。");
      return;
    }
    const command = hookCommand.trim();
    if (!hookEditing && !command) {
      setHooksError("新建规则必须填写命令。");
      return;
    }
    const definition = { event: hookEvent, timeoutSec };
    if (hasMatcher(hookEvent) && hookMatcher.trim()) definition.matcher = hookMatcher.trim();
    if (command) definition.command = command;
    await writeHook("hooks.upsert", { name: hookName.trim(), definition,
      ...(hookEditing ? { expectedRevision: hookEditing.revision } : {}) },
    hookEditing ? `Hook “${hookName.trim()}” 已保存；运行状态请查看下方状态。` : `Hook “${hookName.trim()}” 已保存为停用；需要手动启用。`);
  }

  async function changeHookEnabled(rule, enabled) {
    await writeHook("hooks.set-enabled", { name: rule.name, enabled, expectedRevision: rule.revision },
      enabled ? `Hook “${rule.name}” 已保存为启用；“已加载”表示桥接器加载，不代表命令已执行。`
        : `Hook “${rule.name}” 已保存为停用。`);
  }

  async function removeHook(rule) {
    await writeHook("hooks.remove", { name: rule.name, expectedRevision: rule.revision }, `Hook “${rule.name}” 已移除。`);
  }

  async function retryHooks() {
    await writeHook("hooks.retry", {}, "已请求重新加载 Hooks；请查看最新运行状态。");
  }

  /** Draft of one MCP entry: Host-reported values as defaults, overlaid by what the page typed. */
  function draftFor(row) {
    const defaults = {
      url: row.editable?.fields?.url ?? "",
      command: row.editable?.fields?.command ?? "",
      toolCallTimeoutMs: String(row.editable?.fields?.toolCallTimeoutMs ?? 120000),
      failOnStartupError: row.failOnStartupError === true,
    };
    return { ...defaults, ...(mcpDrafts[row.entryId] ?? {}) };
  }

  function updateDraft(entryId, field, value) {
    setMcpDrafts((drafts) => ({ ...drafts, [entryId]: { ...(drafts[entryId] ?? {}), [field]: value } }));
  }

  function toggleMcpEditor(entryId) {
    setMcpOpen((open) => ({ ...open, [entryId]: !open[entryId] }));
  }

  /**
   * Saves one MCP entry through the Host, which rewrites the Profile configuration and lets the
   * Loader apply it. That save is what makes DSH rebuild the connection.
   */
  async function saveMcpEdit(event, row) {
    event.preventDefault();
    if (!canAddNative || row.inherited) return;
    const draft = draftFor(row);
    const patch = {
      failOnStartupError: draft.failOnStartupError === true,
      toolCallTimeoutMs: Number(draft.toolCallTimeoutMs),
    };
    if (row.editable?.transport === "stdio") patch.command = draft.command;
    else patch.url = draft.url;
    setNativeBusy(true); setNativeError(""); setNativeNotice("");
    setWriteCount((count) => count + 1);
    try {
      await callHost("mcp.update", { entryId: row.entryId, patch });
      setNativeNotice("已保存，并交由 DSH 的配置加载路径重建该连接；请稍候刷新工具目录确认结果。");
      setMcpOpen((open) => ({ ...open, [row.entryId]: false }));
      await new Promise((done) => setTimeout(done, 800));
      await refreshRuntime();
    } catch (error) { setNativeError(errorText(error)); }
    finally { setNativeBusy(false); setWriteCount((count) => count - 1); }
  }

  async function refreshRuntime() {
    const requestId = ++runtimeRequest.current;
    setRuntimeBusy(true);
    setRuntimeCatalog(null);
    setRuntimeError("");
    try {
      const result = await callHost("mcp.discover");
      if (requestId !== runtimeRequest.current) return;
      if (!isRecord(result) || !Array.isArray(result.tools) || !Array.isArray(result.candidates) || !Array.isArray(result.configured)) throw new Error("MCP 配置及工具目录返回格式无效。");
      checkContext(result);
      setRuntimeCatalog(result);
    } catch (error) {
      if (requestId === runtimeRequest.current) setRuntimeError(errorText(error));
    } finally {
      if (requestId === runtimeRequest.current) setRuntimeBusy(false);
    }
  }

  async function refreshSkills() {
    const requestId = ++skillRequest.current;
    const generation = ++catalogGeneration.current;
    ++bodyRequest.current;
    setSelectedSkill(null);
    setCatalogRevision(generation);
    setSkillsBusy(true);
    setSkillsError("");
    try {
      const result = await callHost("skills.list", {});
      if (requestId !== skillRequest.current) return;
      if (!isRecord(result) || !Array.isArray(result.skills)) throw new Error("Skill 目录返回格式无效。");
      checkContext(result);
      if (catalogGeneration.current === generation) ++catalogGeneration.current;
      ++bodyRequest.current;
      setSelectedSkill(null);
      setCatalogRevision(catalogGeneration.current);
      setSkills(result.skills);
      setSkillsComplete(result.complete !== false);
    } catch (error) {
      if (requestId === skillRequest.current) {
        ++catalogGeneration.current;
        setCatalogRevision(catalogGeneration.current);
        // A failed read must not leave a stale catalogue that still offers body reads and unregistration.
        setSkills([]);
        setSkillsError(errorText(error));
      }
    } finally {
      if (requestId === skillRequest.current) setSkillsBusy(false);
    }
  }

  async function loadSkill(name) {
    if (skillsBusy || !skills.some((skill) => skill.name === name)) {
      setSkillsError("Skill 目录正在刷新或已变化，请等待刷新完成后再读取正文。");
      return;
    }
    const requestId = ++bodyRequest.current;
    const generation = catalogGeneration.current;
    const revision = catalogRevision;
    setSelectedSkill(null);
    setSkillsError("");
    try {
      const result = await callHost("skills.get", { name });
      if (requestId !== bodyRequest.current || generation !== catalogGeneration.current || revision !== catalogRevision) return;
      checkContext(result);
      if (!skills.some((skill) => skill.name === name)) return;
      setSelectedSkill(result && result.skill || null);
    } catch (error) {
      if (requestId === bodyRequest.current && generation === catalogGeneration.current) setSkillsError(errorText(error));
    }
  }

  React.useEffect(() => {
    if (tab === "hooks" && !hooksCatalog && !hooksBusy && !hooksError) void refreshHooks();
  }, [tab]);

  React.useEffect(() => {
    void refreshCompatibility();
    void refreshRuntime();
    void refreshSkills();
    return () => {
      ++compatibilityRequest.current;
      ++runtimeRequest.current;
      ++skillRequest.current;
      ++bodyRequest.current;
      ++hookRequest.current;
    };
  }, []);

  async function registerSkill(event) {
    event.preventDefault();
    if (!canEditSkills || skillsBusy) {
      setSkillsError("当前兼容检查不允许写入，或 Skill 目录仍在读取。");
      return;
    }
    setSkillsError("");
    setSkillsNotice("");
    setWriteCount((count) => count + 1);
    setSkillsBusy(true);
    try {
      const args = {
        name: skillName.trim(),
        description: skillDescription.trim(),
        content: skillContent,
      };
      if (skillWhenToUse.trim()) args.whenToUse = skillWhenToUse.trim();
      await callHost("skills.register", args);
      setSkillsNotice("Runtime Skill 已注册；插件结束运行后会注销。");
      setSkillFormOpen(false);
      setSkillName("");
      setSkillDescription("");
      setSkillWhenToUse("");
      setSkillContent("");
      await refreshSkills();
    } catch (error) {
      setSkillsError(errorText(error));
    } finally {
      setSkillsBusy(false);
      setWriteCount((count) => count - 1);
    }
  }

  async function unregisterSkill(name) {
    if (!canEditSkills || skillsBusy) {
      setSkillsError("当前兼容检查不允许写入，或 Skill 目录仍在读取。");
      return;
    }
    setSkillsError("");
    setSkillsNotice("");
    setWriteCount((count) => count + 1);
    setSkillsBusy(true);
    try {
      await callHost("skills.unregister", { name });
      setSkillsNotice(`Runtime Skill “${name}” 已注销。`);
      setUnregisterName("");
      if (selectedSkill && selectedSkill.name === name) setSelectedSkill(null);
      await refreshSkills();
    } catch (error) {
      setSkillsError(errorText(error));
    } finally {
      setSkillsBusy(false);
      setWriteCount((count) => count - 1);
    }
  }

  function renderMcp() {
    const filter = toolFilter.trim().toLowerCase();
    const matches = (tool) => !filter || tool.name.toLowerCase().includes(filter);
    const candidates = (runtimeCatalog?.candidates || []).filter(matches);
    const origin = (tool) => tool.definitionView === "profile" ? "Profile 有效定义"
      : tool.definitionView === "same-as-profile" ? "与 Profile 相同定义"
      : "定义来源未知";
    const configured = runtimeCatalog?.configured || [];
    const serverNameCounts = new Map();
    for (const row of configured) {
      if (typeof row.serverName !== "string" || !row.serverName) continue;
      serverNameCounts.set(row.serverName, (serverNameCounts.get(row.serverName) || 0) + 1);
    }
    const uniqueServerRows = [...serverNameCounts.entries()]
      .filter(([, count]) => count === 1)
      .map(([serverName]) => ({ serverName, row: configured.find((item) => item.serverName === serverName) }));
    const toolsByServer = new Map(uniqueServerRows.map(({ serverName }) => [serverName, []]));
    for (const tool of candidates) {
      const matchingNames = [...serverNameCounts.keys()].filter((serverName) => tool.name.startsWith("mcp__" + serverName + "__"));
      if (matchingNames.length === 1 && serverNameCounts.get(matchingNames[0]) === 1) {
        toolsByServer.get(matchingNames[0]).push(tool);
      }
    }
    const allServers = uniqueServerRows.map(({ serverName, row }) => ({ serverName, row, tools: toolsByServer.get(serverName) }));
    const servers = allServers.filter(({ serverName, tools }) => !filter || serverName.toLowerCase().includes(filter) || tools.length);
    const associated = new Set(allServers.flatMap(({ tools }) => tools.map((tool) => tool.name)));
    const unassociatedCandidates = candidates.filter((tool) => !associated.has(tool.name));
    const unresolvedRows = configured.filter((row) => !row.serverName || serverNameCounts.get(row.serverName) !== 1)
      .filter((row) => !filter || String(row.serverName || row.entryId || "").toLowerCase().includes(filter));
    const sourceLabel = (row) => row.kind === "preset-config" ? "来源：预设 " + (row.preset || "未知") : "来源：Profile 配置";
    /** Editor for one MCP entry; only fields the Host reports as editable are offered. */
    const renderEditor = (row) => {
      const editable = row.editable;
      if (!editable) return null;
      const draft = draftFor(row);
      const suffix = " " + (row.serverName || row.entryId);
      return h("form", { className: "dsh-msm-card", "aria-label": "编辑 MCP " + (row.serverName || row.entryId), onSubmit: (event) => void saveMcpEdit(event, row) },
        editable.transport === "stdio"
          ? h(Field, { label: "启动命令", hint: "保存后用 DSH 的配置加载路径重建该连接。" },
            h("input", { className: "dsh-msm-input", "aria-label": "MCP 启动命令" + suffix, value: draft.command, onChange: (event) => updateDraft(row.entryId, "command", event.currentTarget.value) }))
          : h(Field, { label: "HTTP 地址", hint: "保存后用 DSH 的配置加载路径重建该连接。" },
            h("input", { className: "dsh-msm-input", "aria-label": "MCP HTTP 地址" + suffix, value: draft.url, onChange: (event) => updateDraft(row.entryId, "url", event.currentTarget.value) })),
        h(Field, { label: "调用超时（毫秒）" },
          h("input", { className: "dsh-msm-input", "aria-label": "MCP 调用超时" + suffix, value: draft.toolCallTimeoutMs, onChange: (event) => updateDraft(row.entryId, "toolCallTimeoutMs", event.currentTarget.value) })),
        h(Field, { label: "启动失败时报错", hint: "关闭时连接失败也不会报错，条目会保留但没有任何工具。" },
          h("input", { type: "checkbox", "aria-label": "MCP 启动失败时报错" + suffix, checked: draft.failOnStartupError, onChange: (event) => updateDraft(row.entryId, "failOnStartupError", event.currentTarget.checked) })),
        editable.envKeys?.length ? h("div", { className: "dsh-msm-muted" }, "凭据键（只显示名称）：" + editable.envKeys.join("、")) : null,
        editable.headerKeys?.length ? h("div", { className: "dsh-msm-muted" }, "请求头键（只显示名称）：" + editable.headerKeys.join("、")) : null,
        h("button", { className: "dsh-msm-button dsh-msm-button-primary", type: "submit", disabled: !canAddNative }, nativeBusy ? "保存中…" : "保存并重建连接"));
    };
    const renderConfig = (row) => h(React.Fragment, null,
      h("div", { className: "dsh-msm-muted" }, sourceLabel(row)),
      row.fiberState === 3 ? h("div", { className: "dsh-msm-notice dsh-msm-error", role: "alert" }, "该条目的 MCP 客户端加载失败；请检查命令、地址和官方 MCP 桥接器。") : null,
      row.serverName && serverNameCounts.get(row.serverName) === 1 && toolsByServer.get(row.serverName)?.length === 0 && runtimeCatalog?.toolsAvailable
        ? h("div", { className: "dsh-msm-notice dsh-msm-error", role: "alert" }, "此 Server 已配置但没有任何工具：连接失败、工具拉取失败，或该 Server 本身不提供工具。DSH 不会为此报错；可在下方编辑配置并保存以重建连接。") : null,
      row.inherited
        ? h("div", { className: "dsh-msm-muted" }, "该条目定义来自继承层，此处只读。")
        : row.editable && row.entryId
          ? h("button", { className: "dsh-msm-button", type: "button", disabled: !canAddNative, onClick: () => toggleMcpEditor(row.entryId) }, mcpOpen[row.entryId] ? "取消编辑" : "编辑此 MCP")
          : null,
      mcpOpen[row.entryId] ? renderEditor(row) : null,
      h("div", { className: "dsh-msm-muted" }, "插件状态：" + (["等待", "加载中", "已激活", "失败", "已卸载", "卸载中"][row.fiberState] || "未知") + " · 连接状态：未知"));
    return h("section", { className: "dsh-msm-panel" },
      h("div", { className: "dsh-msm-row" },
        h(Field, { label: "搜索 MCP 工具与 Server", hint: "按完整工具名或 Server 名称检索。" },
          h("input", { className: "dsh-msm-input", "aria-label": "搜索 MCP 工具与 Server", value: toolFilter, onChange: (event) => setToolFilter(event.currentTarget.value) })),
        h("button", { className: "dsh-msm-button", type: "button", disabled: runtimeBusy, onClick: () => void refreshRuntime() }, runtimeBusy ? "发现中…" : "刷新 MCP 发现")),
      nativeError ? h("div", { className: "dsh-msm-notice dsh-msm-error", role: "alert" }, nativeError) : null,
      nativeNotice ? h("div", { className: "dsh-msm-notice dsh-msm-success", role: "status" }, nativeNotice) : null,
      h("div", { className: "dsh-msm-muted" }, "按 Profile 范围读取 MCP 配置和工具目录。MCP 命名候选保留完整工具名；命名约定不能证明来源，工具可见也不代表连接在线。当前运行时未提供权威连接状态，页面显示为未知。"),
      runtimeError ? h("div", { className: "dsh-msm-notice dsh-msm-error", role: "alert" }, runtimeError) : null,
      runtimeBusy ? h("div", { className: "dsh-msm-muted" }, "正在读取 MCP 目录…") : null,
      runtimeCatalog ? h(React.Fragment, null,
        (runtimeCatalog.warnings || []).map((warning) => h("div", { className: "dsh-msm-notice", role: "status", key: warning }, warning)),
        h("h3", { className: "dsh-msm-card-title" }, "MCP Server（" + servers.length + "）"),
        servers.length ? h("div", { className: "dsh-msm-list" }, servers.map(({ serverName, row, tools }) => h("details", { className: "dsh-msm-card", key: serverName },
          h("summary", null, serverName + "（" + tools.length + " 个候选工具）"),
          renderConfig(row),
          tools.length ? h("div", { className: "dsh-msm-list" }, tools.map((tool) => h("div", { className: "dsh-msm-card", key: tool.name }, tool.name + " · " + origin(tool))))
            : h("div", { className: "dsh-msm-muted" }, "此 Server 当前没有名称可匹配的工具候选。"))))
          : h("div", { className: "dsh-msm-muted" }, runtimeCatalog.toolsAvailable ? "没有带唯一 Server 名称的 MCP 配置。" : "工具目录不可用，不能据此判断 MCP 数量。"),
        unassociatedCandidates.length || unresolvedRows.length ? h("details", { open: !!filter },
          h("summary", null, "未关联 Server（" + unassociatedCandidates.length + " 个工具 · " + unresolvedRows.length + " 条配置）"),
          unresolvedRows.map((row, index) => h("article", { className: "dsh-msm-card", key: "unresolved:" + (row.entryId || row.serverName || index) },
            h("h3", { className: "dsh-msm-card-title" }, row.serverName || row.entryId || "MCP 配置条目"), renderConfig(row))),
          unassociatedCandidates.length ? h("div", { className: "dsh-msm-list" }, unassociatedCandidates.map((tool) => h("div", { className: "dsh-msm-card", key: tool.name }, tool.name + " · " + origin(tool)))) : null) : null
      ) : null);
  }

  function renderSkills() {
    return h("section", { className: "dsh-msm-panel" },
      h("div", { className: "dsh-msm-actions" },
        h("button", { className: "dsh-msm-button", type: "button", disabled: skillsBusy, onClick: () => void refreshSkills() }, skillsBusy ? "读取中…" : "刷新 Skills"),
        h("button", { className: "dsh-msm-button dsh-msm-button-primary", type: "button", disabled: skillsBusy || !canEditSkills, onClick: () => { setSkillFormOpen((open) => !open); } }, skillFormOpen ? "关闭表单" : "注册 Runtime Skill")),
      h("div", { className: "dsh-msm-muted" }, "此页为 Profile 全局 Skill 目录。Runtime Skill 仅在插件生命周期内有效。"),
      !skillsBusy && !skillsError ? h("div", { className: "dsh-msm-muted", "data-catalog-revision": String(catalogRevision) }, "当前目录与已读取正文属于同一次读取结果。") : null,
      !skillsBusy && !skillsComplete && !skillsError ? h("div", { className: "dsh-msm-notice", role: "status" }, "Skill 发现尚未完成，当前结果不能作为完整目录。") : null,
      skillsError ? h("div", { className: "dsh-msm-notice dsh-msm-error", role: "alert" }, skillsError) : null,
      skillsNotice ? h("div", { className: "dsh-msm-notice dsh-msm-success", role: "status" }, skillsNotice) : null,
      skillFormOpen ? h("form", { className: "dsh-msm-form", onSubmit: registerSkill },
        h(Field, { label: "名称", hint: "使用小写 kebab-case，例如 my-skill。" },
          h("input", { className: "dsh-msm-input", value: skillName, onChange: (event) => setSkillName(event.currentTarget.value), required: true })),
        h(Field, { label: "描述" },
          h("input", { className: "dsh-msm-input", value: skillDescription, onChange: (event) => setSkillDescription(event.currentTarget.value), required: true })),
        h(Field, { label: "何时使用（可选）" },
          h("input", { className: "dsh-msm-input", value: skillWhenToUse, onChange: (event) => setSkillWhenToUse(event.currentTarget.value) })),
        h(Field, { label: "Skill 正文" },
          h("textarea", { className: "dsh-msm-textarea", value: skillContent, onChange: (event) => setSkillContent(event.currentTarget.value), required: true, spellCheck: false })),
        h("div", { className: "dsh-msm-actions" },
          h("button", { className: "dsh-msm-button dsh-msm-button-primary", type: "submit", disabled: skillsBusy || !canEditSkills }, skillsBusy ? "注册中…" : "注册 Skill")))
        : null,
      skills.length
        ? h("div", { className: "dsh-msm-list" }, skills.map((skill) => h("article", { className: "dsh-msm-card", key: skill.name },
          h("div", { className: "dsh-msm-card-header" },
            h("div", null,
              h("h3", { className: "dsh-msm-card-title" }, skill.name),
              h("div", { className: "dsh-msm-muted" }, `${skill.source || "Skill"}${skill.provider ? ` · ${skill.provider}` : ""}${skill.description ? ` · ${skill.description}` : ""}`),
              skill.path ? h("div", { className: "dsh-msm-muted" }, skill.path) : null),
            h("div", { className: "dsh-msm-actions" },
              h("button", { className: "dsh-msm-button", type: "button", disabled: skillsBusy, onClick: () => void loadSkill(skill.name) }, "查看正文"),
              skill.canUnregister
                ? unregisterName === skill.name
                  ? h(React.Fragment, null,
                    h("button", { className: "dsh-msm-button dsh-msm-button-danger", type: "button", disabled: skillsBusy || !canEditSkills, onClick: () => void unregisterSkill(skill.name) }, "确认注销"),
                    h("button", { className: "dsh-msm-button", type: "button", onClick: () => setUnregisterName("") }, "取消"))
                  : h("button", { className: "dsh-msm-button dsh-msm-button-danger", type: "button", disabled: skillsBusy || !canEditSkills, onClick: () => setUnregisterName(skill.name) }, "注销")
                : null)))))
        : h("div", { className: "dsh-msm-empty" }, skillsBusy ? "正在读取 Skill 目录…"
          : skillsError ? "Skill 目录读取失败；不能据此判断 Skill 数量。"
          : !skillsComplete ? "Skill 发现尚未完成。"
          : "当前 Profile 全局目录没有可见 Skill。"),
      selectedSkill ? h("article", { className: "dsh-msm-card" },
        h("div", { className: "dsh-msm-card-header" },
          h("h3", { className: "dsh-msm-card-title" }, `Skill 正文：${selectedSkill.name}`),
          h("button", { className: "dsh-msm-button", type: "button", onClick: () => setSelectedSkill(null) }, "关闭")),
        h("pre", { className: "dsh-msm-pre" }, selectedSkill.content || "（正文为空）")) : null);
  }

  const hookRuntimeLabel = { disabled: "无启用规则", loading: "桥接器加载中", active: "桥接器已加载", failed: "加载失败", unavailable: "官方模块不可用" };
  const hookPhaseLabel = (phase) => hookRuntimeLabel[phase] || "未知";

  const hookEventOptions = hookEvents.map((event) => h("option", { key: event, value: event }, event));
  function hookConfirmButton(rule) {
    if (!canEditHooks || hooksLocked) return null;
    const enabling = !rule.enabled;
    if (hookConfirm?.name === rule.name && hookConfirm.action === (enabling ? "enable" : "disable")) {
      return h(React.Fragment, null,
        h("button", { className: "dsh-msm-button dsh-msm-button-danger", type: "button", disabled: hooksLocked, onClick: () => void changeHookEnabled(rule, enabling) }, enabling ? "确认启用" : "确认停用"),
        h("button", { className: "dsh-msm-button", type: "button", onClick: () => setHookConfirm(null) }, "取消"));
    }
    return h("button", { className: "dsh-msm-button", type: "button", onClick: () => setHookConfirm({ name: rule.name, action: enabling ? "enable" : "disable" }) }, enabling ? "启用" : "停用");
  }
  function hookRemoveButton(rule) {
    if (!canEditHooks || hooksLocked) return null;
    if (hookConfirm?.name === rule.name && hookConfirm.action === "remove") {
      return h(React.Fragment, null,
        h("button", { className: "dsh-msm-button dsh-msm-button-danger", type: "button", disabled: hooksLocked, onClick: () => void removeHook(rule) }, "确认移除"),
        h("button", { className: "dsh-msm-button", type: "button", onClick: () => setHookConfirm(null) }, "取消"));
    }
    return h("button", { className: "dsh-msm-button dsh-msm-button-danger", type: "button", onClick: () => setHookConfirm({ name: rule.name, action: "remove" }) }, "移除");
  }
  function renderHooks() {
    const rules = hooksCatalog?.rules || [];
    const runtime = hooksCatalog?.runtime;
    return h("section", { className: "dsh-msm-panel" },
      h("div", { className: "dsh-msm-row" },
        h(Field, { label: "DSH Hook 规则", hint: "仅管理本 Profile 内由官方桥接器执行的命令 Hook；不读取或修改外部 Claude Code 配置。" }),
        h("button", { className: "dsh-msm-button", type: "button", disabled: hooksLocked, onClick: () => void refreshHooks() }, hooksBusy ? "读取中…" : "刷新 Hooks"),
        h("button", { className: "dsh-msm-button", type: "button", disabled: !canEditHooks || hooksLocked, onClick: () => void retryHooks() }, "重新加载"),
        h("button", { className: "dsh-msm-button dsh-msm-button-primary", type: "button", disabled: !canEditHooks || hooksLocked, onClick: createHook }, "新建 Hook 规则")),
      runtime ? h("div", { className: "dsh-msm-muted" },
        `运行状态：${hookPhaseLabel(runtime.phase)} · 启用规则：${runtime.enabledCount}。官方桥接器已加载不代表规则已执行；新规则默认停用。`) : null,
      runtime?.error ? h("div", { className: "dsh-msm-notice dsh-msm-error", role: "alert" }, runtime.error) : null,
      hooksError ? h("div", { className: "dsh-msm-notice dsh-msm-error", role: "alert" }, hooksError) : null,
      hooksNotice ? h("div", { className: "dsh-msm-notice dsh-msm-success", role: "status" }, hooksNotice) : null,
      !hooksCatalog && hooksBusy ? h("div", { className: "dsh-msm-muted" }, "正在读取 Hook 目录…") : null,
      hookFormOpen ? h("form", { className: "dsh-msm-card", "aria-label": hookEditing ? "编辑 Hook" : "新建 Hook", onSubmit: saveHook },
        h(Field, { label: "规则名称", hint: "1–64 位小写字母、数字、下划线或短横线；创建后不可修改。" },
          h("input", { className: "dsh-msm-input", "aria-label": "Hook 规则名称", value: hookName, disabled: !!hookEditing, required: true, onChange: (event) => setHookName(event.currentTarget.value) })),
        h(Field, { label: "触发事件" }, h("select", { className: "dsh-msm-select", "aria-label": "Hook 触发事件", value: hookEvent, onChange: (event) => { setHookEvent(event.currentTarget.value); if (!hasMatcher(event.currentTarget.value)) setHookMatcher(""); } }, hookEventOptions)),
        hasMatcher(hookEvent) ? h(Field, { label: "matcher（可选）", hint: "留空或 * 匹配全部；工具事件按工具名，SessionStart 按来源。" },
          h("input", { className: "dsh-msm-input", "aria-label": "Hook matcher", value: hookMatcher, onChange: (event) => setHookMatcher(event.currentTarget.value) })) : null,
        h(Field, { label: hookEditing ? "命令（留空保留现有命令）" : "命令", hint: "命中事件时将通过官方桥接器执行；请勿在命令中写入凭据。" },
          h("textarea", { className: "dsh-msm-textarea dsh-msm-textarea-short", "aria-label": "Hook 命令", value: hookCommand, required: !hookEditing, spellCheck: false, onChange: (event) => setHookCommand(event.currentTarget.value) })),
        h(Field, { label: "超时（秒，1–600）" },
          h("input", { className: "dsh-msm-input", "aria-label": "Hook 超时秒数", type: "number", min: 1, max: 600, value: hookTimeout, required: true, onChange: (event) => setHookTimeout(event.currentTarget.value) })),
        h("div", { className: "dsh-msm-actions" },
          h("button", { className: "dsh-msm-button dsh-msm-button-primary", type: "submit", disabled: !canEditHooks || hooksLocked }, hooksLocked ? "提交中…" : "保存规则"),
          h("button", { className: "dsh-msm-button", type: "button", onClick: () => { setHookFormOpen(false); setHookConfirm(null); } }, "关闭表单"))) : null,
      rules.length ? renderHookRules(rules) : renderHookEmpty());
  }

  function renderHookRules(rules) {
    return h("div", { className: "dsh-msm-list" }, rules.map(renderHookRule));
  }

  function renderHookEmpty() {
    return h("div", { className: "dsh-msm-empty" }, hooksBusy && !hooksCatalog ? "正在读取 Hook 目录…"
      : hooksError ? "Hook 目录读取失败；不能据此判断规则数量。"
      : "当前 Profile 没有托管 Hook 规则。");
  }

  function renderHookRule(rule) {
    const summary = h("div", null,
      h("h3", { className: "dsh-msm-card-title" }, rule.name),
      h("div", { className: "dsh-msm-muted" }, `${rule.event}${rule.matcher ? ` · matcher: ${rule.matcher}` : ""} · 超时 ${rule.timeoutSec} 秒 · 命令${rule.commandConfigured ? "已配置" : "未配置"}`));
    const actions = h("div", { className: "dsh-msm-actions" },
      rule.enabled ? h("span", { className: "dsh-msm-success" }, "已启用") : h("span", { className: "dsh-msm-muted" }, "已停用"),
      h("button", { className: "dsh-msm-button", type: "button", disabled: !canEditHooks || hooksLocked, onClick: () => editHook(rule) }, "编辑"),
      hookConfirmButton(rule),
      hookRemoveButton(rule));
    return h("article", { className: "dsh-msm-card", key: rule.name },
      h("div", { className: "dsh-msm-card-header" }, summary, actions));
  }

  return h("main", { className: "dsh-msm-page" },
    h("header", { className: "dsh-msm-header" },
      h("div", null,
        h("h1", { className: "dsh-msm-title" }, "MCP 与 Skill 管理"),
        h("p", { className: "dsh-msm-subtitle" }, "查看 Profile MCP Server 的工具分组，管理 MCP 配置与 Runtime Skill。"))),
    h("section", { className: "dsh-msm-card", "aria-label": "兼容检查" },
      h("div", { className: "dsh-msm-card-header" },
        h("h2", { className: "dsh-msm-card-title" }, "兼容检查"),
        h("button", { className: "dsh-msm-button", type: "button", disabled: compatibilityBusy || writeCount > 0, onClick: () => void refreshCompatibility() }, compatibilityBusy ? "检查中…" : "重新检查兼容性")),
      compatibilityError ? h("div", { className: "dsh-msm-notice dsh-msm-error", role: "alert" }, `${compatibilityError} 当前写入已禁用，仍可尝试读取目录。`) : null,
      compatibility ? h(React.Fragment, null,
        h("div", null, `DSH：${compatibility.runtimeVersion || "无法识别"} · 插件：${compatibility.pluginVersion}`),
        h("div", { className: "dsh-msm-muted" }, `已做隔离回归的 DSH 版本：${compatibility.testedRuntimeVersions.join("、") || "无"}。安装范围不等于已验证版本。`),
        h("div", { role: "status", className: "dsh-msm-notice" }, compatibility.versionStatus === "tested"
          ? `版本匹配隔离回归基线；配置写入${canEditMcp ? "已启用" : "已禁用"}，Runtime Skill 写入${canEditSkills ? "已启用" : "已禁用"}，Hook 写入${canEditHooks ? "已启用" : "已禁用"}。接口检查仅确认方法存在，不代表外部 MCP 已连接。`
          : "运行版本未验证或无法识别，配置及 Runtime Skill 操作保持只读。"),
        h("details", null,
          h("summary", null, "接口能力"),
          Object.entries({ mcpCatalog: "MCP 配置目录", mcpDiscovery: "工具目录", skillCatalog: "Skill 目录与正文", configEdit: "配置编辑", runtimeSkills: "Runtime Skill 注册", hookCatalog: "Hook 目录", hookRuntime: "Hook 桥接器运行环境" })
            .map(([key, label]) => h("div", { className: "dsh-msm-muted", key }, `${label}：${compatibility.capabilities[key] === true ? "接口可用" : "接口缺失"}`))))
        : compatibilityBusy ? h("div", { className: "dsh-msm-muted" }, "正在检查版本和接口，写入暂不可用。") : null),
    writeCount ? h("div", { className: "dsh-msm-notice", role: "status" }, "正在提交操作…") : null,
    h("nav", { className: "dsh-msm-tabs", role: "tablist", "aria-label": "管理类型" },
      h("button", { className: "dsh-msm-tab", type: "button", role: "tab", "aria-selected": tab === "mcp", onClick: () => setTab("mcp") }, "MCP Servers"),
      h("button", { className: "dsh-msm-tab", type: "button", role: "tab", "aria-selected": tab === "hooks", onClick: () => setTab("hooks") }, "Hooks"),
      h("button", { className: "dsh-msm-tab", type: "button", role: "tab", "aria-selected": tab === "skills", onClick: () => setTab("skills") }, "Skills")),
    tab === "mcp" ? renderMcp() : tab === "hooks" ? renderHooks() : renderSkills());
}

return ManagerPage;
}

function apply(ctx) {
  const Page = createManagerPage(ctx.connection);
  // Register the page first: a stylesheet failure must not cost the settings entry itself.
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "mcp-skill-manager",
    order: 25,
    label: "MCP & Skills",
  }, Page));
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = "dsh-mcp-skill-manager";
    tag.textContent = css;
    document.head.appendChild(tag);
    return () => tag.remove();
  }, "mcp-skill-manager stylesheet");
}

exports.inject = ["slots", "connection"];
exports.apply = apply;
return module.exports; } });
