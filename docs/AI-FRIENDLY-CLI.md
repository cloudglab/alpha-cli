# AI 友好 CLI 设计规范

本文档沉淀 `zentao-cli` 中“为 AI 优化 CLI 使用体验”的设计要点，并记录当前 `alpha-cli` 的落地情况，便于后续其他 CLI 项目直接复用。

## 核心原则

1. **错误信息要给原因 + 修复方向**：状态码 + 响应片段 + 具体提示。
2. **默认输出是“摘要”，不是“原始 JSON”**：列表裁剪、长文本截断、保留常用 meta。
3. **参数语义要严格**：未知参数直接报错；布尔/数字/数组语义化；`--key value` 与 `--key=value` 等价。
4. **help 结构要面向任务而非模块**：按“服务连通 / 构建 / 部署 / 文件 / 迭代 / 权限”组织，不是按内部代码目录。
5. **写操作默认 preview**：缺少 `--confirm true` 时返回结构化 preview，便于 AI 在不动数据的前提下确认。
6. **安装/更新要给 banner + 快速开始**：成功态输出 ASCII 图案并附带 5 条以内下一步建议。

## 已落地清单（alpha-cli）

### 1. 错误信息（`src/core/http.ts`）

- `AlphaHttpError` 携带 `code` / `status` / `response` / `url` / `hint` 五个结构化字段。
- 错误码分类：`invalid-credentials` / `unauthorized` / `forbidden` / `endpoint-not-found` / `server-error` / `bad-response` / `network-error` / `timeout` / `unknown`。
- 登录错误细化：
  - 401/403 → 提示“账号或密码错误，建议重新 initAlpha 或配置 token”。
  - 404 → 提示“接口不存在，请检查 ALPHA_URL / initAlpha 配置”。
  - 5xx → 提示“服务端异常，请稍后重试”。
- `describeResponseData()` 把响应稳定转成字符串，附在错误末尾便于排查。

### 2. 输出模式与 meta（`src/tools/shared.ts`）

- `OutputMode = 'compact' | 'normal' | 'verbose'`，由 `setGlobalOutputMode()` 切换。
- `jsonResult(value, mode?)`：
  - `compact`：数组 > 20 裁剪为 `{ total, items[:20] }`；`content/data/raw/html/text/message` 长字符串 > 600 字截断。
  - `normal`：在原对象上提取并合并 meta 字段，避免 AI 二次推断。
  - `verbose`：返回完整原始值。
- meta 字段集合（normal 模式保留）：`source, partial, page, limit, total, scanned, durationMs, requestCount, cacheHit, fallbackUsed, command, method, path, mode, group`。
- `withToolMeta(value, meta)`：统一为返回结果附加/合并 meta。

### 3. 写操作预览与确认（`src/tools/shared.ts`）

- `isWriteEnabled()`：读 `ALPHA_DISABLE_WRITE`（`true`/`1` 时禁用）。
- `assertWriteAllowed({ action, confirm })`：缺确认或禁用时直接抛错。
- `previewOrAssertWriteAllowed()`：返回 `{ ok:true }` / `WritePreview` / `UnsupportedWriteDiagnostic`，结构化、可解析。
- `runWithPreview()`：写命令默认走 preview，确认后才执行真正的 `runner()`。

### 4. 参数语义（`src/core/cli-registry.ts`）

- `parseCommandInput()` 拒绝未知参数，提示 `未知参数: --x`。
- 支持 `--key value` 与 `--key=value`，对非数组参数取最后一个值。
- 布尔/数字自动转换；数组支持 JSON / 逗号分隔；对象/Record 支持 JSON 解析，解析失败时附带原始 JSON 错误信息。
- union 类型逐项尝试匹配。

### 5. help 结构（`src/core/cli-output.ts`）

- `printHelp()` 分为：版本信息 → 用法 → 快速开始 → AI 友好提示 → 常用命令 → 输出模式 → 更多帮助。
- `printCommandList()` 按场景分组：
  - 开始使用（内置命令）
  - 服务连通与初始化（root + init）
  - 构建与流水线（CI）
  - 发布与部署（deploy）
  - 文件与制品（file）
  - 迭代与版本（iter）
  - 权限与角色（rbac）
  - 其他（未匹配）
- `formatCommandOutput(commandName, text)`：为高频命令提供摘要化输出：
  - `healthHealthPing`：状态 + 运行时间 + 下一步建议。
  - `userinfo`：姓名 + 角色 + 邮箱 + 角色切换建议。
  - `getAlphaConfig`：url/token/username/timeoutMs + 重新初始化提示。
  - `iterGetTree`：节点数 + 前 10 项 + 列表提示。

### 6. 命令元信息（`src/tools/endpoints.ts`）

- 每个 endpoint 注册时使用 `withToolMeta()` 附加 `source: 'alpha-api'` / `command` / `method` / `path` / `mode` / `group`。
- 每个 endpoint 的 metadata 含 `group`、`description`、`examples`、`costHint` 和 `nextBestTools`（按 group 推荐的后续命令）。
- metadata 帮助 AI 在调用一次后立刻拿到下一步建议，而不是再扫整个 list。

### 7. 安装与更新（`src/install.ts`）

- `alpha install` / `alpha update`：通过 `npm install -g @cloudglab/alpha-cli@latest` 安装。
- 成功时打印 ASCII Banner（与 `zentao-cli` 一致）并附带“快速开始 / 常用命令”提示。
- 遇到 `ENOTEMPTY` / `directory not empty` 时清理 npm 全局残留目录后重试。
- 每一步骤前打印阶段标题，便于 AI 在长命令中保持上下文。

## 给后续 CLI 项目的迁移要点

1. **先把错误分层做好**：状态码 + 错误码 + 响应片段 + 修复提示，少于这个组合的错误信息都建议重构。
2. **输出模式必带 normal**：AI 在中等量数据下优先用 normal，能同时看到主体内容 + meta；脚本用 compact；调试用 verbose。
3. **meta 一定要合到对象顶层**：避免 AI 还要从嵌套结构里手动提取。
4. **写命令必须可预览**：把 `previewOrAssertWriteAllowed()` 模式抽成公共能力，让所有写命令都遵循同一套确认语义。
5. **help 要面向场景**：不要按内部模块分组；按“开始使用 / 我能解决什么任务”来组织。
6. **高频命令给摘要输出**：挑选 3-5 个最常用的命令做 `formatCommandOutput`，让 AI 直接拿到“可读摘要”而不是原始 JSON。
7. **install/update 必须输出 banner**：作为视觉锚点 + 快速开始入口，跨项目复用价值最高。

## 验证

- `pnpm typecheck` 通过。
- `alpha help`：包含“快速开始 / AI 友好提示 / 输出模式”版块。
- `alpha list`：按场景分组展示。
- `alpha --output verbose getAlphaConfig`：返回完整原始 JSON。
- `alpha initAlpha --url https://host --token xxx --save true`：成功后输出“初始化完成”和下一步建议（依赖运行 `alpha help`）。
