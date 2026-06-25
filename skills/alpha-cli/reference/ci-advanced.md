# CI 高级命令 (ci-advanced)

本文档覆盖 CI / 构建 / 流水线 / 仓库相关的高级 / 写命令。基础查询见主链路的 `ciBuildList` / `ciBranchList` / `ciInfoGetServerTime` 等。

## 写命令（必须传 `confirm=true`）

### 手动构建与参数构建

- `ciBuildManualProcess`：手动触发某个已存在 build 的处理流程。
- `ciBuildFreedomBuild`：自由构建，不绑定具体规则。
- `ciBuildFreedomTags`：自由打 tag。
- `ciBuildParamsBuild`：参数化构建，是 `pushPkg` 内部依赖的核心入口。
- `ciBuildCancel`：取消一个进行中的构建。
- `ciAppSync`：同步 app 元数据。

### 流水线治理

- `ciManageSetConfig`：设置构建模板配置。
- `ciManageUpdateConfig`：增量更新构建模板配置。
- `ciManageClearCache`：清理构建缓存。
- `ciManageResetVersion`：重置构建版本号。
- `ciManageSyncCiConfig`：从 Jenkins 同步 CI 配置。

### 仓库

- `ciRepoAdd`：新增仓库。
- `ciRepoConfigDetail`：读取仓库分支配置（只读查询，但同分组挂这里）。

## 编排命令 (ci-orchestrated)

不归 endpoints 表，单独由 `src/tools/ci-orchestrated.ts` 注册。

- `ciBuildFind --app appName:version [--repoId N] [--branch B] [--includeUnfinished true]`：按 `appName:version` 零相似度反查 `repoId` / `branch` / `buildId`。
- `ciBuildWait --repoId N --branch B [--buildId M] [--timeoutSeconds 1800] [--intervalSeconds 5]`：轮询等待 buildId 变为 `success`。
- `ciBuildRecent [--excludeJobGlab true] [--statusFilter process --statusFilter success]`：聚合当前用户最近构建过的仓库及其 process/success 候选。

## 常见使用模式

### 查一次完整构建链路

```bash
alpha ciBuildGetSelfBuild                                          # 拿我名下的仓库
alpha ciBuildList --body '{"repoId":42,"branch":"main","page":1,"count":20}'
alpha ciBuildGetLatest                                             # 拿最新构建
alpha ciInfoJenkinsOutput --body '{"id":1001}'                    # 看构建输出
alpha ciBuildWait --repoId 42 --branch main --buildId 1001         # 等待完成
```

### 触发并轮询

```bash
alpha ciBuildParamsBuild --body '{"branch":"main","repoId":42,"rules":[]}' --confirm true
alpha ciBuildWait --repoId 42 --branch main --buildId 1001 --timeoutSeconds 1800
```

### 取消构建

```bash
alpha ciBuildCancel --body '{"id":1001}' --confirm true
```

### 清理流水线

```bash
alpha ciManageClearCache --body '{}' --confirm true
alpha ciManageResetVersion --body '{}' --confirm true
alpha ciManageSyncCiConfig --body '{"url":"https://jenkins.example.com"}' --confirm true
```
