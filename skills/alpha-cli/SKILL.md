# alpha-cli

当用户要查询或操作 Alpha 一站式开发者平台时使用本 skill。Alpha 页面地址通常是 `http://alpha.cloudglab.cn/`，CLI 调用后端接口。

## 使用原则

- 优先使用本项目 CLI：`alpha` 或开发态 `pnpm dev`。
- 默认只读查询；创建、编辑、删除、部署、回滚、封板、取消构建、授权等写操作必须先复述参数并等待用户确认。
- Alpha 前端页面的网关接口是 `/api/alpha/...`；当前 CLI 可直接使用后端地址 `http://alpha.cloudglab.cn:9000`。
- 不要把页面里的业务操作直接点击执行，除非用户明确要求并确认风险。
- 密码只通过环境变量临时传入，不要写入文档、日志或配置文件，除非用户明确要求保存。

## 常用环境变量

```bash
export ALPHA_URL="http://alpha.cloudglab.cn:9000"
export ALPHA_USERNAME="your-account"
export ALPHA_PASSWORD="your-password"
```

## 常用命令

```bash
alpha list
alpha userinfo
alpha ciBuildGetLatest
alpha ciBuildGetSelfBuild
alpha iterGetTree
alpha iterVersionList --body '{"page":1,"count":10}'
```

## 页面功能地图

- `Devops > 集成`：构建、项目、流水线、统配规则。
- `Devops > 迭代`：版本列表、产品/项目树、新建版本、查看/编辑、提测管理、封板、部署、hotfix 管理、删除。
- `Devops > 部署`：环境部署、应用列表、云端 app、集群管理、地方环境、物料列表。

## 场景链路

详细链路见 `reference/scenarios.md`。

优先用这些链路回答用户：

- 查构建看板：最新构建、我的构建、常用项目。
- 项目构建：查项目、查分支、触发构建、看构建详情和 Jenkins 输出。
- 迭代版本：查产品/项目树、查版本列表、新建版本、提测、封板。
- 版本部署：查版本详情、选集群、部署、查看部署历史。
- 应用运维：查应用、查 K8s 详情、生成日志/终端 URL、换镜像。
- 物料/文件：查物料、上传物料、查文件元数据、下载/预览文件。

## 高危操作

这些命令执行前必须二次确认：

- 部署/重试/回滚/卸载：`deployProjectDeploy`、`deployProjectRetryDeploy`、`deployAppsRollback`、`deployAppsUninstall`。
- 版本变更：`iterVersionAdd`、`iterVersionEdit`、`iterVersionDelete`、`iterVersionDisable`。
- 构建动作：`ciBuildManualProcess`、`ciBuildFreedomBuild`、`ciBuildParamsBuild`、`ciBuildCancel`。
- 配置和权限：`ciManageSetConfig`、`ciManageUpdateConfig`、`rbacRoleAssignRoles`、`rbacPrivilegeAssignPrivileges`。
