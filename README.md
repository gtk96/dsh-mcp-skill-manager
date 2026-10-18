# DSH MCP & Skill Manager

用于 DeepSeek Harness（DSH）的会话能力发现、MCP 配置来源查看和 Runtime Skill 管理插件。

## 安装

需要已安装 DSH，安装版本约束为 `^0.2.0-rc.2 || ^0.2.1-rc.2`；这不是已验证版本列表。DSH peer 为 optional，包管理器不会因此另外安装一套 DSH；DSH 自身仍执行版本兼容检查。

CLI 管理的 Profile 使用公开 HTTPS 源码压缩包安装，不依赖本机 Git/SSH：

```sh
dsh plugin --profile web add "https://codeload.github.com/gtk96/dsh-mcp-skill-manager/tar.gz/refs/heads/main" --registry https://registry.npmjs.org/
```

将 `web` 替换为目标 CLI Profile。Host 需要 `configEditor`、`skills`、`tools` 服务；会话发现使用可选的 `agents`、`sessionQuery`、`sessions`、`agentPresets` 服务。设置页面需要 Web connection 和 Settings。没有 Web connection 时仍可挂载 Host 工具。

`desktop` Profile 由 Electron 管理，普通 CLI 不接受它。在桌面插件管理器安装 Bundle 时使用：

```text
https://codeload.github.com/gtk96/dsh-mcp-skill-manager/tar.gz/refs/heads/main
```

若安装器返回 `restart-required`，由使用者选择合适的维护时机重启应用。本插件不触发重启或停止正在运行的任务。入口由 Bundle 的 `cordis.patch.yml` 注册，无安装或构建脚本。

## 官方升级与兼容检查

页面的“兼容检查”展示插件版本、DSH 运行版本、接口能力和写入许可。运行版本只从公开的 `@deepseek-ai/dsh/package.json` 读取，不启动 DSH 主程序、不访问网络，也不由用户配置覆盖。无法解析该公开清单时显示“无法识别”。

| 检查 | 含义 |
| --- | --- |
| 安装版本约束 | 包清单允许安装的范围，不是行为验证结果 |
| 已做隔离回归的版本 | `0.2.0-rc.2`、`0.2.1-rc.2`，对应真实 Cordis/React 加进程内服务样本的契约回归，不代表真实桌面端到端验收 |
| 当前接口能力 | 仅检查所需方法是否存在，不调用业务方法，不证明接口语义相同 |
| 未验证或未知版本 | 尝试保留目录与正文读取，禁止 MCP 配置写入和 Runtime Skill 注册/注销 |
| 已测版本缺少接口 | 仅禁用依赖该接口的写操作；读取失败仍显示错误，不把失败当成空目录 |

页面检查失败、协议不匹配、检查进行中或切换会话时，写入保持禁用。Host 对每次配置修改和 Runtime Skill 操作重新检查版本及接口；直接调用 Tool 或 RPC 也不能绕过。兼容检查不会覆盖 Skill 注册时已有的完整目录及回滚校验。插件退出时释放自身 Runtime Skill 不受手动写入闸门阻碍。

Host 的基础启动仍要求 `configEditor`、`skills`、`tools` 服务以及工具注册契约存在；若它们无法满足，DSH Loader 可能无法启动插件，管理页不能代替启动错误诊断。Client 的 Settings/连接基础契约同样必须存在。

官方发布新版本后，维护者需核对公开契约，执行隔离回归、安装包检查及目标版本的真实页面/配置写入验收，再更新已测试版本列表。官方 `0.2.1-alpha.4` 在回归中仅用于验证“未验证版本禁止写入”，没有作为运行环境启动或认证为兼容。只放宽 peer 范围或接口形状检查通过不能替代这些验收。插件不修改官方内部文件，不触发应用升级或重启，也不提供绕过只读闸门的开关。

## 选择会话

Settings 的 **MCP & Skills** 页面提供“能力视图”选择器。初始值为 Settings 打开时主视图中的会话；也可选择其他会话或 Profile 全局视图。

会话目录只读取 id、工作目录、预设身份和是否具有 live Agent，不读取对话消息。目标会话需有 live Agent；未加载或已退出的会话返回明确错误，不用全局目录替代，也不在后台创建或恢复 Agent。

Skill 查询使用所选 Agent 的作用域、会话工作目录及其预设中的 Skill 服务。列表和正文使用相同上下文；会话切换会失效旧请求、清空旧正文及编辑确认。迟到响应与上下文不匹配的响应不能覆盖当前视图。读取过程中 Agent 被替换、卸载或切换预设时，返回错误并要求刷新。

## 手动添加 MCP

MCP 主页面提供 **新增 MCP**，无需填写自定义映射路径。先选择 **Profile 全局视图**，等待兼容检查完成，再填写 Server 名称和传输方式：

- **stdio**：启动命令、JSON 字符串数组参数、可选工作目录、进程环境变量引用。
- **streamable-http**：HTTP/HTTPS MCP 地址、请求头环境变量引用。地址不接受用户名、密码、查询参数或片段，认证使用请求头环境变量引用。

名称为 1–32 位字母、数字、下划线或短横线。新增操作拒绝覆盖同名托管配置或同名 Profile 原生 MCP。该入口只新增配置；不会自动安装服务器程序或删除已有连接。

引用字段只保存环境变量名，例如 `{"API_KEY":"MY_MCP_API_KEY"}`，或请求头的 `{"Authorization":"MY_MCP_AUTH_HEADER"}`。对应变量必须已存在于运行 DSH 的进程环境中；请求头变量应包含完整头值。原值仅在内存中解析后交给官方桥接器，不写入本插件配置，不返回管理目录。不要在命令、参数或 URL 中填写凭据。缺少引用变量、定义无效或桥接器不可用时，新增在保存前失败。

配置通过 `configEditor.edit()` 保存在**当前管理插件条目**的 `managedServers` 字段，不生成独立的 Profile 原生 MCP 条目。该字段声明为官方支持的 volatile 实时字段；Loader 更新引用后发出 `loader/volatile-update`，插件按定义增量挂载 `@deepseek-ai/dsh-mcp-client` 子实例。定义未变化的连接保持原实例，新增不重新挂载管理插件或已有连接；插件卸载会释放自己创建的连接。桥接器是 optional peer，由 DSH 提供，不自动安装另一套。

“配置已保存”只表示持久化成功并安排加载，**不表示远端连接成功**。来源卡片把这些记录标为本插件持久化配置，连接状态仍为未知；所选会话实际可见的工具以发现目录为准。插件本地解析或挂载准备失败显示限定原因及 **重试加载 MCP**，重试不保存配置、不重连健康项；释放失败会保留记录并阻止同名替代，但不阻断其他项。官方桥接器内部连接失败仍需查看其诊断，不反推在线状态。高级映射入口拒绝修改本管理插件自身配置，托管定义须走专用校验入口。

## MCP 发现及来源边界

主视图展示三类信息：

- **MCP 命名候选**：所选视图中实际可见、名称以 `mcp__` 开头的工具，保留完整 public name。该前缀只能说明名称符合命名约定，不能证明工具确实来自 MCP 桥。
- **MCP 配置来源**：Profile 内 `@deepseek-ai/dsh-mcp-client` 配置条目、所选会话预设中的同类条目，以及本插件持久化的 `managedServers` 定义。来源明确区分，展示白名单标识、serverName（来源提供时）、预设和插件阶段，不返回 command、env、URL 或 headers。
- **全部可见工具**：支持按名称检索，覆盖未遵循上述命名约定的其他工具。定义与 Profile 相同只表示定义等价，不作为注册来源证明。

当前 DSH MCP 桥没有公开完整的 server provenance 或连接状态目录。工具名有归一化、截断和哈希规则，serverName 也允许双下划线，因此本插件不拆分 public name 来还原 server/raw tool 身份。普通插件同样可以注册同形名称，命名候选不能作为来源证明。

断线后工具可能仍保留注册；插件 active 不代表连接成功。零工具或资源型 server 也可能不出现在工具目录。所有连接状态均为 `unknown`，页面不会把注册可见标为在线。`provenanceComplete` 和 `connectionStateSupported` 为 false；`complete` 仅表示已支持的来源读取成功，不表示所有 MCP 连接均已枚举。权威来源与状态需要 DSH MCP 桥提供只读元数据接口。

`dsh_manage_mcp_servers` 的 `discover` 操作按调用 Agent 发现上述信息；`list` 在没有配置映射路径时也使用该发现视图。

## 高级配置映射编辑

MCP 页的高级折叠区管理指定配置条目、指定点分隔路径下的自定义 server 映射。默认路径可配置为：

```yaml
mcpConfigPath: mcp.servers
```

此格式只是示例，必须填写实际映射路径。`list` 在提供路径或配置了默认路径时返回该映射；`upsert`、`remove` 编辑该映射。它不连接或启动 server，也不自动导入其他客户端配置。

列表读取 Loader 当前有效配置，字符串值只显示 `[configured]`，凭据类字段值不返回。写入绑定成功读取的路径，路径或条目变化会关闭旧表单和移除确认。写入只允许在 Profile 全局视图进行；提交期间不能切换会话。

`entryId` 接受目录返回的唯一 id、patch id 或无歧义模块名。编辑通过 `configEditor.edit()` 校验、持久化并由 Loader 应用。更新需提供完整 server JSON，目标 server 的省略字段不会自动保留；其他配置字段保留当前值。

移除只处理本地覆盖。仅继承的 server 拒绝移除；无对应覆盖返回 `changed: false`；同名继承定义存在时显式恢复它并返回 `inheritedRemains: true`，不修改继承来源。

## Skill 管理

`dsh_manage_skills` 支持目录、正文及本插件生命周期内的 Runtime 注册/注销。目录返回 `complete` 和视图 `scope`；发现未完成或失败不作为已确认的空目录。页面展示 source、provider 和可用的本地路径，不展示远程资源 URL。

Agent 调用工具时读取其自身作用域与工作目录；页面按所选会话读取。Runtime 注册及注销属于 Profile 全局操作，页面需切换到全局视图。已有有效同名定义或不完整发现会拒绝注册；注册后的发现不完整、校验失败或取消会回滚本次注册。

Runtime Skill 随插件退出注销。持久化 Skill 文件的安装、修改和移除不属于此插件能力。

## RPC 与生命周期

Client 使用 `ctx.connection.rpc.call('/api', 'mcp-skill-manager.' + method, args)`；Host 用精确 POST 路由复用 DSH `/api` 认证。只公开本插件标记的输入错误，外部 Service/provider 异常返回通用错误。

方法包括 `mcp.retry`、`mcp.managed`、`mcp.add`、`compatibility.status`、`contexts.list`、`mcp.discover`、`mcp.catalog`、`mcp.upsert`、`mcp.remove`、`skills.list`、`skills.get`、`skills.register`、`skills.unregister`。兼容状态协议为 `protocolVersion: 1`，包括 `runtimeVersion`、`versionStatus`、`testedRuntimeVersions`、`capabilities`、`writes`；无法识别版本时 `runtimeVersion` 为 null。被兼容闸门拒绝的 RPC 返回 `MCP_SKILL_MANAGER_INCOMPATIBLE`。会话读取使用 `sessionId`，空字符串表示全局。插件生命周期清理路由、工具、Runtime Skill、样式和 Slot。

`mcp.managed` 返回 `{ writable, servers }`，目录仅含名称、传输类型、本地声明阶段、限定诊断和未知连接状态。`mcp.retry` 接受 `{ sessionId: "", serverName }`，只重试本插件本地失败项，返回 `{ retried: true, serverName, connectionState: "unknown" }`；不保存定义，也不重连健康项。`mcp.add` 接受 `{ sessionId: "", serverName, definition }`，定义字段为 `transport`、stdio 的 `command/args/cwd/envFromEnv` 或 HTTP 的 `url/headersFromEnv`；返回 `{ saved: true, serverName, connectionState: "unknown" }`。它只创建新配置，不覆盖；保存后的连接失败不会把持久配置自动撤销。

## 隔离回归

测试不启动 DSH，不访问当前 Profile、窗口或进程。使用真实 Cordis、React、React Test Renderer，业务服务为进程内样本。覆盖跨会话能力、预设隔离、迟到响应、正文归属、未加载会话、错误边界和写入保护。

```sh
pnpm --dir test --ignore-workspace install --ignore-scripts
node test/run.mjs
```

用例覆盖跨会话能力、预设隔离、迟到响应、正文归属、未加载会话、错误边界、已测/未测/未知版本、接口缺失、状态协议不匹配、Host 写入保护、手动添加表单、同名拒绝、环境引用和增量连接清理。测试使用真实 Cordis/Schemastery 的 volatile 引用更新函数和对应事件，MCP 桥接器是不会执行命令或联网的隔离样本。测试中的 DSH 清单为隔离目录内的合成版本样本，不能作为真实运行时升级或 MCP 传输验收。

测试依赖位于独立的 `test` 包，源码副本和报告位于其忽略目录 `.fixture`。每轮将执行副本与实际源码逐字节比较，记录 SHA256；所有用例和清理结束后写最终报告。隔离测试不替代真实浏览器、对方安装环境或外部 MCP 服务验收。

## 安装提示

`Host key verification failed` 可使用上方 HTTPS 压缩包地址避开 Git/SSH 解析。版本不兼容应核对 DSH 与包的兼容范围。环境依赖的 missing peer、deprecated 提示需按其实际来源归因，不能单凭 WARN 判定本插件激活失败。

MIT，详见 [LICENSE](LICENSE)。
