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

## 手动添加 MCP

MCP 主页面提供 **添加托管 MCP**。等待兼容检查完成，再填写 Server 名称和传输方式：

- **stdio**：启动命令、JSON 字符串数组参数、可选工作目录、进程环境变量引用。
- **streamable-http**：HTTP/HTTPS MCP 地址、请求头环境变量引用。地址不接受用户名、密码、查询参数或片段，认证使用请求头环境变量引用。

名称为 1–32 位字母、数字、下划线或短横线。新增操作拒绝覆盖同名托管配置或同名 Profile 原生 MCP。该入口只新增配置；不会自动安装服务器程序或删除已有连接。

引用字段只保存环境变量名，例如 `{"API_KEY":"MY_MCP_API_KEY"}`，或请求头的 `{"Authorization":"MY_MCP_AUTH_HEADER"}`。对应变量必须已存在于运行 DSH 的进程环境中；请求头变量应包含完整头值。原值仅在内存中解析后交给官方桥接器，不写入本插件配置，不返回管理目录。不要在命令、参数或 URL 中填写凭据。缺少引用变量、定义无效或桥接器不可用时，新增在保存前失败。

DSH 原生 MCP 由各自的 `@deepseek-ai/dsh-mcp-client` 配置条目声明，既有条目通过 DSH 插件管理器管理。页面的托管新增通过 `configEditor.edit()` 保存在**当前管理插件条目**的 `managedServers` 字段，不生成独立的 Profile 原生 MCP 条目，也不写入统一的 `mcp.servers` 路径。该字段声明为官方支持的 volatile 实时字段；Loader 更新引用后发出 `loader/volatile-update`，插件按定义增量挂载 `@deepseek-ai/dsh-mcp-client` 子实例。定义未变化的连接保持原实例，新增不重新挂载管理插件或已有连接；插件卸载时请求释放自己创建的连接。桥接器是 optional peer，由 DSH 提供，不自动安装另一套。

“配置已保存”只表示持久化成功并安排加载，**不表示远端连接成功**。来源卡片把这些记录标为本插件持久化配置，连接状态仍为未知；Profile 工具候选以发现目录为准。插件本地解析、挂载准备或官方桥接器首次连接与工具同步失败时，显示限定原因及 **重试加载 MCP**。重试不保存配置、不重连健康项；桥接器导入和本地启动有等待上限，超时后旧实例释放未完成前不创建同名替代项。释放失败或超时会保留记录并阻止同名替代，但不阻断其他项。官方桥接器运行期间的断线与重连状态没有公开给本插件，仍需查看其诊断；官方桥接器若在释放时只记录传输关闭未获确认，子实例释放完成也不能保证旧 Server 进程已退出。映射 Tool/RPC 拒绝修改本管理插件自身配置，托管定义须走专用校验入口。

## MCP 发现及来源边界

MCP 主页面按 Profile 的 MCP 配置和命名候选工具分组：

- **MCP Server 分组**：每个名称唯一的配置条目以可展开分组显示。工具名符合 `mcp__<serverName>__` 前缀时，才作为该 Server 的名称候选展示；前缀只用于分组，不能证明注册来源。
- **未关联 Server**：缺少唯一配置名的工具候选，以及无名或重名配置条目，留在单独的可展开组。一个工具若匹配多个 Server 前缀，也留在该组。工具 public name 保留完整。

只在 `serverName` 对应唯一配置项、且工具 public name 只匹配该 Server 时显示在 Server 分组中。普通插件也可以注册同形名称；名称匹配不证明工具来自 MCP server。DSH MCP 桥没有公开完整的 server 来源或连接状态目录，插件不从工具名还原 raw tool 身份。

断线后工具可能仍保留注册；插件 active 不代表连接成功。零工具或资源型 server 也可能不出现在工具目录。所有连接状态均为 `unknown`，页面不会把注册可见标为在线。`provenanceComplete` 和 `connectionStateSupported` 为 false；`complete` 仅表示已支持的来源读取成功，不表示所有 MCP 连接均已枚举。权威来源与状态需要 DSH MCP 桥提供只读元数据接口。

`dsh_manage_mcp_servers` 的 `discover` 操作按调用 Agent 发现上述信息；`list` 在没有配置映射路径时也使用该发现视图。

## Host 配置映射契约

Host 的 `dsh_manage_mcp_servers` 工具和映射 RPC 管理指定配置条目、指定点分隔路径下的自定义 server 映射。Settings 页面提供 MCP 分组、托管新增/重试和 Skill 管理；映射读写通过 Tool/RPC 调用。可选默认路径由 `mcpConfigPath` 指定。路径必须对应调用方实际维护的自定义映射；`mcp.servers` 只是可选路径示例，不代表 DSH 原生 MCP 的存储格式。

`list` 在提供路径或配置了默认路径时返回该映射；`mcp.catalog` 读取映射目录，`upsert`、`remove` 及对应 RPC 编辑映射。映射操作不连接或启动 server，也不自动导入其他客户端配置。

列表读取 Loader 当前有效配置，字符串值只显示 `[configured]`，凭据类字段值不返回。调用方通过目录获得目标条目和有效定义修订标识，再在写入中指定路径、条目及当前修订。

`entryId` 接受目录返回的唯一 id、patch id 或无歧义模块名。编辑通过 `configEditor.edit()` 校验、持久化并由 Loader 应用。更新需提供完整 server JSON；替换已有条目时，目标 server 的省略字段会被删除，且须从目录的 `servers[name].revision` 提交 `expectedRevision`。保存时若目标定义已变化，操作会拒绝，需重新读取目录后确认。其他配置字段保留当前值。

移除只处理本地覆盖。仅继承的 server 拒绝移除；无对应覆盖返回 `changed: false`；已有覆盖须提交当前 `servers[name].revision`，若编辑时版本已变化则拒绝并要求刷新目录。同名继承定义存在时显式恢复它并返回 `inheritedRemains: true`，不修改继承来源。

## Skill 管理

`dsh_manage_skills` 支持目录、正文及本插件生命周期内的 Runtime 注册/注销。目录返回 `complete` 和视图 `scope`；发现未完成或失败不作为已确认的空目录。页面展示 source、provider 和可用的本地路径，不展示远程资源 URL。

Agent 调用工具时读取其自身作用域与工作目录；页面读取 Profile 全局范围。已有有效同名定义或不完整发现会拒绝注册；正文保留输入中的换行与首尾空白，只拒绝全空白正文。注册后的发现不完整、校验失败或取消会回滚本次注册。注销前会核对有效 Skill 仍为本插件的 Runtime 定义。

Runtime Skill 随插件退出注销。持久化 Skill 文件的安装、修改和移除不属于此插件能力。

## RPC 与生命周期

Client 使用 `ctx.connection.rpc.call('/api', 'mcp-skill-manager.' + method, args)`；Host 用精确 POST 路由复用 DSH `/api` 认证。只公开本插件标记的输入错误，外部 Service/provider 异常返回通用错误。

方法包括 `mcp.retry`、`mcp.managed`、`mcp.add`、`compatibility.status`、`contexts.list`、`mcp.discover`、`mcp.catalog`、`mcp.upsert`、`mcp.remove`、`hooks.list`、`hooks.upsert`、`hooks.set-enabled`、`hooks.remove`、`hooks.retry`、`skills.list`、`skills.get`、`skills.register`、`skills.unregister`。兼容状态协议为 `protocolVersion: 1`，包括 `runtimeVersion`、`versionStatus`、`testedRuntimeVersions`、`capabilities`、`writes`；无法识别版本时 `runtimeVersion` 为 null。被兼容闸门拒绝的 RPC 返回 `MCP_SKILL_MANAGER_INCOMPATIBLE`。会话读取使用 `sessionId`，空字符串表示全局。插件生命周期清理路由、工具、Runtime Skill、样式和 Slot。

Hook 写入只经 `hooks.*` RPC 提供给 Settings 页面；面向 Agent 的 `dsh_manage_hooks` 只有 `list`，因为启用一条规则意味着在本机执行命令。`/api` 认证是这条 RPC 的调用方边界。

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
