# DSH MCP & Skill Manager

DeepSeek Harness（DSH）插件：在 **Settings → MCP & Skills** 里新增、编辑、删除、启用/禁用 MCP Server，并管理 Runtime Skill。

官方 DSH 0.2.1-rc.2 **没有** MCP 设置页，也没有管理 MCP 的 CLI；不装这个插件时，MCP Server 只能手改 Profile 的 `cordis.patch.yml`。

## 能做什么

- **MCP Server**：新增、编辑、删除、启用/禁用；stdio 与 streamable-http 两种传输的完整字段。
- **工具目录**：按 `mcp__<serverName>__` 前缀把工具归到对应 Server；配置了但没有返回工具的 Server 会单独提示。
- **单个工具停用调用**：对任意 MCP 工具关闭调用，其它工具不受影响（见「停用单个工具」）。
- **Runtime Skill**：列出、查看正文、注册、注销；仅在插件运行期间有效。
- **中英双语**：接入 DSH 的 locale 服务，跟随设置里的语言切换；没有 locale 服务时使用内置中文。

## 安装

插件要求 DSH `^0.2.0-rc.2 || ^0.2.1-rc.2`。已做隔离回归的版本是 `0.2.0-rc.2` 与 `0.2.1-rc.2`；其它版本仍可读取，但写入会被禁用（见「兼容性」）。

### 桌面版（Electron）

在 DSH 的插件管理器里添加 Bundle：

```text
https://codeload.github.com/gtk96/dsh-mcp-skill-manager/tar.gz/refs/heads/main
```

桌面版的 Profile 是 `desktop`，由 Electron 管理，**不要**用下面的 CLI 命令向它安装。

### CLI 管理的 Profile

```sh
dsh plugin --profile web add "https://codeload.github.com/gtk96/dsh-mcp-skill-manager/tar.gz/refs/heads/main" --registry https://registry.npmjs.org/
```

把 `web` 换成目标 Profile。使用 HTTPS 源码包可以避开 Git/SSH 的 `Host key verification failed`。

安装后如返回 `restart-required`，重启 DSH 才会生效；插件本身不会重启应用或停止正在运行的任务。

## 写到哪里

- **编辑**已有条目：走官方 `ctx.configEditor.edit()`，只把改动字段合并进 Profile 的覆盖层，其余字段保持原值。
- **新增**：向 Profile 的 `cordis.patch.yml` 追加 `- insert:` 行。
- **删除**：删除本 Profile 自己 insert 的行；由插件包或上层组合提供的行只能**禁用**（写 `disabled: true` 覆盖）。
- **启用/禁用**：写 `disabled` 覆盖行，不删除定义。

写文件时沿用官方锁顺序（先 `hmr.runExclusive`，再锁 `<profile>/package.json`），原子替换；reconcile 失败会把文件写回原内容。没有 HMR 的 Profile 不会假装生效——页面提示「已保存，重启 DSH 后生效」。

`serverName` 与条目 id 在创建前对**所有** MCP 行查重（含已禁用和上层来源）；id 冲突会自动加数字后缀。

## 停用单个工具

官方 `@deepseek-ai/dsh-mcp-client` 的配置里**没有**工具白名单/黑名单字段，它在 `tools/list` 之后无条件注册每个工具，所以「让某个工具从模型目录里消失」在桥层面做不到。

本插件用的是官方提供的另一个口子 —— `ctx.tools.guard()`：

- 命中的工具在**执行前**被拒绝，返回 `Error: Tool "<name>" is disabled for calls by the user ...`，并明确要求模型不要重试。
- **工具仍然出现在模型目录里**（schema 照常下发），因为反注册属于官方桥的所有权，本插件无法拿走。
- guard 挂在 Profile 层，对所有 Agent 生效；插件卸载即解除。

开关状态存在 `<profile>/.mcp-skill-manager/tool-guards.json`，**不写进 `cordis.patch.yml`**：写 patch 会触发 Loader reconcile，每点一次开关都会重新加载本插件（页面会闪断）。点目录不在 HMR 的监视范围内，也不会被组合进 Loader。

若运行时不提供 `tools.guard`，页面不显示这些开关，`compatibility.status` 的 `writes.guards` 为 `false`。

## 兼容性

- 运行版本只从 `@deepseek-ai/dsh/package.json` 读取，不访问网络。
- 版本不在已回归列表、或无法识别时，页面顶部显示一行「当前 DSH 版本未验证，写入已禁用」，展开可看版本、已回归版本与缺失接口；读取功能不受影响。
- 接口检查只确认方法存在，不代表语义一致。Host 对每次写入重新检查，Tool 与 RPC 调用不能绕过。

## 已知限制

- **没有连接状态**：官方 MCP 桥不暴露连接状态。页面只展示 DSH 实际注册的工具；「已配置但没有返回工具」是静默失败唯一可见的症状。
- **停用工具 ≠ 隐藏工具**：见上一节。模型仍会看到被停用的工具，尝试调用后收到拒绝原因。
- **Runtime Skill 不持久化**：插件停止运行即失效；持久化 Skill 文件不属于本插件能力。
- **预设内的 MCP 行不在此页管理**：它们是 Agent 预设的一部分，归属该预设。
- **`!!js` 字段**：命令、参数、URL、目录等字段若是 YAML 表达式，页面只读展示，不解析、不重写。
- **凭据不回显**：`env` 与 `headers` 只显示键名；输入新值才替换，留空保持不变，点「删除」会在保存时移除该键。

## 安全边界

会改动可执行配置或注入模型可见指令的操作（MCP 写入、工具停用、Runtime Skill 注册/注销）只接受**本机确认中的所有者会话**；其它调用方得到 `MCP_SKILL_MANAGER_FORBIDDEN`。面向 Agent 的两个工具（`dsh_manage_mcp_servers`、`dsh_manage_skills`）只读。

## RPC

Client 用 `ctx.connection.rpc.call('/api', 'mcp-skill-manager.' + method, args)`；Host 用精确 POST 路由复用 DSH `/api` 认证。

| 方法 | 作用 |
| --- | --- |
| `compatibility.status` | 版本、能力、写入许可 |
| `mcp.discover` | Server 列表、工具分组、未归属工具、已停用工具 |
| `mcp.create` / `mcp.update` / `mcp.reset` | 新增 / 编辑 / 重置为默认 |
| `mcp.remove` / `mcp.set-enabled` | 删除（或禁用）/ 启用禁用 |
| `mcp.set-tool-disabled` | 停用或恢复单个 MCP 工具的调用 |
| `skills.list` / `skills.get` | Skill 目录与正文 |
| `skills.register` / `skills.unregister` | Runtime Skill 注册与注销 |

写入结果带 `application`：`applied`（已生效）、`restart-required`（需重启）、`overridden`（被更高优先级配置覆盖）。

## 开发

无构建步骤：`client.js` 通过 `window.__ModuleLoader__.load` 注册，宿主侧是原生 ESM。

```sh
cd test
pnpm install --ignore-workspace --ignore-scripts
node run.mjs
```

测试不启动 DSH、不读写真实 Profile、不联网：真实 Cordis/React + 进程内服务样本，Profile 是临时目录里的 `cordis.patch.yml`。报告写在 `test/.fixture/results.json`，失败时进程退出码非 0。

MIT，详见 [LICENSE](LICENSE)。
