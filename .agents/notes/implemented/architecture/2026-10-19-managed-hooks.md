# Agent Note: DSH Hook 规则归管理插件托管

Status: implemented — Settings 页的 Hooks 页签在 Profile 内托管命令 Hook 规则，执行仍由官方桥接器负责。

## Problem

DSH 的 Hook 由官方 `@deepseek-ai/dsh-hooks-claude-code` 执行，它只做一件事：启动时读一次 `configPath` 指向的 JSON，注册监听器。它没有热重载、没有单条规则启停、没有 validate-only 入口，规则里的 `enabled` 字段也不被解析。用户要管理 Hook，只能手改文件并让插件重新加载，且在页面上看不到"保存是否生效"。

## Decision

管理插件新增 `managedHooks`（Schemastery volatile 字段），作为 Hook 规则的唯一持久化来源，写入走 `configEditor.edit()`。官方桥接器仍是唯一执行者：插件把**已启用**规则按保存顺序渲染成一份派生 JSON，挂载一个 `dsh-hooks-claude-code` 子实例指向它。

- **默认停用**：新建规则 `enabled: false`，只解析与校验，不导入桥接模块、不生成执行文件、不启动任何进程。启用需显式操作并二次确认。
- **停用即移出**：官方不认 `enabled`，所以停用规则的 handler 不进入派生 JSON；停用后规则仍留在 `managedHooks` 里可恢复。
- **静态校验不执行命令**：名称、事件（7 类命令事件）、`timeoutSec`（1–600 整数）、matcher（`UserPromptSubmit`/`Stop` 不接受 matcher，其余做纯正则校验）都在保存时检查。校验只解析 JSON 和结构，不调用 shell、不运行 Hook。
- **修订号防并发**：每次返回 HMAC 摘要作为 `revision`，编辑、启停、移除都必须带上；目标已变化则拒绝并要求刷新。
- **命令不外泄**：列表只返回 `commandConfigured: boolean`，不返回命令原文；编辑时命令留空表示保留原值。
- **重载顺序**：先释放旧子实例并等待完成，再写派生文件并挂新实例；释放失败或超时进入 `failed`，不创建同名替代实例。加载期间规则再次变化则丢弃本次挂载。
- **状态分离**：分别报告"已保存"（持久化成功）与运行状态（`disabled`/`loading`/`active`/`failed`/`unavailable`）。`active` 只表示桥接器已加载，不代表规则已执行。
- **不碰原生条目**：已存在的 `hooks-claude-code` Loader 条目保持原状，不自动启用、不改其配置。
- **作用域**：只允许 Profile 全局写入；Agent 工具 `dsh_manage_hooks` 与 RPC 复用同一组 Host 方法的参数和语义。

## Alternatives considered

- 直接复用官方 `configPath` 指向用户自己的 hooks.json：无法记录启用状态，也无法在页面上区分哪些规则是托管的。
- 给规则加 `enabled` 字段交给官方解析：官方解析器忽略该字段，停用会失效，属于虚假承诺。
- 自己实现 Hook 执行：重复官方桥接器的协议、payload 与决策映射维护，且易与官方行为漂移。
- 由页面调用 shell 做"试运行"校验：会真实执行用户命令，与"保存不等于执行"的安全前提冲突。
- 每次写操作都重启桥接器：健康规则被无谓重载，增加失败面且放大启动等待。

## Acceptance criteria

停用规则不导入桥接模块、不生成执行文件、不启动进程。启用前校验官方模块与 `shell`/`sessionProjections`/`workingDirectory` 三项能力，缺一即拒绝持久化。同一名称并发创建只有一个成功；过期 `revision` 的启停与移除被拒绝。写入期间规则变化不会挂载过期定义。派生文件仅覆盖自身固定路径，先确认目录与文件为自身普通文件再写入。插件卸载时释放子实例。官方桥接器只收到已启用规则，未匹配事件不执行任何命令。

## Consequences

保存成功与执行生效是两件事，页面必须分开表述。Hook 命令由用户自行保证幂等与安全，插件不做沙箱隔离。外部 Claude Code 的 Hook 配置不在管理范围。DSH 版本不在 `0.2.1-rc.2` 基线时 Hook 写入只读，但停用规则的保存不受模块缺失影响。

## Pitfalls

在桌面已安装插件上编辑页面代码时，插件目录是 junction 直连工作树，改动即时生效。`client.js` 一旦存在语法错误，Web 客户端加载失败并导致应用崩溃重启。刷新界面前必须先 `node --check` 通过并跑隔离回归，不得在已挂载路径上保留破损中间态。
