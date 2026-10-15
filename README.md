# DSH MCP & Skill Manager

一个用于 DeepSeek Harness（DSH）的插件仓库，首期提供 MCP 配置管理和 Skill 目录管理工具。

## 功能

### MCP

`dsh_manage_mcp_servers` 支持：

- 查看配置条目中的 MCP server 名称和字段；敏感字段值会隐藏，普通字符串值也只显示为 `[configured]`。
- 在指定配置条目和配置路径下新增或更新 server 定义。
- 从指定配置条目移除 server 定义。

server 定义会经 `configEditor.edit()` 写入并由 DSH Loader 校验和应用。新增/更新写当前条目的 override 路径；同名 server 的 override 会按 DSH 递归规则与 inherited 定义合并，未覆盖的 inherited 子字段仍可能生效。移除操作只删除当前条目的 override：若同名 server 也来自 inherited，工具会返回 `inheritedRemains: true`，表示继承定义仍然生效；若该 server 只存在于 inherited，工具会拒绝移除，应编辑其所属配置条目。编辑失败会由 DSH 返回错误，不会报告为成功。配置路径使用点分隔，路径段本身不能包含点号。

先调用工具的 `list` 操作；将返回的 `entry.id`、`entry.patchId` 或 `entry.name` 中任一值作为后续操作的 `entryId`。

### Skill

`dsh_manage_skills` 支持：

- 列出 DSH 当前可见的 Skill 目录。
- 按名称读取 Skill 正文。
- 注册和注销当前插件生命周期内的 runtime Skill；若名称已存在于有效目录中，会拒绝注册。

通过工具注册的 runtime Skill 只在插件本次运行期间有效；持久化 Skill 文件的安装、编辑和移除不属于首期能力。

### Settings 页面

插件会在 Profile 的 Settings 中注册 **MCP & Skills** 页面。MCP 页可读取配置条目中的 server 列表，显示脱敏后的字段摘要，并新增、更新或移除 server 定义。页面读取路径默认为插件配置中的 `mcpConfigPath`；也可在页面输入点分隔路径并读取。页面内填写的路径只用于当前页面会话；需要为管理工具设置默认路径时，可在插件配置中设置：

```yaml
mcpConfigPath: mcp.servers
```

新增或更新时，完整 JSON 对象会写入当前配置条目的 override。页面不会回填现有定义，避免把凭据渲染到表单中。DSH 会将同名 inherited 定义与 override 递归合并，因此未覆盖的 inherited 子字段可能继续生效；需要删除继承字段时，应编辑其来源配置条目。服务列表隐藏字符串值和凭据类字段，仅显示字段名及类型摘要。MCP 管理工具读取和修改 DSH 配置，不会连接或启动 server。删除当前条目的覆盖定义后，若同名 server 来自 inherited 配置，它仍会生效；工具会返回 `inheritedRemains: true`。

Skills 页可列出当前有效目录、阅读 Skill 正文、注册 Runtime Skill，并注销由本插件注册的 Runtime Skill。Runtime Skill 只在插件本次运行期间有效；持久化 Skill 文件不由此页面管理。

Client 页面通过 Host RPC 调用同一套 MCP 与 Skill 管理逻辑。MCP 列表返回脱敏摘要；RPC 操作错误以稳定的错误对象返回，未知错误消息对 Client 隐藏。

## 插件接口

Host 插件按 Cordis 插件约定导出 `name`、`inject`、`Config` 和 `apply`，依赖 DSH 的 `configEditor`、`skills`、`tools` 与 `connection` Services。Client 入口 `client.js` 通过 ModuleLoader 加载，依赖 `slots`、`connection`，并注册 `settings.section`。设置页面通过 `ctx.connection.rpc.call('/api', 'mcp-skill-manager.' + method, args)` 调用 Host 的 `connection.fetch.register()` 精确路由；路由位于 DSH 认证的 `/api` 入口下，各自匹配本插件的 endpoint，样式由插件生命周期清理。插件退出时会注销工具、RPC 路由和本插件注册的 runtime Skill。

## 安装与开发

此仓库同时是一个 DSH bundle。CLI 管理的 Profile 可以使用以下快速安装命令（将 `web` 替换为目标 Profile 名称）：

```sh
dsh plugin --profile web add "git+https://github.com/gtk96/dsh-mcp-skill-manager.git#main" --registry https://registry.npmjs.org/
```

`desktop` Profile 由 Electron 应用管理，普通 `dsh` CLI 不接受该 Profile。桌面版请在侧边栏插件管理器选择安装 Bundle，把下面的目标粘贴到安装目标，并使用 npm registry `https://registry.npmjs.org/`：

```text
git+https://github.com/gtk96/dsh-mcp-skill-manager.git#main
```

安装后重启 DSH，让新 Client 入口参与 Web boot。Bundle 的 `cordis.patch.yml` 会向 Profile 注册 `mcp-skill-manager` 插件行。Host 入口为原生 ESM `index.js`，Client 设置页入口为 `client.js`，二者均由包清单直接提供，无需构建。

插件配置可选设置 MCP server map 路径，例如：

```yaml
mcpConfigPath: mcp.servers
```

上例中的路径仅为格式示例；应填写当前 DSH Profile 中实际承载 MCP server map 的路径。也可在每次 MCP 操作时单独提供 `configPath`。MCP 管理工具读取配置条目，不会尝试连接或启动 MCP server。

插件会隐藏返回结果中的凭据类字段，并隐藏普通字符串配置值。添加 MCP server 时，应使用运行环境支持的凭据引用方式，不要把密钥提交到仓库。

## 开源许可

MIT，详见 [LICENSE](LICENSE)。
