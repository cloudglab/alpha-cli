# Alpha CLI 场景链路

本文档面向 Agent 使用，描述页面场景到 CLI 命令的映射。只描述接口链路，不包含 Java 业务逻辑。

## 认证与健康检查

- 健康检查：`healthHealthPing`。
- 当前用户：`userinfo`。
- 登录由 CLI 在配置了 `ALPHA_USERNAME` / `ALPHA_PASSWORD` 时自动完成，并复用服务端 `code` cookie。

## 构建看板

页面：`Devops > 集成 > 构建`。

链路：

1. `ciInfoGetServerTime`：取服务端时间。
2. `ciRepoList`：取项目下拉列表。
3. `ciBuildGetLatest`：最新构建。
4. `ciBuildGetSelfBuild`：我的构建。
5. `ciBuildPopularList`：常用项目。

常用查询：

```bash
alpha ciBuildGetLatest
alpha ciBuildGetSelfBuild
```

## 项目构建

页面：`Devops > 集成 > 项目`、`Devops > 集成 > 构建`。

链路：

1. `ciRepoPage --body '{"page":1,"size":10,"name":"xxx"}'`：搜索项目。
2. `ciRepoInfo --body '{"id":1734}'`：项目详情。
3. `ciBranchList --body '{"repoId":1734}'`：分支列表。
4. `ciBuildManualProcess --body '{...}'`：触发构建。
5. `ciBuildGetBuild --body '{"buildId":371094}'`：构建详情。
6. `ciInfoJenkinsOutput --body '{"buildId":371094,"stage":"xxx"}'`：Jenkins 输出。
7. `ciBuildCancel --body '{"buildId":371094}'`：取消构建，危险操作。

写操作确认点：触发构建、取消构建。

## 流水线与统配规则

页面：`Devops > 集成 > 流水线`、`Devops > 集成 > 统配规则`。

链路：

1. `ciManageGetPipelines`：流水线列表。
2. `ciManageGetTemplateList`：模板列表。
3. `ciManageGetConfig --body '{"repoId":1734}'`：仓库配置。
4. `ciManageSetConfig` / `ciManageUpdateConfig`：设置或更新配置，危险操作。
5. `ciManageClearCache` / `ciManageResetVersion` / `ciManageSyncCiConfig`：治理操作，危险操作。

## 迭代版本

页面：`Devops > 迭代 > 版本列表`。

链路：

1. `iterGetTree`：取产品/项目/版本树。
2. `iterVersionList --body '{"page":1,"count":10}'`：版本列表。
3. `iterVersionTagList`：迭代类型列表。
4. `iterVersionDetail --body '{"versionId":123}'`：版本详情。
5. `iterVersionAdd --body '{...}'`：新建版本，危险操作。
6. `iterVersionEdit --body '{...}'`：编辑版本，危险操作。
7. `iterVersionDisable --body '{"id":123}'`：封板，危险操作。
8. `iterVersionDelete --body '{"versionId":123}'`：删除，危险操作。

新建版本最少需要关注字段：`prodId`、`projectId`、`version`、`tag`、`changeLog`。复杂版本还可能需要 `appList`、`azList`、`gflowList`、`udfList`、`config`、`apolloConfig`、`mysql`、`privilege` 等。

## 提测管理

页面：版本列表行内 `提测管理`。

链路：

1. `iterVersionTestVersionList --body '{"versionId":123}'`：提测列表。
2. `iterVersionTestVersionDetail --body '{"id":456}'`：提测详情。
3. `iterVersionTestVersionSave --body '{...}'`：保存提测，危险操作。
4. `iterVersionTestVersionSubmit --body '{"testVersionId":456}'`：提交提测，危险操作。
5. `iterVersionTestVersionCount --body '{"versionId":123,"tag":"BUSINESS"}'`：统计。

## Hotfix 管理

页面：版本列表行内 `hotfix管理`。

链路：

1. `iterHotfixList --body '{"versionId":123}'`：hotfix 列表。
2. `iterHotfixDetail --body '{"hotfixId":456}'`：详情。
3. `iterHotfixSave --body '{...}'`：新增/编辑 hotfix，危险操作。
4. `iterHotfixMerge --body '{"hotfixId":456,"action":"..."}'`：合并 hotfix，危险操作。

## 环境部署

页面：`Devops > 部署 > 环境部署`，也可从版本列表行内 `部署` 进入。

链路：

1. `iterVersionDetail --body '{"versionId":123}'`：确认版本内容。
2. `deployClusterDestinations --body '{...}'`：查可部署集群。
3. `deployProjectDeploy --body '{...}'`：执行部署，危险操作。
4. `deployProjectRetryDeploy --body '{"id":789}'`：重试部署，危险操作。
5. `deployProjectDeployPage --body '{"page":1,"count":10}'`：部署历史。
6. `deployProjectDeployPageExpand --body '{"deployId":789}'`：部署历史展开。

## 应用运维

页面：`Devops > 部署 > 应用列表`、`Devops > 部署 > 云端app`。

链路：

1. `deployAppsPage --body '{...}'`：应用分页。
2. `deployAppsVersionList --body '{"appName":"xxx"}'`：应用版本列表。
3. `deployAppsNsList --body '{"clusterId":1}'`：命名空间。
4. `deployAppsDetailK8s --body '{...}'`：K8s 详情。
5. `deployAppsLogUrl --body '{...}'`：日志 URL。
6. `deployAppsBashUrl --body '{...}'`：终端 URL。
7. `deployAppsInstall` / `deployAppsUpgrade` / `deployAppsImageVersion`：安装、升级、换镜像，危险操作。
8. `deployAppsViewHistory --body '{"appId":1}'`：历史。
9. `deployAppsRollback --body '{"appId":1,"historyId":2}'`：回滚，危险操作。
10. `deployAppsUninstall --body '{"appId":1}'`：卸载，高危操作。

## 地方环境与推包

页面：`Devops > 部署 > 地方环境`。

链路：

1. `deployPushenvList`：地方环境列表。
2. `deployPushenvPage --body '{...}'`：分页搜索。
3. `deployProjectPush --body '{...}'`：推包，危险操作。
4. `deployProjectFilePush --body '{...}'`：文件推送，危险操作。
5. `deployProjectPushPage --body '{...}'`：推包历史。
6. `deployProjectPushPageExpand --body '{...}'`：推包详情。
7. `deployProjectPushGoon --body '{"id":1,"action":"..."}'`：继续/中止，危险操作。

## 集群管理

页面：`Devops > 部署 > 集群管理`。

链路：

1. `deployClusterTypeList`：集群类型。
2. `deployClusterList --body '{...}'`：集群列表。
3. `deployClusterPage --body '{...}'`：集群分页。
4. `deployClusterDetail --body '{"id":1}'`：详情。
5. `deployClusterAdd` / `deployClusterEdit`：新增/编辑集群，危险操作。

## 物料与文件

页面：`Devops > 部署 > 物料列表`。

链路：

1. `deployMaterialPage --body '{...}'`：物料分页。
2. `deployMaterialDetail --body '{"id":1}'`：详情。
3. `deployMaterialUpload --file ./pkg.zip`：上传物料，危险操作。
4. `deployMaterialAdd` / `deployMaterialEdit`：新增/编辑物料，危险操作。
5. `fileMetadataPage --body '{...}'`：文件元数据分页。
6. `fileMetadataTypes`：文件类型。
7. `fileMetadataDownload --query '{"id":1}'`：下载。
8. `fileMetadataPreview --query '{"id":1}'`：预览。

## RBAC

页面功能可能在配置台或权限管理入口。

链路：

1. `rbacRoleCurrentList`：当前角色。
2. `rbacPrivilegeCurrentList`：当前权限。
3. `rbacPrivilegeList --body '{...}'`：权限列表。
4. `rbacRoleAssignRoles --body '{"userId":1,"roleIds":[1]}'`：分配角色，危险操作。
5. `rbacPrivilegeAssignPrivileges --body '{"roleId":1,"privilegeIds":[1]}'`：分配权限，危险操作。
