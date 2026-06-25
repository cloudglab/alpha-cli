# 发布部署高级命令 (deploy-advanced)

本文档覆盖发布部署、集群管理、物料上传、推包相关的高级 / 写命令。基础查询见主链路的 `deployAppsPage` / `deployClusterList` / `deployMaterialPage` 等。

## 写命令（必须传 `confirm=true`）

### 应用生命周期

- `deployAppsSync`：同步应用元数据。
- `deployAppsInstall`：安装新应用。
- `deployAppsUpgrade`：升级应用。
- `deployAppsUninstall`：卸载应用。
- `deployAppsRollback`：回滚应用。
- `deployAppsAzDeploy`：AZ 多云部署。
- `deployAppsImageVersion`：更新镜像版本。
- `deployAppsRefreshResource`：刷新 K8s 资源。

### Charts

- `deployChartsPage` / `deployChartsDetail` / `deployChartsVersion` / `deployChartsValues` / `deployChartsDeployStatus` 为只读查询。
- Charts 部署统一走 `deployProjectDeploy` / `deployProjectAzDeploy`。

### 集群

- `deployClusterAdd`：新增集群。
- `deployClusterEdit`：编辑集群。
- `deployClusterTypeList` / `deployClusterDestinations` / `deployClusterPage` / `deployClusterList` / `deployClusterDetail` 为只读查询。

### 物料

- `deployMaterialAdd`：新增物料记录。
- `deployMaterialEdit`：编辑物料。
- `deployMaterialUpload`：上传物料文件（multipart）。
- `deployMaterialSync`：同步物料。

### 项目部署 / 推包

- `deployProjectAzProjectAdd`：新增 AZ 部署项目。
- `deployProjectAzDeploy`：AZ 多云部署。
- `deployProjectRetryAzDeploy`：重试 AZ 部署。
- `deployProjectDeploy`：项目部署（生产环境）。
- `deployProjectRetryDeploy`：重试部署。
- `deployProjectPush` / `deployProjectFilePush` / `deployProjectPushGoon`：推包。

### 推送环境

- `deployPushenvAdd` / `deployPushenvEdit`：新增/编辑推送环境。
- `deployPushenvList` / `deployPushenvPage` / `deployPushenvDetail`：只读查询。

## 常见使用模式

### 上传物料并部署

```bash
alpha deployMaterialUpload --file ./chart.tgz --confirm true
alpha deployProjectPush --body '{"city":"hzcore","pkgName":"pkg-1.0.0.tar"}' --confirm true
alpha deployProjectPushGoon --body '{"pushId":"..."}' --confirm true
```

### 多云部署

```bash
alpha deployProjectAzProList --body '{"city":"hzcore"}'        # 查可用项目
alpha deployProjectAzUserList --body '{"city":"hzcore"}'       # 查可用用户
alpha deployProjectAzProjectAdd --body '{"projectId":42}' --confirm true
alpha deployProjectAzDeploy --body '{"deployId":1001}' --confirm true
```

### 回滚

```bash
alpha deployAppsRollback --body '{"appId":42,"historyId":99}' --confirm true
```

### 部署历史

```bash
alpha deployProjectDeployPage --body '{"projectId":42,"page":1,"count":20}'   # 分页查历史
alpha deployProjectDeployPageExpand --body '{"deployId":1001}'                # 展开详情
alpha deployAppsViewHistory --body '{"appId":42}'                              # 应用级历史
```
