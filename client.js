window.__ModuleLoader__.load({ id: "dsh-mcp-skill-manager", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
const React = require("react");
const h = React.createElement;

/** Dictionary namespace; also the slot's locale seat. */
const NS = "mcp-skill-manager";

const zh = {
  nav: "MCP 与 Skills",
  "tabs.label": "管理类型",
  "tab.mcp": "MCP Servers",
  "tab.skills": "Skills",
  "action.add": "新增 Server",
  "action.refresh": "刷新",
  "action.edit": "编辑",
  "action.save": "保存",
  "action.saving": "保存中…",
  "action.cancel": "取消",
  "action.remove": "删除",
  "action.confirmRemove": "确认删除",
  "action.enable": "启用",
  "action.disable": "禁用",
  "action.reset": "重置为默认",
  "action.view": "查看正文",
  "action.close": "关闭",
  "action.unregister": "注销",
  "action.confirmUnregister": "确认注销",
  "action.addCredential": "添加一项",
  "action.removeCredential": "删除",
  "action.undoRemove": "撤销",
  "action.advanced": "高级选项",
  "state.loading": "正在读取…",
  "state.disabled": "已禁用",
  "source.profile": "本 Profile",
  "source.bundle": "上层配置",
  "source.bundleTitle": "来自插件包或上层组合；可以禁用，不能在这里删除。",
  "mcp.empty": "还没有配置 MCP Server。",
  "mcp.emptyHint": "使用右上角的「新增 Server」添加一个。",
  "mcp.loadFailed": "这个 Server 加载失败。检查命令、地址和 DSH 日志。",
  "mcp.noTools": "已配置，但没有返回工具。检查命令或地址，以及 Server 日志。",
  "mcp.tools": "工具（{count}）",
  "mcp.toolsUnavailable": "工具目录不可读，无法判断 Server 是否返回工具。",
  "mcp.ungrouped": "未归属的 MCP 工具（{count}）",
  "mcp.duplicate": "多个 Server 使用了相同名称：{names}。它们的工具无法归属。",
  "mcp.enableFirst": "先启用再编辑。",
  "mcp.notLoaded": "该条目未加载，无法编辑。",
  "mcp.toolGuarded": "已停用调用",
  "mcp.toolGuardOn": "停用调用",
  "mcp.toolGuardOff": "恢复调用",
  "mcp.toolGuardHint": "停用后模型仍能看到这个工具，但调用会被拒绝。官方 MCP 桥没有提供隐藏单个工具的接口。",
  "mcp.guardedCount": "{count} 个工具已停用调用",
  "notice.toolGuarded": "已停用该工具的调用。",
  "notice.toolUnguarded": "已恢复该工具的调用。",
  "write.guardsMissing": "当前 DSH 未提供 tools.guard，无法停用单个工具。",
  "mcp.footnote": "变更写入本 Profile 的配置文件；上层配置只能在提供它的插件包里修改。",
  "notice.applied": "已保存并生效。",
  "notice.appliedSuffix": "，已生效。",
  "notice.restartSuffix": "，重启 DSH 后生效。",
  "notice.overriddenSuffix": "，但被更高优先级配置覆盖，当前未生效。",
  "notice.restart": "已保存，重启 DSH 后生效。",
  "notice.overridden": "已保存，但被更高优先级配置覆盖，当前未生效。",
  "notice.removed": "已删除。",
  "notice.removedDisabled": "该 Server 由上层配置提供，已改为禁用。",
  "notice.enabled": "已启用。",
  "notice.off": "已禁用。",
  "notice.reset": "已重置为默认配置。",
  "notice.resetNoop": "这项没有本地覆盖，无需重置。",
  "notice.skillRegistered": "Runtime Skill 已注册；插件停止运行后失效。",
  "notice.skillUnregistered": "Runtime Skill 已注销。",
  "write.disabled": "当前 DSH 版本未验证，写入已禁用。",
  "write.runtime": "DSH 版本：{version}",
  "write.plugin": "插件版本：{version}",
  "write.tested": "已回归版本：{versions}",
  "write.missing": "缺少接口：{names}",
  "form.create": "新增 MCP Server",
  "form.edit": "编辑 MCP Server",
  "form.name": "名称",
  "form.nameHint": "字母、数字、下划线或连字符，1–32 位。创建后不可修改。",
  "form.namePlaceholder": "例如 github",
  "form.transport": "传输方式",
  "form.stdio": "stdio（本地进程）",
  "form.http": "streamable-http（远程）",
  "form.command": "启动命令",
  "form.commandHint": "例如 npx",
  "form.args": "参数",
  "form.argsHint": "每行一个参数。",
  "form.cwd": "工作目录",
  "form.cwdHint": "可选，留空表示 DSH 的工作目录。",
  "form.url": "服务地址",
  "form.urlHint": "以 http:// 或 https:// 开头。",
  "form.env": "环境变量",
  "form.headers": "请求头",
  "form.credentialHint": "已有值不会显示；输入新值才会替换，留空保持不变。",
  "form.credentialKey": "名称",
  "form.credentialValue": "值",
  "form.credentialSet": "已设置",
  "form.credentialReplace": "新值",
  "form.timeout": "调用超时（毫秒）",
  "form.instructionBytes": "指令上限（字节）",
  "form.failOnStartup": "启动失败时报错",
  "form.failOnStartupHint": "关闭时连接失败不报错，只是这个 Server 没有工具。",
  "form.reconnect": "自动重连",
  "form.reconnectInitial": "首次延迟（毫秒）",
  "form.reconnectMax": "最大延迟（毫秒）",
  "form.reconnectAttempts": "最大尝试次数",
  "form.expression": "这个字段是 YAML 表达式，页面不能修改：",
  "form.commandRequired": "请填写启动命令。",
  "form.urlRequired": "请填写服务地址。",
  "form.invalidUrl": "服务地址必须以 http:// 或 https:// 开头。",
  "form.invalidName": "名称只能包含字母、数字、下划线和连字符，长度 1–32。",
  "form.invalidNumber": "{field} 必须是正整数。",
  "form.credentialKeyRequired": "新增的凭据需要填写名称。",
  "form.unchanged": "没有需要保存的修改。",
  "skills.note": "Runtime Skill 只在插件运行期间有效，不会写入配置文件。",
  "skills.incomplete": "Skill 目录尚未读取完整，结果可能缺项。",
  "skills.empty": "当前 Profile 没有可见的 Skill。",
  "skills.register": "注册 Runtime Skill",
  "skills.name": "名称",
  "skills.nameHint": "小写 kebab-case，例如 my-skill。",
  "skills.description": "描述",
  "skills.whenToUse": "何时使用",
  "skills.whenToUseHint": "可选。",
  "skills.content": "正文",
  "skills.viewTitle": "正文：{name}",
  "skills.contentEmpty": "（正文为空）",
  "error.generic": "操作失败，请查看 DSH 日志。",
  "error.badResponse": "Host 返回的数据格式不正确，请确认插件与 DSH 版本一致。",
};

const en = {
  nav: "MCP & Skills",
  "tabs.label": "Management type",
  "tab.mcp": "MCP Servers",
  "tab.skills": "Skills",
  "action.add": "Add server",
  "action.refresh": "Refresh",
  "action.edit": "Edit",
  "action.save": "Save",
  "action.saving": "Saving…",
  "action.cancel": "Cancel",
  "action.remove": "Delete",
  "action.confirmRemove": "Confirm delete",
  "action.enable": "Enable",
  "action.disable": "Disable",
  "action.reset": "Reset to default",
  "action.view": "View",
  "action.close": "Close",
  "action.unregister": "Unregister",
  "action.confirmUnregister": "Confirm unregister",
  "action.addCredential": "Add entry",
  "action.removeCredential": "Remove",
  "action.undoRemove": "Undo",
  "action.advanced": "Advanced",
  "state.loading": "Loading…",
  "state.disabled": "Disabled",
  "source.profile": "This profile",
  "source.bundle": "Upper layer",
  "source.bundleTitle": "Provided by a plugin bundle or an upper layer; disable it here, but it cannot be deleted.",
  "mcp.empty": "No MCP server is configured yet.",
  "mcp.emptyHint": "Use Add server in the top-right corner.",
  "mcp.loadFailed": "This server failed to load. Check the command, the address, and the DSH log.",
  "mcp.noTools": "Configured, but it returned no tools. Check the command or address, and the server log.",
  "mcp.tools": "Tools ({count})",
  "mcp.toolsUnavailable": "The tool catalog is unreadable, so tool counts are unknown.",
  "mcp.ungrouped": "Unattributed MCP tools ({count})",
  "mcp.duplicate": "Several servers share the same name: {names}. Their tools cannot be attributed.",
  "mcp.enableFirst": "Enable it before editing.",
  "mcp.notLoaded": "This entry is not loaded, so it cannot be edited.",
  "mcp.toolGuarded": "Calls disabled",
  "mcp.toolGuardOn": "Disable calls",
  "mcp.toolGuardOff": "Allow calls",
  "mcp.toolGuardHint": "A guarded tool stays in the model's catalog, but every call is denied. The official MCP bridge offers no way to hide a single tool.",
  "mcp.guardedCount": "{count} tool(s) with calls disabled",
  "notice.toolGuarded": "Calls to this tool are disabled.",
  "notice.toolUnguarded": "Calls to this tool are allowed again.",
  "write.guardsMissing": "This DSH provides no tools.guard, so a single tool cannot be disabled.",
  "mcp.footnote": "Changes are written to this profile's configuration; upper-layer entries can only be changed in the bundle that provides them.",
  "notice.applied": "Saved and applied.",
  "notice.appliedSuffix": "; it is active.",
  "notice.restartSuffix": "; restart DSH for it to take effect.",
  "notice.overriddenSuffix": ", but a higher-priority configuration overrides it.",
  "notice.restart": "Saved. Restart DSH for it to take effect.",
  "notice.overridden": "Saved, but a higher-priority configuration overrides it, so it is not active.",
  "notice.removed": "Deleted.",
  "notice.removedDisabled": "This server comes from an upper layer, so it was disabled instead.",
  "notice.enabled": "Enabled.",
  "notice.off": "Disabled.",
  "notice.reset": "Reset to the default configuration.",
  "notice.resetNoop": "This entry has no local override, so there is nothing to reset.",
  "notice.skillRegistered": "Runtime skill registered; it disappears when the plugin stops.",
  "notice.skillUnregistered": "Runtime skill unregistered.",
  "write.disabled": "This DSH version is unverified; editing is disabled.",
  "write.runtime": "DSH version: {version}",
  "write.plugin": "Plugin version: {version}",
  "write.tested": "Tested versions: {versions}",
  "write.missing": "Missing interfaces: {names}",
  "form.create": "Add MCP server",
  "form.edit": "Edit MCP server",
  "form.name": "Name",
  "form.nameHint": "Letters, digits, underscores or hyphens, 1–32 characters. It cannot be changed later.",
  "form.namePlaceholder": "e.g. github",
  "form.transport": "Transport",
  "form.stdio": "stdio (local process)",
  "form.http": "streamable-http (remote)",
  "form.command": "Command",
  "form.commandHint": "e.g. npx",
  "form.args": "Arguments",
  "form.argsHint": "One argument per line.",
  "form.cwd": "Working directory",
  "form.cwdHint": "Optional; empty means the DSH working directory.",
  "form.url": "Server URL",
  "form.urlHint": "Must start with http:// or https://.",
  "form.env": "Environment variables",
  "form.headers": "Headers",
  "form.credentialHint": "Stored values are never shown; type a new value to replace one, leave it blank to keep it.",
  "form.credentialKey": "Key",
  "form.credentialValue": "Value",
  "form.credentialSet": "Set",
  "form.credentialReplace": "New value",
  "form.timeout": "Tool call timeout (ms)",
  "form.instructionBytes": "Instruction limit (bytes)",
  "form.failOnStartup": "Report startup failures",
  "form.failOnStartupHint": "When off, a failed connection is silent and the server simply has no tools.",
  "form.reconnect": "Reconnect automatically",
  "form.reconnectInitial": "Initial delay (ms)",
  "form.reconnectMax": "Maximum delay (ms)",
  "form.reconnectAttempts": "Maximum attempts",
  "form.expression": "This field is a YAML expression and cannot be changed here: ",
  "form.commandRequired": "Enter a command.",
  "form.urlRequired": "Enter a server URL.",
  "form.invalidUrl": "The server URL must start with http:// or https://.",
  "form.invalidName": "The name may only contain letters, digits, underscores and hyphens, 1–32 characters.",
  "form.invalidNumber": "{field} must be a positive integer.",
  "form.credentialKeyRequired": "A new credential needs a key.",
  "form.unchanged": "Nothing to save.",
  "skills.note": "Runtime skills live only while the plugin runs and are never written to the configuration.",
  "skills.incomplete": "The skill catalog is incomplete; entries may be missing.",
  "skills.empty": "No skill is visible in this profile.",
  "skills.register": "Register runtime skill",
  "skills.name": "Name",
  "skills.nameHint": "Lowercase kebab-case, e.g. my-skill.",
  "skills.description": "Description",
  "skills.whenToUse": "When to use",
  "skills.whenToUseHint": "Optional.",
  "skills.content": "Content",
  "skills.viewTitle": "Content: {name}",
  "skills.contentEmpty": "(empty)",
  "error.generic": "The operation failed; check the DSH log.",
  "error.badResponse": "The Host returned an unexpected shape; check that the plugin and DSH versions match.",
};

const css = `
.dsh-msm{display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary,#1f2329);}
.dsh-msm *{box-sizing:border-box;}
.dsh-msm-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
.dsh-msm-tabs{display:flex;gap:4px;}
.dsh-msm-tab{border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#59636e);cursor:pointer;padding:6px 10px;font:inherit;font-size:13px;}
.dsh-msm-tab[aria-selected="true"]{background:var(--dsw-alias-bg-layer-2,#f4f6f8);color:var(--dsw-alias-label-primary,#1f2329);font-weight:600;}
.dsh-msm-count{color:var(--dsw-alias-label-tertiary,#8a929c);font-weight:400;margin-left:4px;}
.dsh-msm-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.dsh-msm-btn{border:1px solid var(--dsw-alias-border-l2,#cfd5dd);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2329);cursor:pointer;padding:6px 10px;font:inherit;font-size:13px;white-space:nowrap;}
.dsh-msm-btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary,#4677f5);}
.dsh-msm-btn:disabled{cursor:not-allowed;opacity:.5;}
.dsh-msm-btn-primary{border-color:var(--dsw-alias-brand-primary,#4677f5);background:var(--dsw-alias-brand-primary,#4677f5);color:#fff;}
.dsh-msm-btn-danger{color:var(--dsw-alias-state-error-primary,#d1242f);}
.dsh-msm-link{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary,#59636e);padding:2px 4px;}
.dsh-msm-card{display:flex;flex-direction:column;gap:8px;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);padding:12px;}
.dsh-msm-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;}
.dsh-msm-title{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;}
.dsh-msm-name{font-size:14px;font-weight:600;overflow-wrap:anywhere;}
.dsh-msm-tag{border-radius:4px;background:var(--dsw-alias-bg-layer-2,#f4f6f8);color:var(--dsw-alias-label-secondary,#59636e);padding:1px 6px;font-size:11px;font-weight:500;}
.dsh-msm-tag-warn{background:transparent;border:1px solid var(--dsw-alias-border-l2,#cfd5dd);}
.dsh-msm-summary{color:var(--dsw-alias-label-secondary,#59636e);font-size:12px;overflow-wrap:anywhere;}
.dsh-msm-muted{color:var(--dsw-alias-label-secondary,#59636e);font-size:12px;line-height:1.5;overflow-wrap:anywhere;}
.dsh-msm-note{border-radius:6px;background:var(--dsw-alias-bg-layer-2,#f4f6f8);padding:8px 10px;color:var(--dsw-alias-label-secondary,#59636e);font-size:12px;line-height:1.5;}
.dsh-msm-note-error{border:1px solid var(--dsw-alias-state-error-primary,#d1242f);color:var(--dsw-alias-state-error-primary,#d1242f);}
.dsh-msm-note-ok{color:var(--dsw-alias-state-success-primary,#18864b);}
.dsh-msm-list{display:flex;flex-direction:column;gap:8px;}
.dsh-msm-empty{border:1px dashed var(--dsw-alias-border-l2,#cfd5dd);border-radius:8px;padding:14px;color:var(--dsw-alias-label-secondary,#59636e);font-size:13px;}
.dsh-msm-tools{border-top:1px solid var(--dsw-alias-border-l1,#d9dde3);padding-top:6px;}
.dsh-msm-tools summary{cursor:pointer;color:var(--dsw-alias-label-secondary,#59636e);font-size:12px;}
.dsh-msm-tool-list{margin:6px 0 0;padding-left:18px;color:var(--dsw-alias-label-secondary,#59636e);font-size:12px;line-height:1.6;overflow-wrap:anywhere;}
.dsh-msm-tool{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.dsh-msm-tool-name{overflow-wrap:anywhere;}
.dsh-msm-tool-guarded .dsh-msm-tool-name{text-decoration:line-through;opacity:.7;}
.dsh-msm-form{display:flex;flex-direction:column;gap:10px;}
.dsh-msm-form-title{margin:0;font-size:15px;font-weight:600;}
.dsh-msm-field{display:flex;flex-direction:column;gap:4px;min-width:0;}
.dsh-msm-label{font-size:12px;font-weight:500;}
.dsh-msm-hint{color:var(--dsw-alias-label-secondary,#59636e);font-size:11px;line-height:1.45;}
.dsh-msm-input{width:100%;border:1px solid var(--dsw-alias-border-l2,#cfd5dd);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2329);padding:6px 8px;font:inherit;font-size:13px;}
.dsh-msm-input:focus{outline:2px solid var(--dsw-alias-brand-primary,#4677f5);outline-offset:1px;}
.dsh-msm-textarea{min-height:64px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;line-height:1.45;}
.dsh-msm-check{display:flex;align-items:center;gap:6px;font-size:13px;}
.dsh-msm-cred{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.dsh-msm-cred-key{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;min-width:96px;overflow-wrap:anywhere;}
.dsh-msm-cred .dsh-msm-input{flex:1;min-width:120px;width:auto;}
.dsh-msm-cred-removed .dsh-msm-cred-key{color:var(--dsw-alias-state-error-primary,#d1242f);text-decoration:line-through;}
.dsh-msm-code{border-radius:4px;background:var(--dsw-alias-bg-layer-2,#f4f6f8);padding:1px 5px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;overflow-wrap:anywhere;}
.dsh-msm-pre{max-height:220px;overflow:auto;margin:0;border-radius:6px;background:var(--dsw-alias-bg-layer-2,#f4f6f8);padding:10px;color:var(--dsw-alias-label-secondary,#59636e);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;}
.dsh-msm-details{display:flex;flex-direction:column;gap:4px;}
.dsh-msm-details summary{cursor:pointer;font-size:12px;color:var(--dsw-alias-label-secondary,#59636e);}
@media(max-width:680px){.dsh-msm-head{align-items:stretch;flex-direction:column}.dsh-msm-card-top{flex-direction:column}.dsh-msm-cred{flex-direction:column;align-items:stretch}}
`;

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

function format(template, params) {
  if (!params) return template;
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/** Built-in copy, used until (or without) the locale service's `t` seat. */
const fallbackT = (key, params) => format(zh[key] ?? key, params);

function errorText(error, t) {
  return error && typeof error.message === "string" && error.message ? error.message : t("error.generic");
}

const splitArgs = (text) => String(text).replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter((line) => line.length > 0);

/**
 * A `!!js` field arrives as `{ expression }` from `describeConfig`, or as the raw `{ __jsExpr }`
 * node when the field sits inside a nested object such as `reconnect`.
 */
const expressionOf = (value) => {
  if (!isRecord(value)) return undefined;
  if (typeof value.expression === "string") return value.expression;
  if (typeof value.__jsExpr === "string") return value.__jsExpr;
  return undefined;
};

function createManagerPage(connection) {
  async function requestHost(method, args) {
    const result = await connection.rpc.call("/api", "mcp-skill-manager." + method, args ?? {});
    if (!isRecord(result) || typeof result.ok !== "boolean") throw new Error("Host RPC 返回格式无效；请确认插件与 DSH 版本一致。");
    if (result.ok !== true) throw new Error(result.error && result.error.message || "Host 操作失败。");
    return result.value;
  }

  function Field(props) {
    return h("label", { className: "dsh-msm-field" },
      h("span", { className: "dsh-msm-label" }, props.label),
      props.children,
      props.hint ? h("span", { className: "dsh-msm-hint" }, props.hint) : null);
  }

  /** Every entry in the create form, before validation. */
  function blankDraft() {
    return {
      serverName: "",
      transport: "stdio",
      command: "",
      args: "",
      cwd: "",
      url: "",
      timeout: "",
      instructionBytes: "",
      failOnStartup: false,
      reconnectEnabled: true,
      reconnectTouched: false,
      reconnectInitial: "",
      reconnectMax: "",
      reconnectAttempts: "",
      locked: {},
      credentials: [],
      advancedOpen: false,
      reconnectLocked: {},
    };
  }

  /** The edit form, seeded from the Host's description of one live entry. */
  function draftFor(server) {
    const config = isRecord(server.config) ? server.config : {};
    const fields = isRecord(config.fields) ? config.fields : {};
    const locked = {};
    const readText = (name) => {
      const expression = expressionOf(fields[name]);
      if (expression !== undefined) { locked[name] = expression; return ""; }
      const value = fields[name];
      if (value === undefined || value === null) return "";
      return typeof value === "string" ? value : String(value);
    };
    let args = "";
    const argsExpression = expressionOf(fields.args);
    if (argsExpression !== undefined) locked.args = argsExpression;
    else if (Array.isArray(fields.args)) args = fields.args.filter((arg) => typeof arg === "string").join("\n");
    const reconnect = isRecord(config.reconnect) ? config.reconnect : {};
    const reconnectLocked = {};
    const reconnectText = (name) => {
      const expression = expressionOf(reconnect[name]);
      if (expression !== undefined) { reconnectLocked[name] = expression; return ""; }
      return typeof reconnect[name] === "number" ? String(reconnect[name]) : "";
    };
    if (isRecord(reconnect.enabled)) reconnectLocked.enabled = expressionOf(reconnect.enabled) ?? "…";
    return {
      ...blankDraft(),
      serverName: config.serverName ?? server.serverName ?? "",
      transport: config.transport === "stdio" ? "stdio" : "streamable-http",
      command: readText("command"),
      args,
      cwd: readText("cwd"),
      url: readText("url"),
      timeout: readText("toolCallTimeoutMs"),
      instructionBytes: readText("maxInstructionBytes"),
      failOnStartup: fields.failOnStartupError === true,
      reconnectEnabled: reconnect.enabled === undefined ? true : reconnect.enabled === true,
      reconnectInitial: reconnectText("initialDelayMs"),
      reconnectMax: reconnectText("maxDelayMs"),
      reconnectAttempts: reconnectText("maxAttempts"),
      locked,
      reconnectLocked,
      credentials: (Array.isArray(config.credentialKeys) ? config.credentialKeys : [])
        .filter((key) => typeof key === "string")
        .map((key) => ({ key, value: "", existing: true, remove: false })),
    };
  }

  /** Credential rows become a merge map: `null` deletes a stored key, a string replaces it. */
  function credentialPatch(rows, t) {
    const patch = {};
    for (const row of rows) {
      if (row.existing) {
        if (row.remove) patch[row.key] = null;
        else if (row.value !== "") patch[row.key] = row.value;
        continue;
      }
      if (row.removed) continue;
      const key = row.key.trim();
      if (!key) {
        if (row.value === "") continue;
        throw new Error(t("form.credentialKeyRequired"));
      }
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)) throw new Error(t("form.credentialKeyRequired"));
      patch[key] = row.value;
    }
    return Object.keys(patch).length ? patch : undefined;
  }

  function positiveNumber(text, label, t) {
    const trimmed = String(text).trim();
    if (trimmed === "") return undefined;
    const value = Number(trimmed);
    if (!Number.isInteger(value) || value <= 0) throw new Error(t("form.invalidNumber", { field: label }));
    return value;
  }

  function advancedPatch(draft, live, t) {
    const patch = {};
    const timeout = positiveNumber(draft.timeout, t("form.timeout"), t);
    if (timeout !== undefined && timeout !== live.toolCallTimeoutMs) patch.toolCallTimeoutMs = timeout;
    const bytes = positiveNumber(draft.instructionBytes, t("form.instructionBytes"), t);
    if (bytes !== undefined && bytes !== live.maxInstructionBytes) patch.maxInstructionBytes = bytes;
    if (!isRecord(live.failOnStartupError) && draft.failOnStartup !== (live.failOnStartupError === true)) {
      patch.failOnStartupError = draft.failOnStartup;
    }
    return patch;
  }

  function reconnectPatch(draft, liveReconnect, t) {
    const patch = {};
    if (draft.reconnectTouched && draft.reconnectEnabled !== (liveReconnect.enabled === true)) {
      patch.enabled = draft.reconnectEnabled;
    }
    const numbers = [
      ["initialDelayMs", draft.reconnectInitial, t("form.reconnectInitial")],
      ["maxDelayMs", draft.reconnectMax, t("form.reconnectMax")],
      ["maxAttempts", draft.reconnectAttempts, t("form.reconnectAttempts")],
    ];
    for (const [key, text, label] of numbers) {
      if (isRecord(liveReconnect[key])) continue;
      const value = positiveNumber(text, label, t);
      if (value !== undefined && value !== liveReconnect[key]) patch[key] = value;
    }
    return patch;
  }

  function createPayload(draft, t) {
    const serverName = draft.serverName.trim();
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(serverName)) throw new Error(t("form.invalidName"));
    const payload = { serverName, transport: draft.transport };
    if (draft.transport === "stdio") {
      const command = draft.command.trim();
      if (!command) throw new Error(t("form.commandRequired"));
      payload.command = command;
      const args = splitArgs(draft.args);
      if (args.length) payload.args = args;
      const cwd = draft.cwd.trim();
      if (cwd) payload.cwd = cwd;
    } else {
      const url = draft.url.trim();
      if (!url) throw new Error(t("form.urlRequired"));
      if (!/^https?:\/\//.test(url)) throw new Error(t("form.invalidUrl"));
      payload.url = url;
    }
    Object.assign(payload, advancedPatch(draft, {}, t));
    const reconnect = reconnectPatch(draft, {}, t);
    if (Object.keys(reconnect).length) payload.reconnect = reconnect;
    const credentials = credentialPatch(draft.credentials, t);
    if (credentials !== undefined) payload[draft.transport === "stdio" ? "env" : "headers"] = credentials;
    return payload;
  }

  function updatePayload(draft, server, t) {
    const config = isRecord(server.config) ? server.config : {};
    const live = isRecord(config.fields) ? config.fields : {};
    const liveReconnect = isRecord(config.reconnect) ? config.reconnect : {};
    const patch = {};
    if (draft.transport === "stdio") {
      const command = draft.command.trim();
      if (draft.locked.command === undefined && command !== (typeof live.command === "string" ? live.command : "")) {
        if (!command) throw new Error(t("form.commandRequired"));
        patch.command = command;
      }
      if (draft.locked.args === undefined) {
        const args = splitArgs(draft.args);
        const liveArgs = Array.isArray(live.args) ? live.args.filter((arg) => typeof arg === "string") : [];
        if (args.join("\n") !== liveArgs.join("\n")) patch.args = args;
      }
      if (draft.locked.cwd === undefined) {
        const cwd = draft.cwd.trim();
        if (cwd !== (typeof live.cwd === "string" ? live.cwd : "")) patch.cwd = cwd;
      }
    } else if (draft.locked.url === undefined) {
      const url = draft.url.trim();
      if (url !== (typeof live.url === "string" ? live.url : "")) {
        if (!url) throw new Error(t("form.urlRequired"));
        if (!/^https?:\/\//.test(url)) throw new Error(t("form.invalidUrl"));
        patch.url = url;
      }
    }
    Object.assign(patch, advancedPatch(draft, live, t));
    const reconnect = reconnectPatch(draft, liveReconnect, t);
    if (Object.keys(reconnect).length) patch.reconnect = reconnect;
    const credentials = credentialPatch(draft.credentials, t);
    if (credentials !== undefined) patch[draft.transport === "stdio" ? "env" : "headers"] = credentials;
    return Object.keys(patch).length ? patch : null;
  }

  function ManagerPage(props) {
    const t = typeof props.t === "function" ? props.t : fallbackT;
    const [tab, setTab] = React.useState("mcp");
    const [status, setStatus] = React.useState(null);
    const [servers, setServers] = React.useState(null);
    const [toolsAvailable, setToolsAvailable] = React.useState(true);
    const [ungrouped, setUngrouped] = React.useState([]);
    const [duplicates, setDuplicates] = React.useState([]);
    const [guarded, setGuarded] = React.useState(new Set());
    const [skills, setSkills] = React.useState(null);
    const [skillsComplete, setSkillsComplete] = React.useState(true);
    const [busy, setBusy] = React.useState("load");
    const [error, setError] = React.useState("");
    const [notice, setNotice] = React.useState("");
    const [form, setForm] = React.useState(null);
    const [draft, setDraft] = React.useState(null);
    const [confirm, setConfirm] = React.useState(null);
    const [skillView, setSkillView] = React.useState(null);
    const [skillForm, setSkillForm] = React.useState(null);

    /** One sequence for every read; a newer request or unmount discards older results. */
    const sequence = React.useRef(0);
    const locked = busy !== null;
    const canWriteMcp = status?.writes?.mcp === true;
    const canWriteGuards = status?.writes?.guards === true;
    const canWriteSkills = status?.writes?.skills === true;

    React.useEffect(() => {
      void (async () => {
        const id = ++sequence.current;
        const settled = await Promise.allSettled([
          requestHost("compatibility.status"),
          requestHost("mcp.discover"),
          requestHost("skills.list"),
        ]);
        if (id !== sequence.current) return;
        const failures = [];
        const [statusRead, mcpRead, skillRead] = settled;
        const failure = (result) => result.status === "rejected" ? errorText(result.reason, t) : t("error.badResponse");
        if (statusRead.status === "fulfilled" && isRecord(statusRead.value) && isRecord(statusRead.value.writes)) {
          setStatus(statusRead.value);
        } else {
          setStatus(null);
          failures.push(failure(statusRead));
        }
        if (mcpRead.status === "fulfilled" && isRecord(mcpRead.value) && Array.isArray(mcpRead.value.servers)) {
          applyMcp(mcpRead.value);
        } else {
          setServers([]);
          failures.push(failure(mcpRead));
        }
        if (skillRead.status === "fulfilled" && isRecord(skillRead.value) && Array.isArray(skillRead.value.skills)) {
          setSkills(skillRead.value.skills);
          setSkillsComplete(skillRead.value.complete !== false);
        } else {
          setSkills([]);
          failures.push(failure(skillRead));
        }
        setError(failures.join(" "));
        setBusy(null);
      })();
      return () => { sequence.current += 1; };
    }, []);

    function applyMcp(value) {
      setServers(value.servers);
      setToolsAvailable(value.toolsAvailable !== false);
      setUngrouped(Array.isArray(value.ungrouped) ? value.ungrouped : []);
      setDuplicates(Array.isArray(value.duplicateServerNames) ? value.duplicateServerNames : []);
      setGuarded(new Set(Array.isArray(value.guardedTools) ? value.guardedTools : []));
    }

    async function reloadMcp() {
      const id = ++sequence.current;
      const value = await requestHost("mcp.discover");
      if (id !== sequence.current) return;
      if (!isRecord(value) || !Array.isArray(value.servers)) throw new Error(t("error.badResponse"));
      applyMcp(value);
    }

    async function reloadSkills() {
      const id = ++sequence.current;
      const value = await requestHost("skills.list");
      if (id !== sequence.current) return;
      if (!isRecord(value) || !Array.isArray(value.skills)) throw new Error(t("error.badResponse"));
      setSkills(value.skills);
      setSkillsComplete(value.complete !== false);
    }

    async function run(kind, action) {
      if (locked) return;
      setBusy(kind);
      setError("");
      setNotice("");
      try {
        await action();
      } catch (thrown) {
        setError(errorText(thrown, t));
      } finally {
        setBusy(null);
      }
    }

    /** One short sentence for a write's outcome; `head` names what happened. */
    function outcomeText(head, value) {
      // `head` is a complete sentence, so the suffix joins at the clause boundary, not after its full stop.
      const stem = head.replace(/[。.；;！!]+$/, "");
      const application = value?.application;
      if (application === "restart-required") return `${stem}${t("notice.restartSuffix")}`;
      if (application === "overridden") return `${stem}${t("notice.overriddenSuffix")}`;
      return `${stem}${t("notice.appliedSuffix")}`;
    }

    function refresh() {
      void run("refresh", async () => {
        const id = ++sequence.current;
        const settled = await Promise.allSettled([requestHost("mcp.discover"), requestHost("skills.list")]);
        if (id !== sequence.current) return;
        const problems = [];
        const [mcpRead, skillRead] = settled;
        if (mcpRead.status === "fulfilled" && isRecord(mcpRead.value) && Array.isArray(mcpRead.value.servers)) applyMcp(mcpRead.value);
        else problems.push(mcpRead.status === "rejected" ? errorText(mcpRead.reason, t) : t("error.badResponse"));
        if (skillRead.status === "fulfilled" && isRecord(skillRead.value) && Array.isArray(skillRead.value.skills)) {
          setSkills(skillRead.value.skills);
          setSkillsComplete(skillRead.value.complete !== false);
        } else {
          problems.push(skillRead.status === "rejected" ? errorText(skillRead.reason, t) : t("error.badResponse"));
        }
        if (problems.length) throw new Error(problems.join(" "));
      });
    }

    function openCreate() {
      if (locked || !canWriteMcp) return;
      setForm({ mode: "create" });
      setDraft(blankDraft());
      setConfirm(null);
      setError("");
      setNotice("");
    }

    function openEdit(server) {
      if (locked || !canWriteMcp || !server.editable) return;
      setForm({ mode: "edit", entryId: server.entryId });
      setDraft(draftFor(server));
      setConfirm(null);
      setError("");
      setNotice("");
    }

    function closeForm() {
      setForm(null);
      setDraft(null);
    }

    const set = (key, value) => setDraft((current) => current === null ? current : { ...current, [key]: value });

    function setCredential(index, key, value) {
      setDraft((current) => {
        if (current === null) return current;
        return { ...current, credentials: current.credentials.map((row, at) => at === index ? { ...row, [key]: value } : row) };
      });
    }

    function removeCredential(index) {
      setDraft((current) => {
        if (current === null) return current;
        const row = current.credentials[index];
        if (!row) return current;
        if (!row.existing) return { ...current, credentials: current.credentials.filter((_, at) => at !== index) };
        return {
          ...current,
          credentials: current.credentials.map((item, at) => at === index ? { ...item, remove: !item.remove, value: "" } : item),
        };
      });
    }

    function submitForm(event) {
      event.preventDefault();
      if (locked || form === null || draft === null || !canWriteMcp) return;
      const server = form.mode === "edit" ? (servers ?? []).find((row) => row.entryId === form.entryId) : undefined;
      if (form.mode === "edit" && server === undefined) {
        setError(t("error.badResponse"));
        return;
      }
      let payload;
      try {
        payload = form.mode === "create" ? createPayload(draft, t) : updatePayload(draft, server, t);
      } catch (thrown) {
        setError(errorText(thrown, t));
        return;
      }
      if (payload === null) {
        setNotice(t("form.unchanged"));
        closeForm();
        return;
      }
      void run("save", async () => {
        const value = form.mode === "create"
          ? await requestHost("mcp.create", payload)
          : await requestHost("mcp.update", { entryId: form.entryId, patch: payload });
        closeForm();
        await reloadMcp();
        setNotice(value?.application === "restart-required" ? t("notice.restart")
          : value?.application === "overridden" ? t("notice.overridden")
            : t("notice.applied"));
      });
    }

    function resetEntry() {
      if (locked || form === null || form.mode !== "edit" || !canWriteMcp) return;
      const entryId = form.entryId;
      void run("save", async () => {
        const value = await requestHost("mcp.reset", { entryId });
        if (value?.changed === false) {
          setNotice(t("notice.resetNoop"));
          return;
        }
        closeForm();
        await reloadMcp();
        setNotice(outcomeText(t("notice.reset"), value));
      });
    }

    function toggleServer(server) {
      if (locked || !canWriteMcp) return;
      void run("toggle:" + server.entryId, async () => {
        const value = await requestHost("mcp.set-enabled", { entryId: server.entryId, enabled: server.disabled === true });
        await reloadMcp();
        setNotice(outcomeText(t(server.disabled ? "notice.enabled" : "notice.off"), value));
      });
    }

    function removeServer(server) {
      if (locked || !canWriteMcp) return;
      void run("remove:" + server.entryId, async () => {
        const value = await requestHost("mcp.remove", { entryId: server.entryId });
        setConfirm(null);
        if (form !== null && form.entryId === server.entryId) closeForm();
        await reloadMcp();
        const head = value?.removed === "disabled" ? t("notice.removedDisabled") : t("notice.removed");
        setNotice(outcomeText(head, value));
      });
    }

    function openSkillForm() {
      if (locked || !canWriteSkills) return;
      setSkillForm({ name: "", description: "", whenToUse: "", content: "" });
      setError("");
      setNotice("");
    }

    function submitSkill(event) {
      event.preventDefault();
      if (locked || skillForm === null || !canWriteSkills) return;
      const args = {
        name: skillForm.name.trim(),
        description: skillForm.description.trim(),
        content: skillForm.content,
      };
      if (skillForm.whenToUse.trim()) args.whenToUse = skillForm.whenToUse.trim();
      void run("skill-save", async () => {
        await requestHost("skills.register", args);
        setSkillForm(null);
        await reloadSkills();
        setNotice(t("notice.skillRegistered"));
      });
    }

    function viewSkill(name) {
      if (locked) return;
      void run("skill-view:" + name, async () => {
        const value = await requestHost("skills.get", { name });
        setSkillView({ name, content: value?.skill?.content ?? "" });
      });
    }

    function unregisterSkill(name) {
      if (locked || !canWriteSkills) return;
      void run("skill-remove:" + name, async () => {
        await requestHost("skills.unregister", { name });
        setConfirm(null);
        if (skillView?.name === name) setSkillView(null);
        await reloadSkills();
        setNotice(t("notice.skillUnregistered"));
      });
    }

    function toggleTool(toolName) {
      if (locked || !canWriteGuards) return;
      const disable = !guarded.has(toolName);
      void run("tool:" + toolName, async () => {
        await requestHost("mcp.set-tool-disabled", { toolName, disabled: disable });
        setGuarded((current) => {
          const next = new Set(current);
          if (disable) next.add(toolName);
          else next.delete(toolName);
          return next;
        });
        setNotice(t(disable ? "notice.toolGuarded" : "notice.toolUnguarded"));
        await reloadMcp();
      });
    }

    function statusNotice() {
      if (status === null) return null;
      // `guards` also rides on a tested version, so its absence is reported beside the others.
      if (canWriteMcp && canWriteSkills && canWriteGuards) return null;
      const missing = Object.entries(status.capabilities ?? {})
        .filter(([, available]) => available !== true)
        .map(([name]) => name);
      return h("details", { className: "dsh-msm-note dsh-msm-details" },
        h("summary", null, t("write.disabled")),
        h("div", { className: "dsh-msm-muted" }, t("write.runtime", { version: status.runtimeVersion ?? "?" })),
        h("div", { className: "dsh-msm-muted" }, t("write.plugin", { version: status.pluginVersion ?? "?" })),
        h("div", { className: "dsh-msm-muted" }, t("write.tested", { versions: (status.testedRuntimeVersions ?? []).join(", ") || "—" })),
        missing.length ? h("div", { className: "dsh-msm-muted" }, t("write.missing", { names: missing.join(", ") })) : null,
        !canWriteGuards && status.capabilities?.toolGuard === false ? h("div", { className: "dsh-msm-muted" }, t("write.guardsMissing")) : null,
        status.reason ? h("div", { className: "dsh-msm-muted" }, status.reason) : null);
    }

    function renderTab(id, label, count) {
      return h("button", {
        className: "dsh-msm-tab",
        type: "button",
        role: "tab",
        "aria-selected": tab === id,
        onClick: () => setTab(id),
      }, label, h("span", { className: "dsh-msm-count" }, String(count)));
    }

    function renderTool(tool) {
      const on = guarded.has(tool);
      const label = on ? t("mcp.toolGuardOff") : t("mcp.toolGuardOn");
      return h("li", { className: "dsh-msm-tool" + (on ? " dsh-msm-tool-guarded" : ""), key: tool },
        h("span", { className: "dsh-msm-tool-name" }, tool),
        on ? h("span", { className: "dsh-msm-tag dsh-msm-tag-warn" }, t("mcp.toolGuarded")) : null,
        canWriteGuards
          ? h("button", {
            className: "dsh-msm-btn dsh-msm-link",
            type: "button",
            title: t("mcp.toolGuardHint"),
            "aria-label": label + " " + tool,
            disabled: locked,
            onClick: () => toggleTool(tool),
          }, label)
          : null);
    }

    function renderServer(server) {
      const name = server.serverName || server.entryId;
      const count = Number.isFinite(server.toolCount) ? server.toolCount : 0;
      const editTitle = !server.editable ? (server.disabled ? t("mcp.enableFirst") : t("mcp.notLoaded")) : undefined;
      const removing = confirm?.kind === "remove" && confirm.id === server.entryId;
      return h("article", { className: "dsh-msm-card", key: server.entryId },
        h("div", { className: "dsh-msm-card-top" },
          h("div", { className: "dsh-msm-title" },
            h("span", { className: "dsh-msm-name" }, name),
            h("span", { className: "dsh-msm-tag" }, server.transport),
            h("span", {
              className: "dsh-msm-tag",
              title: server.source === "profile" ? undefined : t("source.bundleTitle"),
            }, server.source === "profile" ? t("source.profile") : t("source.bundle")),
            server.disabled ? h("span", { className: "dsh-msm-tag dsh-msm-tag-warn" }, t("state.disabled")) : null),
          h("div", { className: "dsh-msm-actions" },
            h("button", {
              className: "dsh-msm-btn",
              type: "button",
              title: editTitle,
              disabled: locked || !canWriteMcp || !server.editable,
              onClick: () => openEdit(server),
            }, t("action.edit")),
            h("button", {
              className: "dsh-msm-btn",
              type: "button",
              disabled: locked || !canWriteMcp,
              onClick: () => toggleServer(server),
            }, server.disabled ? t("action.enable") : t("action.disable")),
            server.removable
              ? removing
                ? h(React.Fragment, null,
                  h("button", { className: "dsh-msm-btn dsh-msm-btn-danger", type: "button", disabled: locked || !canWriteMcp, onClick: () => removeServer(server) }, t("action.confirmRemove")),
                  h("button", { className: "dsh-msm-btn", type: "button", onClick: () => setConfirm(null) }, t("action.cancel")))
                : h("button", { className: "dsh-msm-btn dsh-msm-btn-danger", type: "button", disabled: locked || !canWriteMcp, onClick: () => setConfirm({ kind: "remove", id: server.entryId }) }, t("action.remove"))
              : null)),
        h("div", { className: "dsh-msm-summary" }, server.summary),
        server.loadFailed ? h("div", { className: "dsh-msm-note dsh-msm-note-error", role: "alert" }, t("mcp.loadFailed")) : null,
        server.empty ? h("div", { className: "dsh-msm-note" }, t("mcp.noTools")) : null,
        h("details", { className: "dsh-msm-tools" },
          h("summary", null, t("mcp.tools", { count }),
            server.guardedCount ? " · " + t("mcp.guardedCount", { count: server.guardedCount }) : ""),
          Array.isArray(server.tools) && server.tools.length
            ? h("ul", { className: "dsh-msm-tool-list" }, server.tools.map(renderTool))
            : h("div", { className: "dsh-msm-muted" }, server.disabled ? t("state.disabled") : t("mcp.noTools"))));
    }

    function renderCredential(row, index) {
      const removed = row.remove === true;
      return h("div", { className: "dsh-msm-cred" + (removed ? " dsh-msm-cred-removed" : ""), key: row.existing ? row.key : "new:" + index },
        row.existing
          ? h(React.Fragment, null,
            h("span", { className: "dsh-msm-cred-key" }, row.key),
            h("span", { className: "dsh-msm-tag" }, t("form.credentialSet")),
            h("input", {
              className: "dsh-msm-input",
              "aria-label": t("form.credentialReplace") + " " + row.key,
              placeholder: t("form.credentialReplace"),
              value: row.value,
              disabled: locked || removed,
              onChange: (event) => setCredential(index, "value", event.currentTarget.value),
            }))
          : h(React.Fragment, null,
            h("input", {
              className: "dsh-msm-input",
              "aria-label": t("form.credentialKey") + " " + index,
              placeholder: t("form.credentialKey"),
              value: row.key,
              disabled: locked,
              onChange: (event) => setCredential(index, "key", event.currentTarget.value),
            }),
            h("input", {
              className: "dsh-msm-input",
              "aria-label": t("form.credentialValue") + " " + index,
              placeholder: t("form.credentialValue"),
              value: row.value,
              disabled: locked,
              onChange: (event) => setCredential(index, "value", event.currentTarget.value),
            })),
        h("button", {
          className: "dsh-msm-btn dsh-msm-btn-danger",
          type: "button",
          disabled: locked,
          onClick: () => removeCredential(index),
        }, row.existing && row.remove ? t("action.undoRemove") : t("action.removeCredential")));
    }

    function renderForm() {
      const creating = form.mode === "create";
      const server = creating ? undefined : (servers ?? []).find((row) => row.entryId === form.entryId);
      if (!creating && server === undefined) return null;
      const transport = draft.transport;
      const expressionNote = (field) => draft.locked[field] === undefined ? null
        : h("div", { className: "dsh-msm-muted" }, t("form.expression"), h("code", { className: "dsh-msm-code" }, draft.locked[field]));
      const credentialLabel = transport === "stdio" ? t("form.env") : t("form.headers");
      return h("form", {
        className: "dsh-msm-card dsh-msm-form",
        "aria-label": creating ? t("form.create") : t("form.edit"),
        onSubmit: submitForm,
      },
      h("h2", { className: "dsh-msm-form-title" }, creating ? t("form.create") : t("form.edit")),
      creating
        ? h(Field, { label: t("form.name"), hint: t("form.nameHint") },
          h("input", {
            className: "dsh-msm-input",
            "aria-label": t("form.name"),
            placeholder: t("form.namePlaceholder"),
            value: draft.serverName,
            disabled: locked,
            onChange: (event) => set("serverName", event.currentTarget.value),
          }))
        : h("div", { className: "dsh-msm-muted" }, server.serverName || server.entryId),
      creating
        ? h(Field, { label: t("form.transport") },
          h("select", {
            className: "dsh-msm-input",
            "aria-label": t("form.transport"),
            value: draft.transport,
            disabled: locked,
            onChange: (event) => set("transport", event.currentTarget.value),
          },
          h("option", { value: "stdio" }, t("form.stdio")),
          h("option", { value: "streamable-http" }, t("form.http"))))
        : null,
      transport === "stdio"
        ? h(React.Fragment, null,
          expressionNote("command"),
          draft.locked.command === undefined
            ? h(Field, { label: t("form.command"), hint: t("form.commandHint") },
              h("input", {
                className: "dsh-msm-input",
                "aria-label": t("form.command"),
                value: draft.command,
                disabled: locked,
                onChange: (event) => set("command", event.currentTarget.value),
              }))
            : null,
          expressionNote("args"),
          draft.locked.args === undefined
            ? h(Field, { label: t("form.args"), hint: t("form.argsHint") },
              h("textarea", {
                className: "dsh-msm-input dsh-msm-textarea",
                "aria-label": t("form.args"),
                value: draft.args,
                disabled: locked,
                spellCheck: false,
                onChange: (event) => set("args", event.currentTarget.value),
              }))
            : null,
          expressionNote("cwd"),
          draft.locked.cwd === undefined
            ? h(Field, { label: t("form.cwd"), hint: t("form.cwdHint") },
              h("input", {
                className: "dsh-msm-input",
                "aria-label": t("form.cwd"),
                value: draft.cwd,
                disabled: locked,
                onChange: (event) => set("cwd", event.currentTarget.value),
              }))
            : null)
        : h(React.Fragment, null,
          expressionNote("url"),
          draft.locked.url === undefined
            ? h(Field, { label: t("form.url"), hint: t("form.urlHint") },
              h("input", {
                className: "dsh-msm-input",
                "aria-label": t("form.url"),
                value: draft.url,
                disabled: locked,
                onChange: (event) => set("url", event.currentTarget.value),
              }))
            : null),
      h("div", { className: "dsh-msm-field" },
        h("span", { className: "dsh-msm-label" }, credentialLabel),
        draft.credentials.map(renderCredential),
        h("div", { className: "dsh-msm-actions" },
          h("button", {
            className: "dsh-msm-btn dsh-msm-link",
            type: "button",
            disabled: locked,
            onClick: () => set("credentials", [...draft.credentials, { key: "", value: "", existing: false }]),
          }, t("action.addCredential"))),
        h("span", { className: "dsh-msm-hint" }, t("form.credentialHint"))),
      h("div", { className: "dsh-msm-field" },
        h("button", {
          className: "dsh-msm-btn dsh-msm-link",
          type: "button",
          onClick: () => set("advancedOpen", !draft.advancedOpen),
        }, (draft.advancedOpen ? "▾ " : "▸ ") + t("action.advanced")),
        draft.advancedOpen
          ? h("div", { className: "dsh-msm-field" },
            expressionNote("toolCallTimeoutMs"),
            draft.locked.toolCallTimeoutMs === undefined
              ? h(Field, { label: t("form.timeout") },
                h("input", { className: "dsh-msm-input", "aria-label": t("form.timeout"), inputMode: "numeric", value: draft.timeout, disabled: locked, onChange: (event) => set("timeout", event.currentTarget.value) }))
              : null,
            expressionNote("maxInstructionBytes"),
            draft.locked.maxInstructionBytes === undefined
              ? h(Field, { label: t("form.instructionBytes") },
                h("input", { className: "dsh-msm-input", "aria-label": t("form.instructionBytes"), inputMode: "numeric", value: draft.instructionBytes, disabled: locked, onChange: (event) => set("instructionBytes", event.currentTarget.value) }))
              : null,
            h("label", { className: "dsh-msm-check" },
              h("input", {
                type: "checkbox",
                "aria-label": t("form.failOnStartup"),
                checked: draft.failOnStartup,
                disabled: locked || isRecord(server?.config?.fields?.failOnStartupError),
                onChange: (event) => set("failOnStartup", event.currentTarget.checked),
              }),
              t("form.failOnStartup")),
            h("span", { className: "dsh-msm-hint" }, t("form.failOnStartupHint")),
            draft.reconnectLocked?.enabled === undefined
              ? h("label", { className: "dsh-msm-check" },
                h("input", {
                  type: "checkbox",
                  "aria-label": t("form.reconnect"),
                  checked: draft.reconnectEnabled,
                  disabled: locked,
                  onChange: (event) => setDraft((current) => current === null ? current : { ...current, reconnectEnabled: event.currentTarget.checked, reconnectTouched: true }),
                }),
                t("form.reconnect"))
              : expressionNote("reconnect.enabled"),
            h(Field, { label: t("form.reconnectInitial") },
              h("input", { className: "dsh-msm-input", "aria-label": t("form.reconnectInitial"), inputMode: "numeric", value: draft.reconnectInitial, disabled: locked, onChange: (event) => set("reconnectInitial", event.currentTarget.value) })),
            h(Field, { label: t("form.reconnectMax") },
              h("input", { className: "dsh-msm-input", "aria-label": t("form.reconnectMax"), inputMode: "numeric", value: draft.reconnectMax, disabled: locked, onChange: (event) => set("reconnectMax", event.currentTarget.value) })),
            h(Field, { label: t("form.reconnectAttempts") },
              h("input", { className: "dsh-msm-input", "aria-label": t("form.reconnectAttempts"), inputMode: "numeric", value: draft.reconnectAttempts, disabled: locked, onChange: (event) => set("reconnectAttempts", event.currentTarget.value) })))
          : null),
      h("div", { className: "dsh-msm-actions" },
        h("button", { className: "dsh-msm-btn dsh-msm-btn-primary", type: "submit", disabled: locked || !canWriteMcp }, busy === "save" ? t("action.saving") : t("action.save")),
        !creating && server.overridden
          ? h("button", { className: "dsh-msm-btn", type: "button", disabled: locked || !canWriteMcp, onClick: resetEntry }, t("action.reset"))
          : null,
        h("button", { className: "dsh-msm-btn", type: "button", disabled: locked, onClick: closeForm }, t("action.cancel"))));
    }

    function renderMcp() {
      const list = servers ?? [];
      return h("div", { className: "dsh-msm-list" },
        duplicates.length ? h("div", { className: "dsh-msm-note" }, t("mcp.duplicate", { names: duplicates.join(", ") })) : null,
        !toolsAvailable ? h("div", { className: "dsh-msm-muted" }, t("mcp.toolsUnavailable")) : null,
        form !== null ? renderForm() : null,
        servers === null ? null
          : list.length === 0
            ? h("div", { className: "dsh-msm-empty" }, t("mcp.empty"), " ", t("mcp.emptyHint"))
            : h("div", { className: "dsh-msm-list" }, list.map(renderServer)),
        ungrouped.length
          ? h("details", { className: "dsh-msm-note dsh-msm-details" },
            h("summary", null, t("mcp.ungrouped", { count: ungrouped.length })),
            h("ul", { className: "dsh-msm-tool-list" }, ungrouped.map((tool) => h("li", { key: tool }, tool))))
          : null,
        canWriteGuards ? h("div", { className: "dsh-msm-muted" }, t("mcp.toolGuardHint")) : null,
        h("div", { className: "dsh-msm-muted" }, t("mcp.footnote")));
    }

    function renderSkill(skill) {
      const detail = [skill.source, skill.provider, skill.description].filter((part) => typeof part === "string" && part).join(" · ");
      const removing = confirm?.kind === "unregister" && confirm.name === skill.name;
      return h("article", { className: "dsh-msm-card", key: skill.name },
        h("div", { className: "dsh-msm-card-top" },
          h("div", { className: "dsh-msm-title" },
            h("span", { className: "dsh-msm-name" }, skill.name),
            skill.canUnregister ? h("span", { className: "dsh-msm-tag" }, "runtime") : null),
          h("div", { className: "dsh-msm-actions" },
            h("button", { className: "dsh-msm-btn", type: "button", disabled: locked, onClick: () => viewSkill(skill.name) }, t("action.view")),
            skill.canUnregister
              ? removing
                ? h(React.Fragment, null,
                  h("button", { className: "dsh-msm-btn dsh-msm-btn-danger", type: "button", disabled: locked || !canWriteSkills, onClick: () => unregisterSkill(skill.name) }, t("action.confirmUnregister")),
                  h("button", { className: "dsh-msm-btn", type: "button", onClick: () => setConfirm(null) }, t("action.cancel")))
                : h("button", { className: "dsh-msm-btn dsh-msm-btn-danger", type: "button", disabled: locked || !canWriteSkills, onClick: () => setConfirm({ kind: "unregister", name: skill.name }) }, t("action.unregister"))
              : null)),
        detail ? h("div", { className: "dsh-msm-muted" }, detail) : null,
        typeof skill.path === "string" && skill.path ? h("div", { className: "dsh-msm-muted" }, skill.path) : null);
    }

    function renderSkillForm() {
      const update = (patch) => setSkillForm((current) => current === null ? current : { ...current, ...patch });
      return h("form", { className: "dsh-msm-card dsh-msm-form", "aria-label": t("skills.register"), onSubmit: submitSkill },
        h("h2", { className: "dsh-msm-form-title" }, t("skills.register")),
        h(Field, { label: t("skills.name"), hint: t("skills.nameHint") },
          h("input", { className: "dsh-msm-input", "aria-label": t("skills.name"), value: skillForm.name, disabled: locked, onChange: (event) => update({ name: event.currentTarget.value }) })),
        h(Field, { label: t("skills.description") },
          h("input", { className: "dsh-msm-input", "aria-label": t("skills.description"), value: skillForm.description, disabled: locked, onChange: (event) => update({ description: event.currentTarget.value }) })),
        h(Field, { label: t("skills.whenToUse"), hint: t("skills.whenToUseHint") },
          h("input", { className: "dsh-msm-input", "aria-label": t("skills.whenToUse"), value: skillForm.whenToUse, disabled: locked, onChange: (event) => update({ whenToUse: event.currentTarget.value }) })),
        h(Field, { label: t("skills.content") },
          h("textarea", { className: "dsh-msm-input dsh-msm-textarea", "aria-label": t("skills.content"), value: skillForm.content, disabled: locked, spellCheck: false, required: true, onChange: (event) => update({ content: event.currentTarget.value }) })),
        h("div", { className: "dsh-msm-actions" },
          h("button", { className: "dsh-msm-btn dsh-msm-btn-primary", type: "submit", disabled: locked || !canWriteSkills }, busy === "skill-save" ? t("action.saving") : t("action.save")),
          h("button", { className: "dsh-msm-btn", type: "button", disabled: locked, onClick: () => setSkillForm(null) }, t("action.cancel"))));
    }

    function renderSkills() {
      const list = skills ?? [];
      return h("div", { className: "dsh-msm-list" },
        h("div", { className: "dsh-msm-actions" },
          h("button", { className: "dsh-msm-btn dsh-msm-btn-primary", type: "button", disabled: locked || !canWriteSkills, onClick: openSkillForm }, t("skills.register"))),
        h("div", { className: "dsh-msm-muted" }, t("skills.note")),
        !skillsComplete ? h("div", { className: "dsh-msm-note" }, t("skills.incomplete")) : null,
        skillForm !== null ? renderSkillForm() : null,
        skills === null ? null
          : list.length === 0
            ? h("div", { className: "dsh-msm-empty" }, t("skills.empty"))
            : h("div", { className: "dsh-msm-list" }, list.map(renderSkill)),
        skillView !== null
          ? h("article", { className: "dsh-msm-card" },
            h("div", { className: "dsh-msm-card-top" },
              h("span", { className: "dsh-msm-name" }, t("skills.viewTitle", { name: skillView.name })),
              h("button", { className: "dsh-msm-btn", type: "button", onClick: () => setSkillView(null) }, t("action.close"))),
            h("pre", { className: "dsh-msm-pre" }, skillView.content || t("skills.contentEmpty")))
          : null);
    }

    return h("section", { className: "dsh-msm" },
      h("div", { className: "dsh-msm-head" },
        h("div", { className: "dsh-msm-tabs", role: "tablist", "aria-label": t("tabs.label") },
          renderTab("mcp", t("tab.mcp"), (servers ?? []).length),
          renderTab("skills", t("tab.skills"), (skills ?? []).length)),
        h("div", { className: "dsh-msm-actions" },
          tab === "mcp"
            ? h("button", { className: "dsh-msm-btn dsh-msm-btn-primary", type: "button", disabled: locked || !canWriteMcp || form !== null, onClick: openCreate }, t("action.add"))
            : null,
          h("button", { className: "dsh-msm-btn", type: "button", disabled: locked, onClick: refresh }, busy === "refresh" ? t("state.loading") : t("action.refresh")))),
      statusNotice(),
      error ? h("div", { className: "dsh-msm-note dsh-msm-note-error", role: "alert" }, error) : null,
      notice ? h("div", { className: "dsh-msm-note dsh-msm-note-ok", role: "status" }, notice) : null,
      busy === "load" ? h("div", { className: "dsh-msm-muted" }, t("state.loading")) : null,
      tab === "mcp" ? renderMcp() : renderSkills());
  }

  return ManagerPage;
}

function apply(ctx) {
  const Page = createManagerPage(ctx.connection);
  const translate = (key, params) => {
    const face = ctx.get("locale");
    if (face !== undefined && typeof face.bind === "function") return face.bind(NS)(key, params);
    return fallbackT(key, params);
  };
  // Dictionaries register whenever a locale face exists; without one the page keeps its built-in copy.
  if (typeof ctx.inject === "function") {
    ctx.inject(["locale"], (localized) => {
      localized.effect(() => localized.locale.register(NS, { zh, en }), "mcp-skill-manager dictionaries");
    });
  }
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "mcp-skill-manager",
    order: 25,
    label: () => translate("nav"),
    // A locale seat without an installed locale face fails the assembly, so declare it only when present.
    ...(ctx.get("locale") === undefined ? {} : { locale: NS }),
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
