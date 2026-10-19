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
  const managedRequest = React.useRef(0);
  const [managedWritable, setManagedWritable] = React.useState(false);
  const [managedReady, setManagedReady] = React.useState(false);
  const [nativeFormOpen, setNativeFormOpen] = React.useState(false);
  const [nativeBusy, setNativeBusy] = React.useState(false);
  const [nativeError, setNativeError] = React.useState("");
  const [nativeNotice, setNativeNotice] = React.useState("");
  const [nativeName, setNativeName] = React.useState("");
  const [nativeTransport, setNativeTransport] = React.useState("stdio");
  const [nativeCommand, setNativeCommand] = React.useState("");
  const [nativeArgs, setNativeArgs] = React.useState("[]");
  const [nativeCwd, setNativeCwd] = React.useState("");
  const [nativeUrl, setNativeUrl] = React.useState("");
  const [nativeRefs, setNativeRefs] = React.useState("{}");
  const canAddNative = canEditMcp && managedWritable && !nativeBusy && writeCount === 0;
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
    setNativeFormOpen(false);
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

  async function refreshManaged(refreshDiscovery = false) {
    const requestId = ++managedRequest.current;
    setManagedWritable(false);
    setManagedReady(false);
    setNativeError("");
    try {
      const result = await callHost("mcp.managed");
      if (requestId !== managedRequest.current) return;
      if (!isRecord(result) || typeof result.writable !== "boolean" || !Array.isArray(result.servers)) throw new Error("手动 MCP 配置目录格式无效。");
      setManagedWritable(result.writable);
    } catch (error) {
      if (requestId === managedRequest.current) setNativeError(errorText(error));
    } finally {
      if (requestId === managedRequest.current) {
        setManagedReady(true);
        if (refreshDiscovery) void refreshRuntime();
      }
    }
  }

  async function retryNativeMcp(serverName) {
    if (!canAddNative) return;
    setNativeBusy(true); setNativeError(""); setNativeNotice("");
    setWriteCount((count) => count + 1);
    try {
      await callHost("mcp.retry", { serverName });
      setNativeNotice("已重试本地失败配置；连接状态仍为未知，请查看加载提示和工具目录。");
      await Promise.all([refreshRuntime(), refreshManaged()]);
    } catch (error) { setNativeError(errorText(error)); }
    finally { setNativeBusy(false); setWriteCount((count) => count - 1); }
  }

  async function addNativeMcp(event) {
    event.preventDefault();
    if (!canAddNative) { setNativeError("请先完成兼容检查，确认配置可写后再添加 MCP。"); return; }
    setNativeError("");
    setNativeNotice("");
    let definition;
    try {
      const refs = JSON.parse(nativeRefs);
      if (!isRecord(refs)) throw new Error("环境变量引用必须是 JSON 对象。");
      if (nativeTransport === "stdio") {
        const args = JSON.parse(nativeArgs);
        if (!Array.isArray(args) || !args.every((arg) => typeof arg === "string")) throw new Error("参数必须是 JSON 字符串数组。");
        definition = { transport: "stdio", command: nativeCommand, args, ...(nativeCwd.trim() ? { cwd: nativeCwd.trim() } : {}), envFromEnv: refs };
      } else definition = { transport: "streamable-http", url: nativeUrl, headersFromEnv: refs };
    } catch {
      setNativeError("参数或环境变量引用的 JSON 格式无效，请检查数组和对象格式。");
      return;
    }
    setNativeBusy(true);
    setWriteCount((count) => count + 1);
    try {
      await callHost("mcp.add", { serverName: nativeName.trim(), definition });
      setNativeFormOpen(false);
      setNativeCommand(""); setNativeArgs("[]"); setNativeCwd(""); setNativeUrl(""); setNativeRefs("{}");
      setNativeNotice("MCP 配置已保存并交给官方桥接器加载；连接状态仍为未知，请刷新工具目录确认能力是否出现。");
      await Promise.all([refreshRuntime(), refreshManaged()]);
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
    void refreshCompatibility();
    void refreshRuntime();
    void refreshManaged(true);
    void refreshSkills();
    return () => {
      ++compatibilityRequest.current;
      ++managedRequest.current;
      ++runtimeRequest.current;
      ++skillRequest.current;
      ++bodyRequest.current;
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
    const sourceLabel = (row) => row.kind === "managed-config" ? "来源：本插件持久化配置，使用官方 MCP 桥接器"
      : row.kind === "preset-config" ? "来源：预设 " + (row.preset || "未知")
      : "来源：Profile 配置";
    const renderConfig = (row) => h(React.Fragment, null,
      h("div", { className: "dsh-msm-muted" }, sourceLabel(row)),
      row.phase === "failed" ? h("div", { className: "dsh-msm-notice dsh-msm-error", role: "alert" }, row.error || "本地加载失败；请检查命令、环境变量引用和官方 MCP 桥接器。") : null,
      row.phase === "failed" && row.serverName && serverNameCounts.get(row.serverName) === 1
        ? h("button", { className: "dsh-msm-button", type: "button", disabled: !canAddNative, onClick: () => void retryNativeMcp(row.serverName) }, "重试加载 MCP") : null,
      h("div", { className: "dsh-msm-muted" }, "插件状态：" + (["等待", "加载中", "已激活", "失败", "已卸载", "卸载中"][row.fiberState] || "未知") + " · 连接状态：未知"));
    return h("section", { className: "dsh-msm-panel" },
      h("div", { className: "dsh-msm-row" },
        h(Field, { label: "搜索 MCP 工具与 Server", hint: "按完整工具名或 Server 名称检索。" },
          h("input", { className: "dsh-msm-input", "aria-label": "搜索 MCP 工具与 Server", value: toolFilter, onChange: (event) => setToolFilter(event.currentTarget.value) })),
        h("button", { className: "dsh-msm-button", type: "button", disabled: runtimeBusy, onClick: () => void refreshRuntime() }, runtimeBusy ? "发现中…" : "刷新 MCP 发现"),
        h("button", { className: "dsh-msm-button dsh-msm-button-primary", type: "button", disabled: !canAddNative, onClick: () => { setNativeFormOpen((open) => !open); setNativeError(""); setNativeNotice(""); } }, nativeFormOpen ? "关闭托管 MCP 表单" : "添加托管 MCP")),
      managedReady && !managedWritable && canEditMcp && !nativeError
        ? h("div", { className: "dsh-msm-notice", role: "status" }, "当前 Profile 的托管 MCP 配置不可写；请在插件配置中检查 managedServers 的归属后重试。") : null,
      nativeError ? h("div", { className: "dsh-msm-notice dsh-msm-error", role: "alert" }, nativeError) : null,
      nativeNotice ? h("div", { className: "dsh-msm-notice dsh-msm-success", role: "status" }, nativeNotice) : null,
      nativeFormOpen ? h("form", { className: "dsh-msm-card", "aria-label": "新增 MCP", onSubmit: addNativeMcp },
        h(Field, { label: "Server 名称", hint: "1–32 位字母、数字、下划线或短横线；同名配置不会覆盖。" },
          h("input", { className: "dsh-msm-input", "aria-label": "MCP Server 名称", value: nativeName, required: true, maxLength: 32, onChange: (event) => setNativeName(event.currentTarget.value) })),
        h(Field, { label: "传输方式" }, h("select", { className: "dsh-msm-select", "aria-label": "MCP 传输方式", value: nativeTransport, onChange: (event) => { setNativeTransport(event.currentTarget.value); setNativeRefs("{}"); } },
          h("option", { value: "stdio" }, "stdio（本地命令）"), h("option", { value: "streamable-http" }, "HTTP（streamable-http）"))),
        nativeTransport === "stdio" ? h(React.Fragment, null,
          h(Field, { label: "启动命令", hint: "填写可执行文件或命令名；请勿在命令或参数中填写凭据。" }, h("input", { className: "dsh-msm-input", "aria-label": "MCP 启动命令", value: nativeCommand, required: true, onChange: (event) => setNativeCommand(event.currentTarget.value) })),
          h(Field, { label: "参数（JSON 数组）" }, h("textarea", { className: "dsh-msm-textarea dsh-msm-textarea-short", "aria-label": "MCP 参数", value: nativeArgs, onChange: (event) => setNativeArgs(event.currentTarget.value), spellCheck: false })),
          h(Field, { label: "工作目录（可选）" }, h("input", { className: "dsh-msm-input", "aria-label": "MCP 工作目录", value: nativeCwd, onChange: (event) => setNativeCwd(event.currentTarget.value) })))
          : h(Field, { label: "MCP HTTP 地址", hint: "HTTP/HTTPS 地址，不含用户名、密码、查询参数或片段。" }, h("input", { className: "dsh-msm-input", "aria-label": "MCP HTTP 地址", value: nativeUrl, required: true, type: "url", onChange: (event) => setNativeUrl(event.currentTarget.value) })),
        h(Field, { label: nativeTransport === "stdio" ? "进程环境变量引用（JSON 对象）" : "请求头环境变量引用（JSON 对象）", hint: nativeTransport === "stdio" ? '例如 {"API_KEY":"MY_MCP_API_KEY"}，只保存环境变量名。' : '例如 {"Authorization":"MY_MCP_AUTH_HEADER"}；对应环境变量需包含完整头值。' },
          h("textarea", { className: "dsh-msm-textarea dsh-msm-textarea-short", "aria-label": "MCP 环境变量引用", value: nativeRefs, onChange: (event) => setNativeRefs(event.currentTarget.value), spellCheck: false })),
        h("button", { className: "dsh-msm-button dsh-msm-button-primary", type: "submit", disabled: !canAddNative }, nativeBusy ? "保存中…" : "保存并加载 MCP")) : null,
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
          ? `版本匹配隔离回归基线；配置写入${canEditMcp ? "已启用" : "已禁用"}，Runtime Skill 写入${canEditSkills ? "已启用" : "已禁用"}。接口检查仅确认方法存在，不代表外部 MCP 已连接。`
          : "运行版本未验证或无法识别，配置及 Runtime Skill 操作保持只读。"),
        h("details", null,
          h("summary", null, "接口能力"),
          Object.entries({ mcpCatalog: "MCP 配置目录", mcpDiscovery: "工具目录", skillCatalog: "Skill 目录与正文", configEdit: "配置编辑", runtimeSkills: "Runtime Skill 注册" })
            .map(([key, label]) => h("div", { className: "dsh-msm-muted", key }, `${label}：${compatibility.capabilities[key] === true ? "接口可用" : "接口缺失"}`))))
        : compatibilityBusy ? h("div", { className: "dsh-msm-muted" }, "正在检查版本和接口，写入暂不可用。") : null),
    writeCount ? h("div", { className: "dsh-msm-notice", role: "status" }, "正在提交操作…") : null,
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
