# 单个 MCP 工具的调用停用（guard，而非隐藏）

日期：2026-10-20
状态：已实现

## 背景

用户希望「禁用单个 MCP 工具」，而不只是整台 Server。核实官方 0.2.1-rc.2 运行时后确认：

- `@deepseek-ai/dsh-mcp-client` 的 `Config` 只有 `serverName` / `transport` / `command` / `args` / `cwd` / `env` / `url` / `headers` / `toolCallTimeoutMs` / `maxInstructionBytes` / `failOnStartupError` / `reconnect`，**没有任何工具过滤字段**。
- 它的 `syncTools()` 在 `tools/list` 之后对每个工具无条件 `ctx.tools.register()`，没有过滤分支。
- 工具注册的 disposer 属于桥自身，本插件不拥有，无法反注册别人的工具。

因此「让工具从模型目录消失」在官方桥层面做不到，只有三条路：

1. 拆 Server（受 Server 自身是否支持限制，且不是通用方案）。
2. `ctx.tools.guard(fn)` —— 调用前拒绝，工具仍可见。
3. `ctx.tools.restrict({ deny })` —— 真正隐藏，但**只能从 `agent.ctx` 调用**；从 root 调用直接抛错，且要求工具名此刻已注册，MCP 异步连接会让名册变动，需要监听 `tools/change` 反复重算。

用户选择方案 2。

## 决定

用 `ctx.tools.guard()`，挂在 Profile 层（非 `agent.ctx`），对全部 Agent 生效。

```js
ctx.tools.guard((exec) => toolGuards.reason(exec?.name))
```

- 拒绝理由是一句完整指令，同时说明「为什么」和「不要重试」，避免模型进入重试循环：
  `Tool "mcp__x__y" is disabled for calls by the user (DSH Settings > MCP & Skills). Do not retry it; ...`
- 只接受形如 `mcp__<server>__<tool>` 的名字，避免手改状态文件后误伤 `bash` 等内置工具。
- 页面明确写出「工具仍在模型目录里」——这是能力的真实边界，不能暗示成隐藏。

## 状态存放位置

`<profile>/.mcp-skill-manager/tool-guards.json`，**不写 `cordis.patch.yml`**。

写 patch 会触发 `hmr.reconcileProfile`，进而重载本插件——用户每点一次开关，设置页就会闪断一次。点目录既不匹配 HMR 的 `ignored` 通配（`**/.*` 会跳过它），也不参与 Loader 组合，因此是一个纯粹的运行时策略文件。

代价：它与 MCP Server 配置分处两地。缓解：文件只在 `set-tool-disabled` 时写入，读取在插件构造时一次完成；损坏的 JSON 或非法条目被丢弃并记日志，不会 fail closed 到「全部禁用」。

## 兼容性闸门

`writes.guards = tested && capabilities.toolGuard`，其中 `capabilities.toolGuard = typeof ctx.tools.guard === 'function' && profileContext.dir 是字符串`。

与 `writes.mcp` 分开：缺少 `configEditor.edit` 不该连带禁掉工具停用，反之亦然。版本未验证时两者都关闭。

## 未做的事

- 不做「按 Agent 隐藏」（`restrict`）。它需要处理 MCP 异步连接造成的名册时序，收益是语义更干净，但用户当前只需要「别让它被调用」。
- 不自己接管 `@modelcontextprotocol/client`。那等于重写官方桥的连接、重连、资源、超时，维护成本与风险都远超收益。
