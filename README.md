# DSH MCP & Skill Manager

用于 DeepSeek Harness（DSH）的 MCP 配置映射编辑器与 Skill 目录管理插件。

## 安装

需要已安装 DSH，兼容范围为 `^0.2.0-rc.2`。包通过可选 peer 声明兼容范围，包管理器不会为了安装本插件另外下载一套 DSH；DSH 安装器和启动器仍会执行版本兼容检查。

CLI 管理的 Profile 可以使用以下命令。安装目标为公开 HTTPS 源码压缩包，不依赖本机 Git 或 SSH 配置：

```sh
dsh plugin --profile web add "https://codeload.github.com/gtk96/dsh-mcp-skill-manager/tar.gz/refs/heads/main" --registry https://registry.npmjs.org/
```

将 `web` 替换为需要安装的 CLI Profile。Host 管理工具需要该 Profile 提供 `configEditor`、`skills`、`tools` 服务；设置页面另需 Web `connection` 和 Settings 服务。缺少 Web 连接时，仅挂载 Host 工具。

`desktop` Profile 由 Electron 应用管理，普通 `dsh` CLI 不接受该 Profile。桌面版在侧边栏插件管理器选择安装 Bundle，粘贴以下安装目标，registry 使用 `https://registry.npmjs.org/`：

```text
https://codeload.github.com/gtk96/dsh-mcp-skill-manager/tar.gz/refs/heads/main
```

替换已经加载的包后重启 DSH，让 Host 和 Client 读取同一份入口文件。Bundle 的 `cordis.patch.yml` 向 Profile 注册 `mcp-skill-manager` 插件行。Host 入口为 `index.js`，Client 设置页入口为 `client.js`，无需构建或安装脚本。

## MCP 配置映射

`dsh_manage_mcp_servers` 支持在指定配置条目、指定映射路径下查看、新增、替换或移除 server 定义。路径使用点分隔，路径段本身不能包含点号。插件默认路径可配置为：

```yaml
mcpConfigPath: mcp.servers
```

这只是自定义映射的格式示例，必须填写实际存在的配置路径。**此映射列表不代表整个 Profile 已接入的 MCP。** DSH 原生 MCP 每台服务器对应一个 `@deepseek-ai/dsh-mcp-client` 插件条目，应在 DSH 插件管理器中查看和管理。本插件不会自动导入 Claude、Codex 的 MCP 配置，也不会连接或启动 server。

列表从 Loader 当前有效配置读取，返回 server 名称与脱敏字段摘要。页面编辑、移除操作绑定成功读取的路径；修改路径或配置条目会关闭旧表单与移除确认，路径重新读取成功后才能操作。凭据类字段值不返回，普通字符串值显示为 `[configured]`。列表返回的 `entry.id`、`entry.patchId` 或 `entry.name` 可作为后续操作的 `entryId`；同名插件有多个条目时应使用唯一 id。

编辑经 `configEditor.edit()` 校验、持久化并由 DSH Loader 应用，生成当前条目的完整配置覆盖。新增或更新必须提交完整 server JSON 对象，目标 server 的省略字段不会自动保留；所选配置的其他字段保持其当前值。已有内容不会回填到编辑表单。

移除操作只处理本地覆盖：没有对应覆盖时返回 `changed: false`；仅来自继承配置的 server 会拒绝移除。存在同名继承定义时，移除覆盖会显式恢复继承定义，并返回 `inheritedRemains: true`；继承来源文件保持原样。编辑失败由 DSH 返回错误。

## Skill 目录

`dsh_manage_skills` 支持：

- 列出目录，返回发现完整性 `complete` 和视图 `scope`。
- 按名称读取 Skill 正文。
- 注册和注销本插件生命周期内的 Runtime Skill；有效目录中已有的名称会拒绝注册，目录发现未完成时也会拒绝注册或回滚本次注册。

Agent 调用工具时，读取使用该 Agent 的作用域和会话工作目录，和 DSH 原生 Skill 工具使用相同的查找上下文。没有 Agent 上下文的调用使用 Profile 全局视图。

Settings 页面显示 **Profile 全局目录**，不含 Agent 专属层，不能作为当前会话或本机全部 Skill 的清单。发现未完成或读取失败时，页面会显示相应状态，而不是报告为已确认的空目录。

Runtime Skill 仅在插件本次运行期间有效。持久化 Skill 文件的安装、编辑和移除不属于此插件能力；本插件也不自行扫描或导入其他应用的专用 Skill 目录。

## Settings 页面与接口

Web Profile 的 Settings 中提供 **MCP & Skills** 页面，包含 MCP 映射和 Skills 两个标签。MCP 页可以选择配置条目、填写映射路径、读取摘要和提交完整定义；Skills 页可以刷新全局目录、读取正文、注册 Runtime Skill，并注销由本插件注册的 Runtime Skill。

Host 按 Cordis 约定导出 `name`、`inject`、`Config` 和 `apply`，硬依赖 `configEditor`、`skills`、`tools`。Web RPC 在可选 `connection` 注入生命周期内注册。Client 通过 ModuleLoader 加载，依赖 `slots`、`connection`，按 `settings.section` 声明生命周期注册页面。

Client 通过 `ctx.connection.rpc.call('/api', 'mcp-skill-manager.' + method, args)` 调用 Host 的 `connection.fetch.register()` 精确 POST 路由，复用 DSH 的 `/api` 认证入口。响应使用 Connection 的 RPC envelope。仅公开本插件自身标记的输入错误，外部 Service 或 Skill provider 的意外异常返回通用错误。插件退出会清理路由、工具、Runtime Skill、样式和 Slot。

## 安装诊断

- `Host key verification failed`：pnpm 解析 GitHub Git 安装目标时可能调用 SSH；使用上方 HTTPS 压缩包地址安装。
- `incompatible-version`：核对提示中的 DSH 实际版本与本包声明范围；一般安装操作不需要设置版本豁免。
- 条目等待服务：检查目标 Profile 是否提供 Host 硬依赖；Web 设置页还需要 Settings 和连接服务。
- 包管理器的 `deprecated` 提示：它描述依赖弃用，不等于插件激活失败；应结合提示中点名的包、安装退出码与 Host/Client 激活结果判断，不能仅凭一条弃用提示归因于本插件。

配置凭据使用 DSH 支持的运行时引用方式，不要把密钥提交到仓库。

## 开源许可

MIT，详见 [LICENSE](LICENSE)。
