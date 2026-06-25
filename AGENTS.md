# AGENTS.md

给 AI Agent / Skill 维护者看的项目说明。README 面向用户，只保留安装方式和场景化用法；实现细节、MVP 能力、已知限制和发布说明放在这里。

## 项目定位

`@cloudglab/alpha-cli` 是基于 `zentao-cli` 公共框架重建的 Alpha 一站式开发者平台命令行工具，专注于把 `javams-glab-alpha` 中 Spring Controller 暴露的接口转换为 CLI / Skill 入口。

核心目标：把 CI、部署、文件、迭代、RBAC、运维推送等 130+ Alpha API 暴露给命令行、脚本和 AI Skill 使用。

不迁移 Java 业务逻辑：CLI 只在 HTTP 层封装，业务规则仍由 Alpha 服务端承担。

## Agent 使用原则

- 优先使用本机 `alpha`。
- 未安装时，优先推荐一键安装：`npx -y @cloudglab/alpha-cli@latest install`。
- 当前环境不方便安装时，才临时使用 `npx -y @cloudglab/alpha-cli@latest`。
- 配置文件位置：`~/.alpha/config.json`（`~/.alpha-cli/config.json` 仍可读，向后兼容）。
- 默认支持写操作；真实写入仍必须传 `confirm=true`。如需禁用写操作，可设置 `ALPHA_DISABLE_WRITE=true`。
- 如果遇到 `ECONNRESET` / TLS 断开，HTTP 层会自动重试一次；连续失败两次先报告网络阻塞。

## 角色入口

- `full`：完整能力。
- `ci`：CI / 构建 / 流水线 / 推包。
- `deploy`：发布部署、集群、物料、推包。
- `file`：文件与制品元数据。
- `iter`：迭代管理、版本、hotfix、提测。
- `rbac`：权限与角色。
- `ops`：SSH 推送、自定义运维命令。

角色只过滤 CLI 暴露命令，不改变 Alpha 登录身份或服务端权限。

多入口 bin 同步提供：

- `alpha`：默认入口，等价于 `alpha --role full`。
- `alpha-ci`：锁定 `--role ci`。
- `alpha-deploy`：锁定 `--role deploy`。
- `alpha-iter`：锁定 `--role iter`。
- `alpha-rbac`：锁定 `--role rbac`。
- `alpha-file`：锁定 `--role file`。
- `alpha-ops`：锁定 `--role ops`。

## 当前核心能力

- 基础接口：`healthHealthPing`、`userinfo`、`uid`、`logout`、`testApi`、`login`。
- CI / 构建：`ciBuildList`、`ciBuildGetLatest`、`ciBuildGetSelfBuild`、`ciBuildGetBuild`、`ciBuildFind`、`ciBuildWait`、`ciBuildRecent`、`ciBuildCancel`、`ciBuildManualProcess`、`ciBuildFreedomBuild`、`ciBuildFreedomTags`、`ciBuildParamsBuild`、`ciBranchList`、`ciBranchSearch`、`ciInfoGetServerTime`、`ciInfoJenkinsOutput`、`ciInfoGetRelCommit`、`ciInfoChangeInfo`、`ciManageGetPipelines`、`ciManageGetTemplateList`、`ciManageSetConfig`、`ciManageGetConfig`、`ciManageUpdateConfig`、`ciManageClearCache`、`ciManageResetVersion`、`ciManageSyncCiConfig`、`ciRepoList`、`ciRepoPage`、`ciRepoInfo`、`ciRepoAdd`、`ciRepoConfigDetail`。
- 发布部署：`deployAppsSync`、`deployAppsPage`、`deployAppsVersionList`、`deployAppsNsList`、`deployAppsInstall`、`deployAppsAzDeploy`、`deployAppsUpgrade`、`deployAppsUninstall`、`deployAppsRollback`、`deployAppsRecentList`、`deployAppsViewK8s`、`deployAppsDetailK8s`、`deployAppsRefreshResource`、`deployAppsLogUrl`、`deployAppsBashUrl`、`deployAppsViewHistory`、`deployAppsImageVersion`、`deployChartsPage`、`deployChartsDetail`、`deployChartsVersion`、`deployChartsValues`、`deployChartsDeployStatus`、`deployClusterAdd`、`deployClusterEdit`、`deployClusterPage`、`deployClusterList`、`deployClusterDetail`、`deployClusterTypeList`、`deployClusterDestinations`、`deployMaterialAdd`、`deployMaterialEdit`、`deployMaterialUpload`、`deployMaterialPage`、`deployMaterialList`、`deployMaterialDetail`、`deployMaterialSync`、`deployProjectAzProList`、`deployProjectAzUserList`、`deployProjectAzProjectAdd`、`deployProjectAzDeploy`、`deployProjectRetryAzDeploy`、`deployProjectDeploy`、`deployProjectRetryDeploy`、`deployProjectDeployPage`、`deployProjectDeployPageExpand`、`deployProjectPush`、`deployProjectFilePush`、`deployProjectPushGoon`、`deployProjectPushList`、`deployProjectPushPage`、`deployProjectPushPageExpand`、`deployPushenvAdd`、`deployPushenvPage`、`deployPushenvList`、`deployPushenvEdit`、`deployPushenvDetail`。
- 文件与制品：`fileMetadataPage`、`fileMetadataTypes`、`fileMetadataDownload`、`fileMetadataPreview`、`fileMetadataAdd`。
- 迭代与版本：`iterHotfixSave`、`iterHotfixList`、`iterHotfixDetail`、`iterHotfixMerge`、`iterProdAdd`、`iterProdGetList`、`iterProjectAdd`、`iterProjectGetList`、`iterProjectDelete`、`iterGetTree`、`iterVersionAdd`、`iterVersionSwitchAz2resourceUrl`、`iterVersionSwitchGflow2resourceUrl`、`iterVersionSwitchEnvInit2resourceUrl`、`iterVersionSwitchUdf2resourceUrl`、`iterVersionDisable`、`iterVersionEdit`、`iterVersionDetail`、`iterVersionMergeHis`、`iterVersionList`、`iterVersionTagList`、`iterVersionDelete`、`iterVersionTestVersionSave`、`iterVersionTestVersionList`、`iterVersionTestVersionDetail`、`iterVersionTestVersionSubmit`、`iterVersionTestVersionCount`、`iterVersionGetTree`、`iterVersionGetRecentTestSubmitted`。
- 权限与角色：`rbacPrivilegeCurrentList`、`rbacPrivilegeList`、`rbacPrivilegeAssignPrivileges`、`rbacRoleCurrentList`、`rbacRoleAssignRoles`。
- 运维与编排：`opsPush`（SSH 推送）、`pushPkg`（一键选版本→构建 charts/images→上传物料→SSH 推送）。
- 初始化与场景识别：`initAlpha`、`getAlphaConfig`、`devopsScene`。

## 场景能力说明

### 初始化

```bash
alpha initAlpha --url https://alpha.example.com --token xxx --save true
alpha getAlphaConfig
alpha --output verbose getAlphaConfig
```

### 写操作

- 写命令（POST/PUT/DELETE/PATCH）需要传 `--confirm true` 才会真正执行；不传或 `false` 时只返回 preview 预览。
- 默认支持写操作；如需禁用，设置 `ALPHA_DISABLE_WRITE=true`。
- 部分 POST endpoint 实际是只读查询（`userinfo`、`uid`、`ciBuildList`、`iterVersionList` 等），已在 `endpoints.ts` 维护白名单，不需要 confirm。

### 场景识别

`devopsScene` 支持从浏览器 URL、路由路径、动作词解析为建议命令，输出 `matchedServer`、`routeKind`、`params`、`primaryCommand`、`suggestedCommands`。

```bash
alpha devopsScene --input https://host/main/devops/iteration/test/123/create
alpha devopsScene --input "手动构建"
```

### 一键推包

`pushPkg` 把"选版本→构建 charts→构建 images→上传物料→SSH 推送到城市"串成一条命令，需要传 `--confirm true`。

```bash
alpha pushPkg --versions jwsp-office-automation:3.0.0-319751 --city hzcore --confirm true
alpha pushPkg --versions a:1.0.0-1 --city hzcore --noPush true   # 仅生成下载链接
```

### 运维推送

`opsPush` 通过堡垒机登录目标服务器，下载 URL 列表、打包并用 rsync 推送到城市；需要传 `--confirm true`。

## 已知限制

- 当前 CLI 不会自动迁移旧版 `~/.alpha-cli/config.json` 路径，新版会读取到 `~/.alpha/config.json`，但保留对老路径的兜底读取。
- HTTP 客户端仅对 `ECONNRESET` / `ETIMEDOUT` / `EAI_AGAIN` / 网络层错误做一次自动重试；连续失败两次先报告网络阻塞。
- GET 请求在内存中保留 15 秒缓存，命中时响应会带 `meta.cacheHit: true`。
- `devopsScene` 的规则表集中在 `src/core/devops-scene.ts`；新增页面类型请同步维护 `ROUTE_RULES` 和 `ACTION_RULES`。
- `pushPkg` 默认会触发 `paramsBuild` 构建，远端依赖 master 分支和约定好的 repoId（`job-glab-pkg_charts` / `job-glab-pkg_images`），fallback 仍按 `494` / `210`。

## 写操作保护

默认支持写操作；真实写入仍必须传 `confirm=true`。

如需禁用写操作，可设置 `ALPHA_DISABLE_WRITE=true`。

默认 preview 或直接返回诊断，不应静默写入线上。

`ALPHA_DISABLE_WRITE` 严格判定：仅当值等于字符串 `"true"` 时禁用；`"1"` / `"yes"` / 其它均视为允许。

## 环境变量

```bash
export ALPHA_URL="https://alpha.example.com"
export ALPHA_TOKEN="your-token"
export ALPHA_USERNAME="your-account"   # 可选，账密登录时使用
export ALPHA_PASSWORD="your-password" # 可选，账密登录时使用
export ALPHA_TIMEOUT_MS="30000"       # 可选，请求超时毫秒

# SSH 凭据（不落盘）
export ALPHA_SSH_USER="ssh-user"
export ALPHA_SSH_PASS="ssh-pass"

# 运维配置（ALPHA_OPS_* 可走环境变量覆盖）
export ALPHA_OPS_BASTION="192.168.60.101"
export ALPHA_OPS_TARGET="192.168.8.45"
export ALPHA_OPS_SYSTEM_USER_ID="1"
export ALPHA_OPS_DOWNLOAD_DIR="/data/pkg_release/fz_downloads"
export ALPHA_OPS_RSYNC_SCRIPT="/data/pkg_release/rsync.sh"
```

`initAlpha` 默认只校验并在当前进程内生效，不会自动写入 `~/.alpha/config.json`；只有显式传 `save: true` 才会落盘。

## 开发

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm lint
pnpm test
pnpm check   # lint + typecheck + test + build
```

不要在未被明确要求时提交代码。

## 开发态：覆盖率统计

`pnpm coverage` 对照本地 zentao 控制器入口表，统计 CLI 命令覆盖率。

跑法：

```bash
pnpm coverage
node scripts/coverage.mjs --missing
node scripts/coverage.mjs --missing ci
```

输出三段：总览、各模块覆盖、各模块缺失入口。退出码：100% 覆盖返回 0，否则返回 1（CI 门禁用）。

## 发布链路

已内置 GitHub Actions：push 形如 `v*` 的 tag 时会安装依赖、执行 `pnpm check`、发布 npm 包。GitHub Release 由项目级 `/release` 流程手动创建，Actions 不自动创建 Release。

工作流文件：`.github/workflows/publish.yml`。

发版前确保：

- `package.json` 中的 `version` 与 tag 一致。
- 本地先运行 `pnpm check`，再运行 `pnpm release:smoke-query` 做查询回归。
- npm 包已配置 GitHub Actions trusted publisher，绑定仓库 `cloudglab/alpha-cli`（需在 npm 上手动绑定）。
