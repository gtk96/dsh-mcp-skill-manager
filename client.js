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
async function callHost(method, args) {
  const result = await connection.rpc.call("/api", "mcp-skill-manager." + method, args ?? {});
  if (isRecord(result) && Object.prototype.hasOwnProperty.call(result, "ok")) {
    if (result.ok !== true) throw new Error(result.error && result.error.message || "Host 操作失败。");
    return result.value;
  }
  return result;
}

function Field(props) {
  return h("label", { className: "dsh-msm-field" },
    h("span", { className: "dsh-msm-label" }, props.label),
    props.children,
    props.hint ? h("span", { className: "dsh-msm-hint" }, props.hint) : null);
}

function ManagerPage() {
  const [tab, setTab] = React.useState("mcp");
  const [mcpPath, setMcpPath] = React.useState("");
  const [mcpEntries, setMcpEntries] = React.useState([]);
  const [entryId, setEntryId] = React.useState("");
  const [mcpBusy, setMcpBusy] = React.useState(false);
  const [mcpError, setMcpError] = React.useState("");
  const [mcpNotice, setMcpNotice] = React.useState("");
  const [serverFormOpen, setServerFormOpen] = React.useState(false);
  const [serverName, setServerName] = React.useState("");
  const [definitionText, setDefinitionText] = React.useState("");
  const [removeServerName, setRemoveServerName] = React.useState("");
  const [skills, setSkills] = React.useState([]);
  const [skillsBusy, setSkillsBusy] = React.useState(false);
  const [skillsError, setSkillsError] = React.useState("");
  const [skillsNotice, setSkillsNotice] = React.useState("");
  const [selectedSkill, setSelectedSkill] = React.useState(null);
  const [unregisterName, setUnregisterName] = React.useState("");
  const [skillFormOpen, setSkillFormOpen] = React.useState(false);
  const [skillName, setSkillName] = React.useState("");
  const [skillDescription, setSkillDescription] = React.useState("");
  const [skillWhenToUse, setSkillWhenToUse] = React.useState("");
  const [skillContent, setSkillContent] = React.useState("");

  async function refreshMcp(pathOverride) {
    const requestedPath = typeof pathOverride === "string" ? pathOverride : mcpPath;
    setMcpBusy(true);
    setMcpError("");
    setMcpNotice("");
    try {
      const query = requestedPath.trim() ? { configPath: requestedPath } : {};
      const result = await callHost("mcp.catalog", query);
      const nextEntries = Array.isArray(result && result.entries) ? result.entries : [];
      setMcpEntries(nextEntries);
      setMcpPath((current) => current.trim() ? current : (result && result.configPath || ""));
      setEntryId((current) => nextEntries.some((row) => row.entry && row.entry.id === current)
        ? current
        : nextEntries[0] && nextEntries[0].entry && nextEntries[0].entry.id || "");
    } catch (error) {
      setMcpError(errorText(error));
    } finally {
      setMcpBusy(false);
    }
  }

  async function refreshSkills() {
    setSkillsBusy(true);
    setSkillsError("");
    try {
      const result = await callHost("skills.list", {});
      setSkills(Array.isArray(result && result.skills) ? result.skills : []);
    } catch (error) {
      setSkillsError(errorText(error));
    } finally {
      setSkillsBusy(false);
    }
  }

  async function loadSkill(name) {
    setSkillsError("");
    try {
      const result = await callHost("skills.get", { name });
      setSelectedSkill(result && result.skill || null);
    } catch (error) {
      setSkillsError(errorText(error));
    }
  }

  React.useEffect(() => {
    void refreshMcp("");
    void refreshSkills();
  }, []);

  const selectedEntry = mcpEntries.find((row) => row.entry && row.entry.id === entryId) || mcpEntries[0] || null;
  const serverRows = selectedEntry && isRecord(selectedEntry.servers) ? Object.entries(selectedEntry.servers) : [];

  async function saveServer(event) {
    event.preventDefault();
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
    setMcpBusy(true);
    try {
      const args = { entryId: selectedEntry.entry.id, name: serverName.trim(), definition };
      if (mcpPath.trim()) args.configPath = mcpPath.trim();
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
    }
  }

  async function removeServer(name) {
    if (!selectedEntry || !selectedEntry.entry) return;
    setMcpError("");
    setMcpNotice("");
    setMcpBusy(true);
    try {
      const args = { entryId: selectedEntry.entry.id, name };
      if (mcpPath.trim()) args.configPath = mcpPath.trim();
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
    }
  }

  async function registerSkill(event) {
    event.preventDefault();
    setSkillsError("");
    setSkillsNotice("");
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
    }
  }

  async function unregisterSkill(name) {
    setSkillsError("");
    setSkillsNotice("");
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
    }
  }

  function renderMcp() {
    return h("section", { className: "dsh-msm-panel" },
      h("div", { className: "dsh-msm-row" },
        h(Field, { label: "MCP 配置路径", hint: "例如 mcp.servers；留空时使用插件配置里的默认路径。" },
          h("input", {
            className: "dsh-msm-input",
            value: mcpPath,
            onChange: (event) => setMcpPath(event.currentTarget.value),
            placeholder: "mcp.servers",
          })),
        h("button", { className: "dsh-msm-button", type: "button", disabled: mcpBusy, onClick: () => void refreshMcp(mcpPath) }, mcpBusy ? "读取中…" : "读取配置")),
      h("div", { className: "dsh-msm-muted" }, "新增或更新时请提供完整 JSON；已有定义不会回填，避免凭据出现在页面中。JSON 写入所选条目的 override；同名 inherited 字段会按 DSH 的递归合并规则继续生效。若要移除继承字段，请编辑其来源条目。"),
      mcpError ? h("div", { className: "dsh-msm-notice dsh-msm-error", role: "alert" }, mcpError) : null,
      mcpNotice ? h("div", { className: "dsh-msm-notice dsh-msm-success", role: "status" }, mcpNotice) : null,
      h(Field, { label: "配置条目" },
        h("select", {
          className: "dsh-msm-select",
          value: selectedEntry && selectedEntry.entry ? selectedEntry.entry.id : "",
          onChange: (event) => setEntryId(event.currentTarget.value),
          disabled: !mcpEntries.length,
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
                disabled: mcpBusy,
                onClick: () => {
                  setServerName(name);
                  setDefinitionText("");
                  setServerFormOpen(true);
                  setMcpNotice("当前配置只显示脱敏摘要；编辑会写入 override，inherited 字段仍按 DSH 的递归合并规则生效。");
                },
              }, "编辑 override"),
              removeServerName === name
                ? h(React.Fragment, null,
                  h("button", { className: "dsh-msm-button dsh-msm-button-danger", type: "button", disabled: mcpBusy, onClick: () => void removeServer(name) }, "确认移除"),
                  h("button", { className: "dsh-msm-button", type: "button", onClick: () => setRemoveServerName("") }, "取消"))
                : h("button", { className: "dsh-msm-button dsh-msm-button-danger", type: "button", disabled: mcpBusy, onClick: () => setRemoveServerName(name) }, "移除"))),
          h("pre", { className: "dsh-msm-pre" }, JSON.stringify(summary, null, 2)))))
        : h("div", { className: "dsh-msm-empty" }, mcpPath.trim()
          ? "此配置条目下还没有 MCP server。"
          : "请填写 MCP 配置路径，再读取配置。"),
      h("div", { className: "dsh-msm-actions" },
        h("button", {
          className: "dsh-msm-button",
          type: "button",
          disabled: !selectedEntry || mcpBusy,
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
        h(Field, { label: "JSON 定义", hint: "新增或更新会写入当前条目的 override；同名 inherited 字段可能继续生效。" },
          h("textarea", { className: "dsh-msm-textarea", value: definitionText, onChange: (event) => setDefinitionText(event.currentTarget.value), required: true, spellCheck: false, placeholder: '{\n  "command": "...",\n  "args": []\n}' })),
        h("div", { className: "dsh-msm-actions" },
          h("button", { className: "dsh-msm-button dsh-msm-button-primary", type: "submit", disabled: mcpBusy }, mcpBusy ? "保存中…" : "保存 server")))
        : null);
  }

  function renderSkills() {
    return h("section", { className: "dsh-msm-panel" },
      h("div", { className: "dsh-msm-actions" },
        h("button", { className: "dsh-msm-button", type: "button", disabled: skillsBusy, onClick: () => void refreshSkills() }, skillsBusy ? "读取中…" : "刷新 Skills"),
        h("button", { className: "dsh-msm-button dsh-msm-button-primary", type: "button", disabled: skillsBusy, onClick: () => setSkillFormOpen((open) => !open) }, skillFormOpen ? "关闭表单" : "注册 Runtime Skill")),
      h("div", { className: "dsh-msm-muted" }, "注册的 Runtime Skill 仅在此插件生命周期内有效；持久化 Skill 文件不会由此页面修改。"),
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
          h("button", { className: "dsh-msm-button dsh-msm-button-primary", type: "submit", disabled: skillsBusy }, skillsBusy ? "注册中…" : "注册 Skill")))
        : null,
      skills.length
        ? h("div", { className: "dsh-msm-list" }, skills.map((skill) => h("article", { className: "dsh-msm-card", key: skill.name },
          h("div", { className: "dsh-msm-card-header" },
            h("div", null,
              h("h3", { className: "dsh-msm-card-title" }, skill.name),
              h("div", { className: "dsh-msm-muted" }, `${skill.source || "Skill"}${skill.description ? ` · ${skill.description}` : ""}`)),
            h("div", { className: "dsh-msm-actions" },
              h("button", { className: "dsh-msm-button", type: "button", onClick: () => void loadSkill(skill.name) }, "查看正文"),
              skill.canUnregister
                ? unregisterName === skill.name
                  ? h(React.Fragment, null,
                    h("button", { className: "dsh-msm-button dsh-msm-button-danger", type: "button", disabled: skillsBusy, onClick: () => void unregisterSkill(skill.name) }, "确认注销"),
                    h("button", { className: "dsh-msm-button", type: "button", onClick: () => setUnregisterName("") }, "取消"))
                  : h("button", { className: "dsh-msm-button dsh-msm-button-danger", type: "button", disabled: skillsBusy, onClick: () => setUnregisterName(skill.name) }, "注销")
                : null)))))
        : h("div", { className: "dsh-msm-empty" }, skillsBusy ? "正在读取 Skill 目录…" : "当前没有可见 Skill。"),
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
        h("p", { className: "dsh-msm-subtitle" }, "管理当前 Profile 的 MCP 配置条目和运行期 Skill。"))),
    h("nav", { className: "dsh-msm-tabs", "aria-label": "管理类型" },
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
