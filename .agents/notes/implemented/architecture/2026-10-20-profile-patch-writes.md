# Agent Note: Profile patch 作为 MCP 增删的唯一写入点

Status: implemented — 新增与删除 MCP Server 直接改写本 Profile 的 `cordis.patch.yml`；编辑沿用官方 `configEditor`，Hook 功能移除。

## Problem

上一版只能编辑已有条目，且只开放 `command`/`url`/`toolCallTimeoutMs`/`failOnStartupError` 四个控件；README 让用户「用 DSH 自身的 MCP 设置」新增 Server，但官方 0.2.1-rc.2 既没有 MCP 设置页，也没有 MCP CLI。结果是这个插件最该解决的问题反而没有入口。

同时，页面在卸载时会抛 `ReferenceError`（清理函数引用了一个已删除的局部变量），自带测试只把渲染期错误打印成 warning，所以 25 个用例全绿而运行时日志里一直有这个错误。

## Decisions

### 1. 新增/删除写 profile patch，而不是第二份 Server 列表

`Loader.create/remove/update` 都存在，但根 Loader 的 `write()` 是 no-op，不会持久化。Profile 唯一的持久化格式就是 patch 文件：`- insert: [ {id, name, config} ]` 追加行，`- id: X, disabled: true` 覆盖已有行。官方 plugin-manager 与 config-editor 也是这么改这个文件的。

因此 `mcp-patch.js` 只做纯文档变换（`yaml.parseDocument` + `!!js` custom tag，保留注释与表达式），`mcp-write.js` 负责 I/O。这样同一套规则可以在没有 Profile 的测试里逐字节验证。

### 2. create/remove/set-enabled 不复用 `configEditor.edit`

`configEditor.edit()` 内部已经占用 `hmr.runExclusive`，而 `runExclusive` **不可嵌套**；它也只处理「已存在且 fiber ACTIVE」的行，没有新增/删除 API。

所以写入路径自己照抄官方锁顺序：

```
hmr.runExclusive(
  withFileLock(<profile>/package.json,
    读文件 → 变文档 → 原子写 → reconcileProfile(requiredIds)))
```

reconcile 抛错时写回原文本并再 reconcile 一次；两次都失败则报「已写回原状，但重载失败，请重启 DSH」。没有 `hmr` 的 Profile 不改内存树，返回 `restart-required`。

`@deepseek-ai/dsh-atomic-write` 按 optional peer 动态 import，取不到时用 30 行本地等价实现（`<file>.lock`、`wx`、陈旧 PID 接管、临时文件 + rename），保证插件不会因为缺包整个加载失败。

### 3. 允许编辑 inherited 条目

旧代码对 `entry.inherited` 非空的行一律拒绝。实际上 `configEditor.edit()` 写的是 **profile 覆盖层**，官方设计允许修改任何 profile 可寻址的条目。现在的判据是「`configEditor.configuration()` 里能找到这一行」，找不到才拒绝——那才是官方 `edit` 会失败的情形。

### 4. 删除语义：insert 行删除，其它行禁用

只有本 Profile patch 文件 insert 的行可以删。插件包或上层组合提供的行删不掉（删了也会被上层重新组合出来），因此改为写 `disabled: true`，页面明确回报 `removed: 'disabled'`。

### 5. 移除 Hook 页

Hook 规则曾被写到 `tmpdir`，再由官方桥以宿主权限执行命令，默认超时 600s，且只在 `0.2.1-rc.2` 放行。这是本插件里风险最高的部分，却也是与 MCP/Skill 管理无关的部分，整体删除（`managed-hooks.js`、`hooks.*` RPC、`dsh_manage_hooks`、两个 hook 依赖）。

### 6. 客户端接入 locale，而不是硬编码中文

`ctx.locale.register(ns, {zh, en})` + slot 注册声明 `locale: ns` 后，组件会收到 `t` 席位并随语言切换自动重渲染。没有 locale 服务时（测试或精简组合）退回内置中文，slot 注册也不声明 `locale`——声明了却没有 locale face 会让 slot 装配直接抛错。

## Consequences

- 直接写 profile patch 是官方未承诺的扩展点。缓解：严格照抄官方锁顺序、原子写、失败回滚、README 明确标注。
- 写入后回读 `ctx.loader.entries()` 校验目标行确实以期望状态出现；不一致（被 home patch 或 `--patch` overlay 覆盖）返回 `overridden`，与 `configEditor.edit` 的同类检查语义一致。
- 测试 harness 用临时目录里的真实 patch 文件代替 Profile：`configEditor.configuration()`、`hmr.reconcileProfile`、Loader `entries()` 都由同一个文件组合出来，因此「写入 → reconcile → 页面看到」这条链是被真实执行过的。
- 客户端渲染期错误现在计入失败：测试 harness 用自定义 `console.error` 收集并用例断言为空，`results.json` 的失败数会让 `run.mjs` 以非 0 退出。
