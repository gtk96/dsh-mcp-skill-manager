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

function ManagerPage(props) {
  const sessionRows = props.useSessions((state) => state.byId);
  const initialSession = Object.values(sessionRows).find((session) => (session.retainedBy?.mainView ?? 0) > 0)?.id || "";
  const [sessionId, setSessionId] = React.useState(initialSession);
  const [contexts, setContexts] = React.useState([]);
  const [contextsBusy, setContextsBusy] = React.useState(true);
  const [contextsError, setContextsError] = React.useState("");
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
  const contextsRequest = React.useRef(0);
  const runtimeRequest = React.useRef(0);
  const skillRequest = React.useRef(0);
  const bodyRequest = React.useRef(0);
  const catalogGeneration = React.useRef(0);
  const [catalogRevision, setCatalogRevision] = React.useState(0);
  const [tab, setTab] = React.useState("mcp");
  const [mcpPath, setMcpPath] = React.useState("");
  const [loadedPath, setLoadedPath] = React.useState(null);
  const mcpRequest = React.useRef(0);
  const [mcpEntries, setMcpEntries] = React.useState([]);
  const [entryId, setEntryId] = React.useState("");
  const [mcpBusy, setMcpBusy] = React.useState(true);
  const [mcpError, setMcpError] = React.useState("");
  const [mcpNotice, setMcpNotice] = React.useState("");
  const [serverFormOpen, setServerFormOpen] = React.useState(false);
  const [serverName, setServerName] = React.useState("");
  const [definitionText, setDefinitionText] = React.useState("");
  const [removeServerName, setRemoveServerName] = React.useState("");
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
    setServerFormOpen(false);
    setRemoveServerName("");
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
        || !isRecord(result.writes) || typeof result.writes.mcp !== "boolean" || typeof result.writes.skills !== "boolean") {
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

  async function refreshContexts() {
    const requestId = ++contextsRequest.current;
    setContextsBusy(true);
    setContextsError("");
    try {
      const result = await requestHost("contexts.list", {});
      if (requestId !== contextsRequest.current) return;
      if (!isRecord(result) || !Array.isArray(result.contexts)) throw new Error("会话目录返回格式无效。");
      setContexts(result.contexts);
    } catch (error) {
      if (requestId === contextsRequest.current) setContextsError(errorText(error));
    } finally {
      if (requestId === contextsRequest.current) setContextsBusy(false);
    }
  }

  function selectContext(next) {
    if (writeCount || next === sessionId) return;
    ++compatibilityRequest.current;
    setCompatibility(null);
    ++mcpRequest.current;
    ++runtimeRequest.current;
    ++skillRequest.current;
    ++bodyRequest.current;
    setSessionId(next);
    setMcpEntries([]);
    setMcpPath("");
    setLoadedPath(null);
    setEntryId("");
    setRuntimeCatalog(null);
    setSkills([]);
    setSelectedSkill(null);
    setServerFormOpen(false);
    setRemoveServerName("");
    setSkillFormOpen(false);
    setUnregisterName("");
    setMcpError("");
    setSkillsError("");
    setRuntimeError("");
    setMcpNotice("");
    setSkillsNotice("");
  }

  async function refreshRuntime() {
    const requestId = ++runtimeRequest.current;
    setRuntimeBusy(true);
    setRuntimeCatalog(null);
    setRuntimeError("");
    try {
      const result = await callHost("mcp.discover");
      if (requestId !== runtimeRequest.current) return;
      if (!isRecord(result) || !Array.isArray(result.tools) || !Array.isArray(result.candidates) || !Array.isArray(result.configured)) throw new Error("会话能力目录返回格式无效。");
      checkContext(result);
      setRuntimeCatalog(result);
    } catch (error) {
      if (requestId === runtimeRequest.current) setRuntimeError(errorText(error));
    } finally {
      if (requestId === runtimeRequest.current) setRuntimeBusy(false);
    }
  }

  async function refreshMcp(pathOverride) {
    const requestedPath = typeof pathOverride === "string" ? pathOverride : mcpPath;
    const requestId = ++mcpRequest.current;
    setLoadedPath(null);
    setServerFormOpen(false);
    setRemoveServerName("");
    setMcpBusy(true);
    setMcpError("");
    setMcpNotice("");
    try {
      const query = requestedPath.trim() ? { configPath: requestedPath } : {};
      const result = await callHost("mcp.catalog", query);
      if (requestId !== mcpRequest.current) return;
      if (!isRecord(result) || !Array.isArray(result.entries) || typeof result.configPath !== "string") throw new Error("MCP 配置目录返回格式无效。");
      const nextEntries = result.entries;
      setMcpEntries(nextEntries);
      setLoadedPath(result.configPath);
      setMcpPath((current) => current.trim() === requestedPath.trim() ? result.configPath : current);
      setEntryId((current) => nextEntries.some((row) => row.entry && row.entry.id === current)
        ? current
        : nextEntries[0] && nextEntries[0].entry && nextEntries[0].entry.id || "");
    } catch (error) {
      if (requestId === mcpRequest.current) setMcpError(errorText(error));
    } finally {
      if (requestId === mcpRequest.current) setMcpBusy(false);
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

  React.useEffect(() => { void refreshContexts(); }, []);
  React.useEffect(() => {
    void refreshCompatibility();
    void refreshMcp("");
    void refreshRuntime();
    void refreshSkills();
    return () => {
      ++compatibilityRequest.current;
      ++mcpRequest.current;
      ++runtimeRequest.current;
      ++skillRequest.current;
      ++bodyRequest.current;
    };
  }, [sessionId]);

  const selectedEntry = mcpEntries.find((row) => row.entry && row.entry.id === entryId) || mcpEntries[0] || null;
  const serverRows = selectedEntry && isRecord(selectedEntry.servers) ? Object.entries(selectedEntry.servers) : [];
  const pathDirty = loadedPath === null || mcpPath.trim() !== loadedPath;
  const mapLocked = pathDirty || !!sessionId || !canEditMcp;

  async function saveServer(event) {
    event.preventDefault();
    if (mcpBusy || mapLocked || !loadedPath) {
      setMcpError("映射路径尚未成功读取，请先读取当前路径。");
      return;
    }
    setMcpError("");
    setMcpNotice("");
    let definition;
    try {
      definition = JSON.parse(definitionText);
    } catch (_error) {
      setMcpError("Server 定义不是有效 JSON。");
      return;
    }
    if (!isRecord(definition)) {
      setMcpError("Server 定义必须是 JSON 对象。");
      return;
    }
    if (!selectedEntry || !selectedEntry.entry || !serverName.trim()) {
      setMcpError("请先选择配置条目并填写 server 名称。");
      return;
    }
    setWriteCount((count) => count + 1);
    setMcpBusy(true);
    try {
      const args = { entryId: selectedEntry.entry.id, name: serverName.trim(), definition };
      args.configPath = loadedPath;
      await callHost("mcp.upsert", args);
      setMcpNotice("Server 定义已提交给 DSH 配置编辑器。");
      setServerFormOpen(false);
      setServerName("");
      setDefinitionText("");
      await refreshMcp(mcpPath);
    } catch (error) {
      setMcpError(errorText(error));
    } finally {
      setMcpBusy(false);
      setWriteCount((count) => count - 1);
    }
  }

  async function removeServer(name) {
    if (!selectedEntry || !selectedEntry.entry) return;
    if (mcpBusy || mapLocked || !loadedPath) {
      setMcpError("映射路径尚未成功读取，请先读取当前路径。");
      return;
    }
    setMcpError("");
    setMcpNotice("");
    setWriteCount((count) => count + 1);
    setMcpBusy(true);
    try {
      const args = { entryId: selectedEntry.entry.id, name };
      args.configPath = loadedPath;
      const result = await callHost("mcp.remove", args);
      setMcpNotice(result && result.inheritedRemains
        ? "当前条目的覆盖定义已移除；继承配置中的同名 server 仍然生效。"
        : "Server 定义已移除。");
      setRemoveServerName("");
      await refreshMcp(mcpPath);
    } catch (error) {
      setMcpError(errorText(error));
    } finally {
      setMcpBusy(false);
      setWriteCount((count) => count - 1);
    }
  }

  async function registerSkill(event) {
    event.preventDefault();
    if (!canEditSkills || sessionId || skillsBusy) {
      setSkillsError("当前兼容检查不允许写入，或尚未进入可编辑的 Profile 全局视图。");
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
    if (!canEditSkills || sessionId || skillsBusy) {
      setSkillsError("当前兼容检查不允许写入，或尚未进入可编辑的 Profile 全局视图。");
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
    const visibleTools = (runtimeCatalog?.tools || []).filter(matches);
    const origin = (tool) => tool.definitionView === "profile" ? "Profile 有效定义"
      : tool.definitionView === "same-as-profile" ? "与 Profile 相同定义"
      : tool.definitionView === "session-specific" ? "当前会话有效定义" : "定义来源未知";
    return h("section", { className: "dsh-msm-panel" },
      h("div", { className: "dsh-msm-row" },
        h(Field, { label: "搜索可见工具", hint: "按完整工具名检索，例如 mc、holo 或 okr。" },
          h("input", { className: "dsh-msm-input", "aria-label": "搜索可见工具", value: toolFilter, onChange: (event) => setToolFilter(event.currentTarget.value) })),
        h("button", { className: "dsh-msm-button", type: "button", disabled: runtimeBusy, onClick: () => void refreshRuntime() }, runtimeBusy ? "发现中…" : "刷新 MCP 发现")),
      h("div", { className: "dsh-msm-muted" }, "目录按所选会话的实际工具作用域读取。MCP 命名候选保留完整工具名；命名约定不能证明来源，工具可见也不代表连接在线。当前运行时未提供权威连接状态，页面显示为未知。"),
      runtimeError ? h("div", { className: "dsh-msm-notice dsh-msm-error", role: "alert" }, runtimeError) : null,
      runtimeBusy ? h("div", { className: "dsh-msm-muted" }, "正在读取所选会话的能力…") : null,
      runtimeCatalog ? h(React.Fragment, null,
        (runtimeCatalog.warnings || []).map((warning) => h("div", { className: "dsh-msm-notice", role: "status", key: warning }, warning)),
        h("h3", { className: "dsh-msm-card-title" }, `MCP 命名候选（${candidates.length}）`),
        candidates.length ? h("div", { className: "dsh-msm-list" }, candidates.map((tool) => h("article", { className: "dsh-msm-card", key: tool.name },
          h("h3", { className: "dsh-msm-card-title" }, tool.name),
          h("div", { className: "dsh-msm-muted" }, `${origin(tool)} · 来源待核实 · 连接状态：未知`))))
          : h("div", { className: "dsh-msm-muted" }, runtimeCatalog.toolsAvailable ? "此视图没有匹配的 MCP 命名候选。原生配置来源与其他有效工具见下方。" : "工具目录不可用，不能据此判断 MCP 数量。"),
        h("h3", { className: "dsh-msm-card-title" }, `原生 MCP 配置来源（${runtimeCatalog.configured.length}）`),
        runtimeCatalog.configured.map((row, index) => h("article", { className: "dsh-msm-card", key: `${row.kind}:${row.entryId}:${index}` },
          h("h3", { className: "dsh-msm-card-title" }, row.serverName || row.entryId || "MCP 配置条目"),
          h("div", { className: "dsh-msm-muted" }, row.kind === "preset-config" ? `来源：预设 ${row.preset}` : "来源：Profile 配置（不代表所选会话可调用）"),
          h("div", { className: "dsh-msm-muted" }, `插件状态：${["等待", "加载中", "已激活", "失败", "已卸载", "卸载中"][row.fiberState] || "未知"} · 连接状态：未知`))),
        h("details", { open: !!filter },
          h("summary", null, `该视图全部可见工具（${visibleTools.length}）`),
          h("div", { className: "dsh-msm-list" }, visibleTools.map((tool) => h("div", { className: "dsh-msm-card", key: tool.name }, `${tool.name} · ${origin(tool)}`))))) : null,
      h("details", null,
        h("summary", null, "高级：Profile 配置映射编辑"),
        sessionId ? h("div", { className: "dsh-msm-notice" }, "当前会话视图只读；编辑 Profile 配置映射需选择 Profile 全局视图。") : null,
        renderMcpMap()));
  }

  function renderMcpMap() {
    return h("section", { className: "dsh-msm-panel" },
      h("div", { className: "dsh-msm-row" },
        h(Field, { label: "MCP 映射路径", hint: "填写已存在的自定义 server 映射路径；DSH 原生 MCP 插件条目请在插件管理器查看。" },
          h("input", {
            className: "dsh-msm-input",
            value: mcpPath,
            onChange: (event) => {
              setMcpPath(event.currentTarget.value);
              setServerFormOpen(false);
              setRemoveServerName("");
              setMcpError("");
            },
            placeholder: "mcp.servers",
          })),
        h("button", { className: "dsh-msm-button", type: "button", disabled: mcpBusy, onClick: () => void refreshMcp(mcpPath) }, mcpBusy ? "读取中…" : "读取配置")),
      h("div", { className: "dsh-msm-muted" }, "新增或更新时请提供完整 JSON；提交会替换选中 server 的当前定义，省略的字段不会自动保留。已有定义只显示脱敏摘要。此列表仅覆盖指定路径，不代表整个 Profile 的 MCP 清单。"),
      mcpError ? h("div", { className: "dsh-msm-notice dsh-msm-error", role: "alert" }, mcpError) : null,
      mcpNotice ? h("div", { className: "dsh-msm-notice dsh-msm-success", role: "status" }, mcpNotice) : null,
      pathDirty && !mcpBusy ? h("div", { className: "dsh-msm-notice", role: "status" }, "映射路径尚未成功读取；请先读取当前路径，再编辑或移除 server。") : null,
      h(Field, { label: "配置条目" },
        h("select", {
          className: "dsh-msm-select",
          value: selectedEntry && selectedEntry.entry ? selectedEntry.entry.id : "",
          onChange: (event) => {
            setEntryId(event.currentTarget.value);
            setServerFormOpen(false);
            setRemoveServerName("");
          },
          disabled: !mcpEntries.length || mcpBusy,
        }, mcpEntries.length
          ? mcpEntries.map((row) => {
            const entry = row.entry || {};
            const title = entry.name || entry.patchId || entry.id;
            return h("option", { key: entry.id, value: entry.id }, `${title}${entry.id && entry.id !== title ? ` (${entry.id})` : ""}`);
          })
          : h("option", { value: "" }, "没有可用配置条目"))),
      serverRows.length
        ? h("div", { className: "dsh-msm-list" }, serverRows.map(([name, summary]) => h("article", { className: "dsh-msm-card", key: name },
          h("div", { className: "dsh-msm-card-header" },
            h("h3", { className: "dsh-msm-card-title" }, name),
            h("div", { className: "dsh-msm-actions" },
              h("button", {
                className: "dsh-msm-button",
                type: "button",
                disabled: mcpBusy || mapLocked,
                onClick: () => {
                  setServerName(name);
                  setDefinitionText("");
                  setServerFormOpen(true);
                  setMcpNotice("当前配置只显示脱敏摘要；请提供完整 server 定义，提交会替换该 server，省略字段不会自动保留。");
                },
              }, "编辑 override"),
              removeServerName === name
                ? h(React.Fragment, null,
                  h("button", { className: "dsh-msm-button dsh-msm-button-danger", type: "button", disabled: mcpBusy || mapLocked, onClick: () => void removeServer(name) }, "确认移除"),
                  h("button", { className: "dsh-msm-button", type: "button", onClick: () => setRemoveServerName("") }, "取消"))
                : h("button", { className: "dsh-msm-button dsh-msm-button-danger", type: "button", disabled: mcpBusy || mapLocked, onClick: () => setRemoveServerName(name) }, "移除"))),
          h("pre", { className: "dsh-msm-pre" }, JSON.stringify(summary, null, 2)))))
        : h("div", { className: "dsh-msm-empty" }, mcpBusy
          ? "正在读取配置目录…"
          : mcpError ? "配置目录读取失败；不能据此判断 server 数量。"
          : mcpPath.trim() ? "此配置条目的指定映射路径下没有 server。"
          : "请填写实际的 MCP 映射路径，再读取配置。"),
      h("div", { className: "dsh-msm-actions" },
        h("button", {
          className: "dsh-msm-button",
          type: "button",
          disabled: !selectedEntry || !loadedPath || mapLocked || mcpBusy,
          onClick: () => {
            setServerName("");
            setDefinitionText("");
            setServerFormOpen((open) => !open);
            setMcpNotice("");
          },
        }, serverFormOpen ? "关闭编辑器" : "新增 MCP server")),
      serverFormOpen ? h("form", { className: "dsh-msm-form", onSubmit: saveServer },
        h(Field, { label: "Server 名称" },
          h("input", { className: "dsh-msm-input", value: serverName, onChange: (event) => setServerName(event.currentTarget.value), required: true })),
        h(Field, { label: "JSON 定义", hint: "提交完整 server 对象；该 server 的省略字段不会自动保留。" },
          h("textarea", { className: "dsh-msm-textarea", value: definitionText, onChange: (event) => setDefinitionText(event.currentTarget.value), required: true, spellCheck: false, placeholder: '{\n  "command": "...",\n  "args": []\n}' })),
        h("div", { className: "dsh-msm-actions" },
          h("button", { className: "dsh-msm-button dsh-msm-button-primary", type: "submit", disabled: mcpBusy || mapLocked }, mcpBusy ? "保存中…" : "保存 server")))
        : null);
  }

  function renderSkills() {
    return h("section", { className: "dsh-msm-panel" },
      h("div", { className: "dsh-msm-actions" },
        h("button", { className: "dsh-msm-button", type: "button", disabled: skillsBusy, onClick: () => void refreshSkills() }, skillsBusy ? "读取中…" : "刷新 Skills"),
        h("button", { className: "dsh-msm-button dsh-msm-button-primary", type: "button", disabled: skillsBusy || !!sessionId || !canEditSkills, onClick: () => setSkillFormOpen((open) => !open) }, skillFormOpen ? "关闭表单" : "注册 Runtime Skill")),
      h("div", { className: "dsh-msm-muted" }, sessionId
        ? "此目录与所选会话使用相同的 Agent、工作目录及预设 Skill 服务。Runtime Skill 注册与注销在 Profile 全局视图中管理。"
        : "此页为 Profile 全局 Skill 目录；选择会话可读取其 Agent 与项目目录的有效 Skill。Runtime Skill 仅在插件生命周期内有效。"),
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
          : sessionId ? "所选会话的有效目录没有可见 Skill。" : "当前 Profile 全局目录没有可见 Skill。"),
      selectedSkill ? h("article", { className: "dsh-msm-card" },
        h("div", { className: "dsh-msm-card-header" },
          h("h3", { className: "dsh-msm-card-title" }, `Skill 正文：${selectedSkill.name}`),
          h("button", { className: "dsh-msm-button", type: "button", onClick: () => setSelectedSkill(null) }, "关闭")),
        h("pre", { className: "dsh-msm-pre" }, selectedSkill.content || "（正文为空）")) : null);
  }

  return h("main", { className: "dsh-msm-page" },
    h("header", { className: "dsh-msm-header" },
      h("div", null,
        h("h1", { className: "dsh-msm-title" }, "MCP 与 Skill 管理"),
        h("p", { className: "dsh-msm-subtitle" }, "按所选会话发现 MCP 相关能力与有效 Skill，并显示来源。"))),
    h("section", { className: "dsh-msm-card", "aria-label": "兼容检查" },
      h("div", { className: "dsh-msm-card-header" },
        h("h2", { className: "dsh-msm-card-title" }, "兼容检查"),
        h("button", { className: "dsh-msm-button", type: "button", disabled: compatibilityBusy || writeCount > 0, onClick: () => void refreshCompatibility() }, compatibilityBusy ? "检查中…" : "重新检查兼容性")),
      compatibilityError ? h("div", { className: "dsh-msm-notice dsh-msm-error", role: "alert" }, `${compatibilityError} 当前写入已禁用，仍可尝试读取目录。`) : null,
      compatibility ? h(React.Fragment, null,
        h("div", null, `DSH：${compatibility.runtimeVersion || "无法识别"} · 插件：${compatibility.pluginVersion}`),
        h("div", { className: "dsh-msm-muted" }, `已做隔离回归的 DSH 版本：${compatibility.testedRuntimeVersions.join("、") || "无"}。安装范围不等于已验证版本。`),
        h("div", { role: "status", className: "dsh-msm-notice" }, compatibility.versionStatus === "tested"
          ? `版本匹配隔离回归基线；配置写入${canEditMcp ? "已启用" : "已禁用"}，Runtime Skill 写入${canEditSkills ? "已启用" : "已禁用"}。接口检查仅确认方法存在，不代表外部 MCP 已连接。`
          : "运行版本未验证或无法识别，配置及 Runtime Skill 操作保持只读。"),
        h("details", null,
          h("summary", null, "接口能力"),
          Object.entries({ mcpCatalog: "MCP 配置目录", mcpDiscovery: "会话工具目录", skillCatalog: "Skill 目录与正文", configEdit: "配置编辑", runtimeSkills: "Runtime Skill 注册", sessionSelection: "会话选择", presetScope: "预设作用域" })
            .map(([key, label]) => h("div", { className: "dsh-msm-muted", key }, `${label}：${compatibility.capabilities[key] === true ? "接口可用" : "接口缺失"}`))))
        : compatibilityBusy ? h("div", { className: "dsh-msm-muted" }, "正在检查版本和接口，写入暂不可用。") : null),
    h("div", { className: "dsh-msm-row" },
      h(Field, { label: "能力视图", hint: "未加载会话需先在 DSH 中打开，再刷新目录；读取目录不会后台创建 Agent。" },
        h("select", { className: "dsh-msm-select", "aria-label": "能力视图", value: sessionId, disabled: writeCount > 0, onChange: (event) => selectContext(event.currentTarget.value) },
          h("option", { value: "" }, "Profile 全局视图"),
          sessionId && !contexts.some((context) => context.sessionId === sessionId) ? h("option", { value: sessionId }, `${sessionRows[sessionId]?.title || sessionId} · 状态待刷新`) : null,
          contexts.map((context) => h("option", { key: context.sessionId, value: context.sessionId }, `${sessionRows[context.sessionId]?.title || context.sessionId} · ${context.live ? "已加载" : "未加载"}${context.cwd ? ` · ${context.cwd}` : ""}${context.preset ? ` · ${context.preset}` : ""}`)))),
      h("button", { className: "dsh-msm-button", type: "button", disabled: contextsBusy, onClick: () => void refreshContexts() }, contextsBusy ? "读取会话中…" : "刷新会话")),
    contextsError ? h("div", { className: "dsh-msm-notice dsh-msm-error", role: "alert" }, contextsError) : null,
    writeCount ? h("div", { className: "dsh-msm-notice", role: "status" }, "正在提交操作，完成后可切换能力视图。") : null,
    h("nav", { className: "dsh-msm-tabs", role: "tablist", "aria-label": "管理类型" },
      h("button", { className: "dsh-msm-tab", type: "button", role: "tab", "aria-selected": tab === "mcp", onClick: () => setTab("mcp") }, "MCP Servers"),
      h("button", { className: "dsh-msm-tab", type: "button", role: "tab", "aria-selected": tab === "skills", onClick: () => setTab("skills") }, "Skills")),
    tab === "mcp" ? renderMcp() : renderSkills());
}

return ManagerPage;
}

function apply(ctx) {
  const Page = createManagerPage(ctx.connection);
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = "dsh-mcp-skill-manager";
    tag.textContent = css;
    document.head.appendChild(tag);
    return () => tag.remove();
  }, "mcp-skill-manager stylesheet");
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "mcp-skill-manager",
    order: 25,
    label: "MCP & Skills",
  }, Page));
}

exports.inject = ["slots", "connection"];
exports.apply = apply;
return module.exports; } });
