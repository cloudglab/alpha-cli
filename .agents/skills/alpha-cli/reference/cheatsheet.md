# Alpha CLI Cheatsheet

`@cloudglab/alpha-cli` 注册的全部命令速查清单。所有 endpoint 来自 `javams-glab-alpha` HTTP API，未做业务逻辑迁移。

## 基础接口 (root)

| 命令 | 方法 | 路径 | 模式 | 写 |
| --- | --- | --- | --- | --- |
| `healthHealthPing` | GET | `/health/health/ping` | none | 否 |
| `login` | POST | `/alpha/login` | body | 是 |
| `userinfo` | POST | `/alpha/userinfo` | none | 否（只读查询） |
| `uid` | POST | `/alpha/uid` | body | 否（只读查询） |
| `logout` | POST | `/alpha/logout` | none | 是 |
| `testApi` | GET | `/alpha/test-api` | none | 否 |

## CI / 构建 (ci)

| 命令 | 方法 | 路径 | 写 |
| --- | --- | --- | --- |
| `ciAppSync` | POST | `/alpha/ci/app/sync` | 是 |
| `ciBranchList` | POST | `/alpha/ci/branch/list` | 否（只读查询） |
| `ciBranchSearch` | POST | `/alpha/ci/branch/search` | 否（只读查询） |
| `ciBuildGetBuild` | POST | `/alpha/ci/build/getBuild` | 否（只读查询） |
| `ciBuildManualProcess` | POST | `/alpha/ci/build/manualProcess` | 是 |
| `ciBuildFreedomBuild` | POST | `/alpha/ci/build/freedomBuild` | 是 |
| `ciBuildFreedomTags` | POST | `/alpha/ci/build/freedomTags` | 是 |
| `ciBuildParamsBuild` | POST | `/alpha/ci/build/paramsBuild` | 是 |
| `ciBuildList` | POST | `/alpha/ci/build/list` | 否（只读查询） |
| `ciBuildPopularList` | POST | `/alpha/ci/build/popularList` | 否（只读查询） |
| `ciBuildGetLatest` | POST | `/alpha/ci/build/getLatest` | 否（只读查询） |
| `ciBuildGetSelfBuild` | POST | `/alpha/ci/build/getSelfBuild` | 否（只读查询） |
| `ciBuildCancel` | POST | `/alpha/ci/build/cancel` | 是 |
| `ciInfoChangeInfo` | POST | `/alpha/ci/info/changeInfo` | 否（只读查询） |
| `ciInfoGetServerTime` | POST | `/alpha/ci/info/getServerTime` | 否（只读查询） |
| `ciInfoJenkinsOutput` | POST | `/alpha/ci/info/jenkins-output` | 否（只读查询） |
| `ciInfoGetRelCommit` | POST | `/alpha/ci/info/getRelCommit` | 否（只读查询） |
| `ciManageGetPipelines` | POST | `/alpha/ci/manage/getPipelines` | 否（只读查询） |
| `ciManageGetTemplateList` | POST | `/alpha/ci/manage/getTemplateList` | 否（只读查询） |
| `ciManageSetConfig` | POST | `/alpha/ci/manage/setConfig` | 是 |
| `ciManageGetConfig` | POST | `/alpha/ci/manage/getConfig` | 否（只读查询） |
| `ciManageUpdateConfig` | POST | `/alpha/ci/manage/updateConfig` | 是 |
| `ciManageClearCache` | POST | `/alpha/ci/manage/clearCache` | 是 |
| `ciManageResetVersion` | POST | `/alpha/ci/manage/resetVersion` | 是 |
| `ciManageSyncCiConfig` | POST | `/alpha/ci/manage/sync-ci-config` | 是 |
| `ciRepoList` | POST | `/alpha/ci/repo/list` | 否（只读查询） |
| `ciRepoPage` | POST | `/alpha/ci/repo/page` | 否（只读查询） |
| `ciRepoInfo` | POST | `/alpha/ci/repo/info` | 否（只读查询） |
| `ciRepoAdd` | POST | `/alpha/ci/repo/add` | 是 |
| `ciRepoConfigDetail` | POST | `/alpha/ci/repo/config-detail` | 否（只读查询） |

## 编排命令 (ci-orchestrated)

| 命令 | 描述 | 写 |
| --- | --- | --- |
| `ciBuildFind` | 按 `appName:version` 反查 repoId/branch/build | 否 |
| `ciBuildWait` | 轮询等待 buildId 变为 success | 否 |
| `ciBuildRecent` | 聚合最近构建的 process/success 候选 | 否 |

## 发布部署 (deploy)

| 命令 | 方法 | 路径 | 写 |
| --- | --- | --- | --- |
| `deployAppsSync` | POST | `/alpha/deploy/apps/sync` | 是 |
| `deployAppsPage` | POST | `/alpha/deploy/apps/page` | 否（只读查询） |
| `deployAppsVersionList` | POST | `/alpha/deploy/apps/version-list` | 否（只读查询） |
| `deployAppsNsList` | POST | `/alpha/deploy/apps/ns-list` | 否（只读查询） |
| `deployAppsInstall` | POST | `/alpha/deploy/apps/install` | 是 |
| `deployAppsAzDeploy` | POST | `/alpha/deploy/apps/azDeploy` | 是 |
| `deployAppsUpgrade` | POST | `/alpha/deploy/apps/upgrade` | 是 |
| `deployAppsUninstall` | POST | `/alpha/deploy/apps/uninstall` | 是 |
| `deployAppsRollback` | POST | `/alpha/deploy/apps/rollback` | 是 |
| `deployAppsRecentList` | POST | `/alpha/deploy/apps/recent-list` | 否（只读查询） |
| `deployAppsViewK8s` | POST | `/alpha/deploy/apps/view-k8s` | 否（只读查询） |
| `deployAppsDetailK8s` | POST | `/alpha/deploy/apps/detail-k8s` | 否（只读查询） |
| `deployAppsRefreshResource` | POST | `/alpha/deploy/apps/refresh-resource` | 是 |
| `deployAppsLogUrl` | POST | `/alpha/deploy/apps/log-url` | 否（只读查询） |
| `deployAppsBashUrl` | POST | `/alpha/deploy/apps/bash-url` | 否（只读查询） |
| `deployAppsViewHistory` | POST | `/alpha/deploy/apps/view-history` | 否（只读查询） |
| `deployAppsImageVersion` | POST | `/alpha/deploy/apps/image-version` | 是 |
| `deployChartsPage` | POST | `/alpha/deploy/charts/page` | 否（只读查询） |
| `deployChartsDetail` | POST | `/alpha/deploy/charts/detail` | 否（只读查询） |
| `deployChartsVersion` | POST | `/alpha/deploy/charts/version` | 否（只读查询） |
| `deployChartsValues` | POST | `/alpha/deploy/charts/values` | 否（只读查询） |
| `deployChartsDeployStatus` | POST | `/alpha/deploy/charts/deploy-status` | 否（只读查询） |
| `deployClusterAdd` | POST | `/alpha/deploy/cluster/add` | 是 |
| `deployClusterEdit` | POST | `/alpha/deploy/cluster/edit` | 是 |
| `deployClusterPage` | POST | `/alpha/deploy/cluster/page` | 否（只读查询） |
| `deployClusterList` | POST | `/alpha/deploy/cluster/list` | 否（只读查询） |
| `deployClusterDetail` | POST | `/alpha/deploy/cluster/detail` | 否（只读查询） |
| `deployClusterTypeList` | POST | `/alpha/deploy/cluster/type-list` | 否（只读查询） |
| `deployClusterDestinations` | POST | `/alpha/deploy/cluster/destinations` | 否（只读查询） |
| `deployMaterialAdd` | POST | `/alpha/deploy/material/add` | 是 |
| `deployMaterialEdit` | POST | `/alpha/deploy/material/edit` | 是 |
| `deployMaterialUpload` | POST | `/alpha/deploy/material/upload` | 是（multipart） |
| `deployMaterialPage` | POST | `/alpha/deploy/material/page` | 否（只读查询） |
| `deployMaterialList` | POST | `/alpha/deploy/material/list` | 否（只读查询） |
| `deployMaterialDetail` | POST | `/alpha/deploy/material/detail` | 否（只读查询） |
| `deployMaterialSync` | POST | `/alpha/deploy/material/sync` | 是 |
| `deployProjectAzProList` | POST | `/alpha/deploy/project/azProList` | 否（只读查询） |
| `deployProjectAzUserList` | POST | `/alpha/deploy/project/azUserList` | 否（只读查询） |
| `deployProjectAzProjectAdd` | POST | `/alpha/deploy/project/azProjectAdd` | 是 |
| `deployProjectAzDeploy` | POST | `/alpha/deploy/project/azDeploy` | 是 |
| `deployProjectRetryAzDeploy` | POST | `/alpha/deploy/project/retry-azDeploy` | 是 |
| `deployProjectDeploy` | POST | `/alpha/deploy/project/deploy` | 是 |
| `deployProjectRetryDeploy` | POST | `/alpha/deploy/project/retry-deploy` | 是 |
| `deployProjectDeployPage` | POST | `/alpha/deploy/project/deploy-page` | 否（只读查询） |
| `deployProjectDeployPageExpand` | POST | `/alpha/deploy/project/deploy-page-expand` | 否（只读查询） |
| `deployProjectPush` | POST | `/alpha/deploy/project/push` | 是 |
| `deployProjectFilePush` | POST | `/alpha/deploy/project/file-push` | 是 |
| `deployProjectPushGoon` | POST | `/alpha/deploy/project/push-goon` | 是 |
| `deployProjectPushList` | POST | `/alpha/deploy/project/push-list` | 否（只读查询） |
| `deployProjectPushPage` | POST | `/alpha/deploy/project/push-page` | 否（只读查询） |
| `deployProjectPushPageExpand` | POST | `/alpha/deploy/project/push-page-expand` | 否（只读查询） |
| `deployPushenvAdd` | POST | `/alpha/deploy/pushenv/add` | 是 |
| `deployPushenvPage` | POST | `/alpha/deploy/pushenv/page` | 否（只读查询） |
| `deployPushenvList` | POST | `/alpha/deploy/pushenv/list` | 否（只读查询） |
| `deployPushenvEdit` | POST | `/alpha/deploy/pushenv/edit` | 是 |
| `deployPushenvDetail` | POST | `/alpha/deploy/pushenv/detail` | 否（只读查询） |

## 文件与制品 (file)

| 命令 | 方法 | 路径 | 写 |
| --- | --- | --- | --- |
| `fileMetadataPage` | POST | `/alpha/file/metadata/page` | 否（只读查询） |
| `fileMetadataTypes` | POST | `/alpha/file/metadata/types` | 否（只读查询） |
| `fileMetadataDownload` | GET | `/alpha/file/metadata/download` | 否 |
| `fileMetadataPreview` | GET | `/alpha/file/metadata/preview` | 否 |
| `fileMetadataAdd` | POST | `/alpha/file/metadata/add` | 是（multipart） |

## 迭代与版本 (iter)

| 命令 | 方法 | 路径 | 写 |
| --- | --- | --- | --- |
| `iterHotfixSave` | POST | `/alpha/iter/hotfix/save` | 是 |
| `iterHotfixList` | POST | `/alpha/iter/hotfix/list` | 否（只读查询） |
| `iterHotfixDetail` | POST | `/alpha/iter/hotfix/detail` | 否（只读查询） |
| `iterHotfixMerge` | POST | `/alpha/iter/hotfix/merge` | 是 |
| `iterProdAdd` | POST | `/alpha/iter/prod/add` | 是 |
| `iterProdGetList` | POST | `/alpha/iter/prod/getList` | 否（只读查询） |
| `iterProjectAdd` | POST | `/alpha/iter/project/add` | 是 |
| `iterProjectGetList` | POST | `/alpha/iter/project/getList` | 否（只读查询） |
| `iterProjectDelete` | POST | `/alpha/iter/project/delete` | 是 |
| `iterGetTree` | POST | `/alpha/iter/getTree` | 否（只读查询） |
| `iterVersionAdd` | POST | `/alpha/iter/version/add` | 是 |
| `iterVersionSwitchAz2resourceUrl` | POST | `/alpha/iter/version/switchAz2resourceUrl` | 是 |
| `iterVersionSwitchGflow2resourceUrl` | POST | `/alpha/iter/version/switchGflow2resourceUrl` | 是 |
| `iterVersionSwitchEnvInit2resourceUrl` | POST | `/alpha/iter/version/switchEnvInit2resourceUrl` | 是 |
| `iterVersionSwitchUdf2resourceUrl` | POST | `/alpha/iter/version/switchUdf2resourceUrl` | 是 |
| `iterVersionDisable` | POST | `/alpha/iter/version/disable` | 是 |
| `iterVersionEdit` | POST | `/alpha/iter/version/edit` | 是 |
| `iterVersionDetail` | POST | `/alpha/iter/version/detail` | 否（只读查询） |
| `iterVersionMergeHis` | POST | `/alpha/iter/version/merge-his` | 是 |
| `iterVersionList` | POST | `/alpha/iter/version/list` | 否（只读查询） |
| `iterVersionTagList` | POST | `/alpha/iter/version/tag-list` | 否（只读查询） |
| `iterVersionDelete` | POST | `/alpha/iter/version/delete` | 是 |
| `iterVersionTestVersionSave` | POST | `/alpha/iter/version/testVersionSave` | 是 |
| `iterVersionTestVersionList` | POST | `/alpha/iter/version/testVersionList` | 否（只读查询） |
| `iterVersionTestVersionDetail` | POST | `/alpha/iter/version/testVersionDetail` | 否（只读查询） |
| `iterVersionTestVersionSubmit` | POST | `/alpha/iter/version/testVersionSubmit` | 是 |
| `iterVersionTestVersionCount` | POST | `/alpha/iter/version/testVersionCount` | 否（只读查询） |
| `iterVersionGetTree` | POST | `/alpha/iter/version/getTree` | 否（只读查询） |
| `iterVersionGetRecentTestSubmitted` | POST | `/alpha/iter/version/getRecentTestSubmitted` | 否（只读查询） |

## 权限与角色 (rbac)

| 命令 | 方法 | 路径 | 写 |
| --- | --- | --- | --- |
| `rbacPrivilegeCurrentList` | POST | `/alpha/rbac/privilege/current-list` | 否（只读查询） |
| `rbacPrivilegeList` | POST | `/alpha/rbac/privilege/list` | 否（只读查询） |
| `rbacPrivilegeAssignPrivileges` | POST | `/alpha/rbac/privilege/assign-privileges` | 是 |
| `rbacRoleCurrentList` | POST | `/alpha/rbac/role/current-list` | 否（只读查询） |
| `rbacRoleAssignRoles` | POST | `/alpha/rbac/role/assign-roles` | 是 |

## 运维与编排 (ops / push)

| 命令 | 描述 | 写 |
| --- | --- | --- |
| `opsPush` | 通过堡垒机下载 URL 列表、打包并 rsync 推送到城市 | 是 |
| `pushPkg` | 选版本→构建 charts/images→上传物料→SSH 推送 | 是 |

## 初始化与场景识别

| 命令 | 描述 | 写 |
| --- | --- | --- |
| `initAlpha` | 初始化 Alpha 连接配置 | 否（只有传 --save true 时落盘） |
| `getAlphaConfig` | 查看当前 Alpha 配置 | 否 |
| `devopsScene` | 解析 devops 浏览器上下文，输出建议命令 | 否 |
