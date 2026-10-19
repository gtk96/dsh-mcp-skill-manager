# DSH MCP & Skill Manager

用于 DeepSeek Harness（DSH）的 MCP Server 配置来源查看、唯一归属工具分组和 Runtime Skill 管理插件。

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

页面检查失败、协议不匹配或检查进行中时，写入保持禁用。Host 对每次配置修改和 Runtime Skill 操作重新检查版本及接口；直接调用 Tool 或 RPC 也不能绕过。兼容检查不会覆盖 Skill 注册时已有的完整目录及回滚校验。插件退出时释放自身 Runtime Skill 不受手动写入闸门阻碍。

Host 的基础启动仍要求 `configEditor`、`skills`、`tools` 服务以及工具注册契约存在；若它们无法满足，DSH Loader 可能无法启动插件，管理页不能代替启动错误诊断。Client 的 Settings/连接基础契约同样必须存在。

官方发布新版本后，维护者需核对公开契约，执行隔离回归、安装包检查及目标版本的真实页面/配置写入验收，再更新已测试版本列表。官方 `0.2.1-alpha.4` 在回归中仅用于验证“未验证版本禁止写入”，没有作为运行环境启动或认证为兼容。只放宽 peer 范围或接口形状检查通过不能替代这些验收。插件不修改官方内部文件，不触发应用升级或重启，也不提供绕过只读闸门的开关。

## 页面范围

Settings 的 **MCP & Skills** 页面直接读取和管理 Profile 全局配置、工具分组与 Skill。Agent 调用管理工具时，发现类操作仍按调用方 Agent 的作用域读取；目标会话若没有 live Agent，会返回明确错误，不创建或恢复 Agent。配置写入与 Runtime Skill 注册/注销只允许 Profile 全局范围。

## 编辑 MCP 配置

MCP 页面为每个 Profile 原生 `@deepseek-ai/dsh-mcp-client` 条目提供编辑入口，可改字段：

- **stdio**：`command`、`args`、`cwd`、进程环境变量 `env`。
- **streamable-http**：`url`、请求头 `headers`。
- **共用**：`toolCallTimeoutMs`、`maxInstructionBytes`、`failOnStartupError`，以及 `reconnect` 的 `enabled`、`initialDelayMs`、`maxDelayMs`、`maxAttempts`。

`serverName` 和 `transport` 不可改。保存调用 `configEditor.edit()`，由 Loader 正常路径校验、持久化并应用；该路径是让 DSH 重建这条连接的唯一正规方式，插件不自行挂载或守护连接。

Profile 配置是唯一真相源。本插件不维护第二份 Server 列表，也不创建或删除条目：`ctx.configEditor` 只提供 `entries`、`configuration` 和 `edit`。新增或删除 MCP Server 请使用 DSH 自身的 MCP 设置。

凭据字段只返回键名，值一律显示 `[configured]`；回写该占位符时保留存储值，填写新值则替换。定义来自继承层的条目只读。

`failOnStartupError` 为 `false` 时，官方桥接器连接或工具同步失败也不会报错，条目照常显示为已加载但没有任何工具。官方桥接器在连续重连尝试耗尽后放弃，需要重新加载插件或重启 Host；本页面的保存操作会触发一次配置重新应用，可作为恢复手段之一。

## MCP 发现及来源边界

MCP 主页面按 Profile 的 MCP 配置和命名候选工具分组：

- **MCP Server 分组**：每个名称唯一的配置条目以可展开分组显示。工具名符合 `mcp__<serverName>__` 前缀时，才作为该 Server 的名称候选展示；前缀只用于分组，不能证明注册来源。
- **未关联 Server**：缺少唯一配置名的工具候选，以及无名或重名配置条目，留在单独的可展开组。一个工具若匹配多个 Server 前缀，也留在该组。工具 public name 保留完整。

只在 `serverName` 对应唯一配置项、且工具 public name 只匹配该 Server 时显示在 Server 分组中。普通插件也可以注册同形名称；名称匹配不证明工具来自 MCP server。DSH MCP 桥没有公开完整的 server 来源或连接状态目录，插件不从工具名还原 raw tool 身份。

断线后工具可能仍保留注册；插件 active 不代表连接成功。零工具或资源型 server 也可能不出现在工具目录。所有连接状态均为 `unknown`，页面不会把注册可见标为在线。`provenanceComplete` 和 `connectionStateSupported` 为 false；`complete` 仅表示已支持的来源读取成功，不表示所有 MCP 连接均已枚举。权威来源与状态需要 DSH MCP 桥提供只读元数据接口。

`dsh_manage_mcp_servers` 的 `discover` 操作按调用 Agent 发现上述信息。该工具有 `discover` 一个操作：MCP 配置只能由人在设置页修改。

配置存在但一个工具都没有的 Server 会单独列在 `emptyServers`，页面同时显示醒目提示。这是官方桥接器静默失败的唯一可见症状，插件不能替代它判断连接状态。

## 配置编辑契约

`mcp.update` 接受 `{ sessionId: "", entryId, patch }`。`entryId` 接受条目的 `id` 或 `options.id`，必须唯一。`patch` 只接受白名单字段：stdio 的 `command`、`args`、`cwd`、`env`，HTTP 的 `url`、`headers`，以及共用的 `toolCallTimeoutMs`、`maxInstructionBytes`、`failOnStartupError`、`reconnect`。`serverName`、`transport` 和任何未知字段都被拒绝。返回 `{ changed: true, entryId, serverName, fields }`。

写入前拒绝：非 MCP 条目、定义来自继承层、`serverName` 无效、字段越界。保存经 `configEditor.edit()`，只合并本次 patch 涉及的键，条目其余字段保持原值。

`env` 与 `headers` 的读取值为 `[configured]`；回写该占位符视为保持不变，因此页面可以在不回显凭据的前提下保存其他字段。

## Skill 管理

`dsh_manage_skills` 支持目录、正文及本插件生命周期内的 Runtime 注册/注销。目录返回 `complete` 和视图 `scope`；发现未完成或失败不作为已确认的空目录。页面展示 source、provider 和可用的本地路径，不展示远程资源 URL。

Agent 调用工具时读取其自身作用域与工作目录；页面读取 Profile 全局范围。已有有效同名定义或不完整发现会拒绝注册；正文保留输入中的换行与首尾空白，只拒绝全空白正文。注册后的发现不完整、校验失败或取消会回滚本次注册。注销前会核对有效 Skill 仍为本插件的 Runtime 定义。

Runtime Skill 随插件退出注销。持久化 Skill 文件的安装、修改和移除不属于此插件能力。

## RPC 与生命周期

Client 使用 `ctx.connection.rpc.call('/api', 'mcp-skill-manager.' + method, args)`；Host 用精确 POST 路由复用 DSH `/api` 认证。只公开本插件标记的输入错误，外部 Service/provider 异常返回通用错误。

方法包括 `compatibility.status`、`contexts.list`、`mcp.discover`、`mcp.update`、`hooks.list`、`hooks.upsert`、`hooks.set-enabled`、`hooks.remove`、`hooks.retry`、`skills.list`、`skills.get`、`skills.register`、`skills.unregister`。兼容状态协议为 `protocolVersion: 1`，包括 `runtimeVersion`、`versionStatus`、`testedRuntimeVersions`、`capabilities`、`writes`；无法识别版本时 `runtimeVersion` 为 null。被兼容闸门拒绝的 RPC 返回 `MCP_SKILL_MANAGER_INCOMPATIBLE`。会话读取使用 `sessionId`，空字符串表示全局。插件生命周期清理路由、工具、Runtime Skill、样式和 Slot。

Hook 写入只经 `hooks.*` RPC 提供给 Settings 页面；面向 Agent 的 `dsh_manage_hooks` 只有 `list`，因为启用一条规则意味着在本机执行命令。`/api` 认证是这条 RPC 的调用方边界。

会改动可执行配置或注入模型可见指令的 RPC（`mcp.update`、`hooks.*`、`skills.register`、`skills.unregister`）要求调用方是确认中的本机所有者会话；其余调用方返回 `MCP_SKILL_MANAGER_FORBIDDEN`。

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
