# Skill 文件写入（直接落盘，而非注册 Runtime Skill）

日期：2026-10-20
状态：已实现

## 背景

此前的 Skill 页只能管理 Runtime Skill：注册进 `ctx.skills` 的内存名册，插件一停就没了。用户要的是「能真正管理 Skill」，也就是**写文件**。

核实官方 0.2.1-rc.2 运行时后确认：

- `ctx.skills` 只提供 `snapshot()` / `get()` / `register()`；`register()` 注册的是 runtime provider 下的内存条目，**没有任何写入文件的接口**。
- 真正读文件的是 `@deepseek-ai/dsh-skill-filesystem`：它枚举 `<root>/<name>/SKILL.md` 与扁平 `<root>/<name>.md`，`chokidar` 监视每个根目录，因此**写完立刻被发现，不需要重启**。
- frontmatter 只接受 `name`、`description`、`whenToUse`、`disable-model-invocation`、`user-invocable`，外加任意 `metadata`。驼峰形式（`disableModelInvocation` / `modelInvocable` / `userInvocable`）会抛错并让**整个文件被丢弃**——不是忽略该键，是丢掉整个 Skill。
- 根目录按 rank 排序：project-dsh / project-agents（依赖会话 cwd）> custom > user-dsh（`$DSH_HOME/skills`）> user-agents（`$DSH_AGENTS_HOME/skills`）> bundled（只读）。

## 决定

由本插件直接写这些文件，不新增第二套 Skill 存储。

- `renderSkillFile(input, existing)` 只输出规范键，并且**永不**回写驼峰键（即使它已经存在于文件里，也会被丢弃后重写）；非本插件拥有的键原样保留。
- 表单发送的是完整状态，因此**键缺失即等于清空**：清掉「何时使用」会在文件里删掉该键。语义单一，避免「空字符串到底是不改还是清空」的二义。
- 写入用 `writeTextAtomic`（与 config patch 同一个原子替换 helper），权限 `0644`。
- 项目级根目录**不提供文件操作**：它们依赖会话 cwd，设置页无法确定。它们提供的 Skill 照常可见，只是 `editable: false`。页面据此隐藏文件操作，而不是校验后报错。

## 停用与删除：可逆优先

- **停用**是重命名入口文件为 `SKILL.md.disabled`（扁平文件为 `<name>.md.disabled`）。provider 找不到入口就不再发现它，内容不动，再拨一次开关即恢复。`skills.list` 额外返回 `disabled[]`（从 frontmatter 读回真实 `name`），页面为每个已停用项补一行「关掉的开关」。
- **删除**是整个目录 `rename` 到 `$DSH_HOME/.trash/skills/<name>-<时间戳>`。**不 unlink**：误删可从回收目录取回。删除也接受已停用的 Skill。

## 根目录寻址：按路径，不按 source

`custom` 这个 source 名会被**多个**目录共用，用 source 做键只能找到第一个。因此：

- `skills.list` 为每项算出 `rootPath`（已知根目录里最长的前缀匹配），客户端回传的就是这个绝对路径。
- `rootFor(rootPath)` 要求路径与某个已知根目录**完全相等**；`skills.reveal` 要求目标在某个根目录**之内**（`resolve` 后比较，拒绝 `..` 逃逸）。

## 调用策略

`disable-model-invocation: true` → 模型不能自主调用；`user-invocable: false` → 去掉手动入口。表单里是两个复选框，卡片上只在**受限时**显示标签（默认状态不加噪音）。

## 兼容性闸门

`writes.skillFiles = tested && profileContext.dir 是字符串`。写文件不经过运行时接口，所以不受 `configEditor` / `skills.register` 缺失影响；但仍要求版本在已回归列表内，且 Profile 目录存在（作为「这是个真实 Profile」的最小证据）。

## 未做的事

- 不改 `cordis.patch.yml` 去加 provider 或自定义目录——那是上层组合的事，本插件只写已经配置好的根目录。
- 不做 Skill 的富文本编辑、不解析 `metadata`、不碰 `!!js` 之类的表达式。
- Runtime Skill 注册保留，但收进 Skill 页的 `<details>` 次要入口，并标注「重启后失效」。

## 测试

`test/skill-files.test.mjs` 在真实临时目录上跑：写出的文件被自己的解析器读回、停用是重命名而非删除、删除进了回收目录、越界路径被拒、只读运行时一个字节都不落盘。UI 侧覆盖过滤、开关、路径定位、新建/编辑/删除，以及只读时**不出现**任何文件操作。
