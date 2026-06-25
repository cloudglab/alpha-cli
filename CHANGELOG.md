# Changelog

本文件记录 `@cloudglab/alpha-cli` 的用户可见变化。

## [Unreleased]

### 变更

- 与 `zentao-cli` 公共框架对齐：HTTP 客户端加 keepAlive / GET 15s 缓存 / 401 清 token 重试 / 网络错误重试 / 错误统一带 `statusCode` + `responseBody`。
- HTTP 错误从 `error.status` 重命名为 `error.statusCode`，并新增 `error.responseBody`、`error.code`，对齐 `zentao-cli`。
- `ALPHA_DISABLE_WRITE` 严格判定：仅当值等于字符串 `"true"` 时禁用；`"1"` / `"yes"` 等不再触发禁用。
- 写命令（POST/PUT/DELETE/PATCH）自动注入 `confirm` 字段并通过 `runWithPreview` 保护；非写命令维持 `READ_ENDPOINT_NAMES` 白名单豁免。
- 配置路径从 `~/.alpha-cli/config.json` 改为 `~/.alpha/config.json`；保留对旧路径的兜底读取，卸载时同时清理两个位置。

### 新增

- `install` 命令支持安装 skill：自动调用 `npx -y skills add <source> --global --agent universal --yes`；可选 `--skill-source local|git|npm`、`--skill-local-path`、`--cli-only`、`--skill-only`、`--skip-config-check`。
- 新增 `uninstall` / `remove` 命令，支持 `--confirm`、`--keep-config`、`--cli-only`、`--skill-only`；不传 `--confirm` 时输出卸载预览。
- 新增 `changelog` 命令，支持 `--limit N|all`、`--version <v>`、`--since YYYY-MM-DD`、`--raw`。
- `install` 之后会校验 Alpha 配置：已有配置 → mask 输出诊断并通过；不可用且 TTY → 引导输入；非交互 → 抛错。
- 新增角色入口 bin：`alpha-ci`、`alpha-deploy`、`alpha-iter`、`alpha-rbac`、`alpha-file`、`alpha-ops`，等价于锁定 `--role` 的快捷入口。
- 新增 `scripts/generate-manifest.ts`：build 时自动生成 `src/core/command-groups.generated.ts` 和 `dist/manifest.json`，含 `version` / `commands` / `groups` / `commandToGroup`。
- 新增 `scripts/copy-skills.mjs`：把 `.agents/skills/alpha-cli/` 同步到 `skills/alpha-cli/`。
- 新增 `scripts/fix-bin-mode.mjs`：给 `dist/bin/*.js` 设 0o755。
- 新增 `scripts/release-query-smoke.mjs`：发版前查询回归脚本。
- 新增 `scripts/coverage.mjs`：对照 `javams-glab-alpha` HTTP 控制器，统计 CLI 工具覆盖率。
- 新增 `vitest.config.ts`、`lefthook.yml`；`pnpm check = pnpm lint && pnpm typecheck && pnpm test && pnpm build`；`prepare: lefthook install`。
- 新增 `.github/workflows/publish.yml`：tag `v*` 触发，校验 tag 版本与 `package.json` 一致后执行 `pnpm check` 并 `npm publish --provenance --access public`。
- 新增 `AGENTS.md`：项目定位、Agent 使用原则、角色入口、当前核心能力、场景能力、已知限制、写操作保护、环境变量、开发命令、覆盖率统计、发布链路。
- 新增 `reference/index.md` / `reference/cheatsheet.md` / `reference/ci-advanced.md` / `reference/deploy-advanced.md` / `reference/file-advanced.md` / `reference/iter-advanced.md` / `reference/rbac-advanced.md` / `reference/ops-advanced.md`，按业务域拆分 reference。
- `package.json` 补 `repository` 和 `publishConfig: { access: "public" }`。

### 修复

- 修复 `runWithPreview` 工具集没有真正接入 endpoint 注册的问题：所有非白名单的 POST/PUT/DELETE/PATCH endpoint 现在都会通过写保护门控。
- 修复 `install.ts` 缺少 `renderBanner` `export` 关键字的问题。
- 修复 `endpoints.ts` 中 `Method` 类型只支持 `GET | POST`，现在支持 `PUT/DELETE/PATCH`，与 `ENDPOINTS` 数据保持一致。

### 验证

- 待补：`pnpm typecheck`、`pnpm build` 全部通过；`node scripts/copy-skills.mjs` 把 `.agents/skills/alpha-cli/` 复制到 `skills/alpha-cli/`；`node scripts/generate-manifest.ts` 输出的 manifest 包含全部命令。

## [0.1.1] - 2026-06-23

### 更新

- 新增 devops scene 识别能力，支持路由、动作词和隐式 URL 入口。
- 补充项目级 OpenCode `/release` 命令与发布基线说明。
- 版本号同步提升为 `0.1.1`。

## [0.1.0] - 2026-06-23

### 新增

- 初始化 `alpha-cli` TypeScript CLI 骨架，支持按 group / role 注册命令。
- 接入 `root`、`ci`、`deploy`、`file`、`iter`、`rbac` 六类 Alpha API 命令。
- 提供 `install`、`update`、`help`、`list`、`version` 等基础 CLI 能力。
- 新增 devops scene 识别能力，支持从 URL、路由路径和动作词解析为建议命令。

### 说明

- 当前发布基线从 `0.1.0` 开始维护。
