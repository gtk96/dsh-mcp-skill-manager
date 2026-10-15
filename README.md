# DSH MCP & Skill Manager

一个用于 DeepSeek Harness（DSH）的插件仓库，首期提供 MCP 配置管理和 Skill 目录管理工具。

## 功能

### MCP

`dsh_manage_mcp_servers` 支持：

- 查看配置条目中的 MCP server 名称和字段；敏感字段值会隐藏，普通字符串值也只显示为 `[configured]`。
- 在指定配置条目和配置路径下新增或更新 server 定义。
- 从指定配置条目移除 server 定义。

server 定义会经 `configEditor.edit()` 写入并由 DSH Loader 校验和应用。新增/更新只写当前条目的 override 路径，保留 inherited 配置及其兄弟字段。移除操作只删除当前条目的 override：若同名 server 也来自 inherited，工具会返回 `inheritedRemains: true`，表示继承定义仍然生效；若该 server 只存在于 inherited，工具会拒绝移除，应编辑其所属配置条目。编辑失败会由 DSH 返回错误，不会报告为成功。配置路径使用点分隔，路径段本身不能包含点号。

先调用工具的 `list` 操作；将返回的 `entry.id`、`entry.patchId` 或 `entry.name` 中任一值作为后续操作的 `entryId`。

### Skill

`dsh_manage_skills` 支持：

- 列出 DSH 当前可见的 Skill 目录。
- 按名称读取 Skill 正文。
- 注册和注销当前插件生命周期内的 runtime Skill；若名称已存在于有效目录中，会拒绝注册。

通过工具注册的 runtime Skill 只在插件本次运行期间有效；持久化 Skill 文件的安装、编辑和移除不属于首期能力。

## 插件接口

插件按 Cordis 插件约定导出 `name`、`inject`、`Config` 和 `apply`，依赖 DSH 的 `configEditor`、`skills` 与 `tools` Host Services。运行时 Skill 采用 DSH `ctx.skills.register()`，工具使用 `ctx.tools.register()`；插件退出时通过 Cordis effect 注销工具和 runtime Skill。

## 安装与开发

本仓库采用原生 ESM 入口 `index.js`，无构建步骤。将仓库作为 DSH 插件安装后，在配置中设置例如：

```yaml
mcpConfigPath: mcp.servers
```

上例中的路径仅为格式示例；应填写当前 DSH Profile 中实际承载 MCP server map 的路径。MCP 管理工具读取配置条目，不会尝试连接或启动 MCP server。

插件会隐藏返回结果中的凭据类字段，并隐藏普通字符串配置值。添加 MCP server 时，应使用运行环境支持的凭据引用方式，不要把密钥提交到仓库。

## 开源许可

MIT，详见 [LICENSE](LICENSE)。
