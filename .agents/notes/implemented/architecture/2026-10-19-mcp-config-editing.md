# Agent Note: MCP 管理改为编辑 Profile 配置条目

Status: partially superseded — 编辑路径仍经 `configEditor.edit()`，但继承层只读与「不创建、不删除条目」两条已被 2026-10-20 的 profile patch 决策取代。

## Problem

早先的实现把 Server 定义存在管理插件自己的 `managedServers` 字段里，再用子实例挂载官方 MCP 桥。这造出了配置的第二份真相源：同一件事有两个地方可写，于是必须自己处理两者的一致性、兼容性、启动失败重试、超时清理和停用撤销。实践中这些自造机制反复出错，而它们本可以不存在。

官方 `@deepseek-ai/dsh-mcp-client` 自身已经处理连接、退避重连和工具同步；`ctx.configEditor` 的服务描述写明 `edit` 会把配置"apply them through the normal Loader path"。因此正确的分工是：DSH 拥有配置与连接，本插件只提供编辑界面。

## Decision

- MCP 页面编辑 Profile 里已有的 MCP 条目，通过 `configEditor.edit()` 保存，由 Loader 应用。插件不挂载、不守护、不重连任何 MCP 连接。
- 可改字段白名单：stdio 的 `command`、`args`、`cwd`、`env`；streamable-http 的 `url`、`headers`；共用的 `toolCallTimeoutMs`、`maxInstructionBytes`、`failOnStartupError`、`reconnect`。`serverName`、`transport` 与未知字段拒绝。
- 不创建、不删除条目。`ctx.configEditor` 只提供 `entries`、`configuration`、`edit`；新增与删除属于 DSH 自身的 MCP 设置。
- 凭据值不出现在读取结果里：`env` 与 `headers` 只返回键名，值显示 `[configured]`；回写该占位符表示保持不变。
- 定义来自继承层的条目只读，避免改动来源层。

## Consequences

- 依赖 `failOnStartupError` 的语义被明确记录：为 `false` 时桥接器连接或工具同步失败也不报错，条目照常加载但没有工具。插件因此把"配置存在但零工具"的 Server 单独列出（`discover` 的 `emptyServers`），页面显示醒目提示——这是静默失败唯一可见的症状。
- 桥接器连续重连尝试耗尽后会放弃，官方日志给出恢复手段为重新加载插件或重启 Host；本页面的保存会触发一次配置重新应用，是可用但未被官方承诺的恢复路径。
- 连接状态仍无从得知：官方桥没有暴露连接元数据。页面所有连接状态写为 `unknown`，不用工具可见性推断在线。
