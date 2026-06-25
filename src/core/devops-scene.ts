export const DEVOPS_SCENE_GROUP = 'scene';
export const DEVOPS_SCENE_COMMAND = 'devopsScene';

export interface DevopsSceneResult {
  matchedServer: 'devops';
  routeKind: string;
  params: Record<string, string>;
  primaryCommand: string | null;
  suggestedCommands: string[];
  note: string;
}

interface SceneRule {
  pattern: RegExp;
  routeKind: string;
  primaryCommand: string | null;
  suggestedCommands: string[];
  note: string;
}

/**
 * 路由规则表，导出供表驱动测试遍历，保证每条 pattern 至少能匹配一个示例 URL。
 */
export const ROUTE_RULES: SceneRule[] = [
  {
    pattern: /^\/iteration\/?$/,
    routeKind: 'iteration.list',
    primaryCommand: 'iterVersionList',
    suggestedCommands: [
      'iterVersionList',
      'iterVersionAdd',
      'iterVersionEdit',
      'iterVersionTestVersionList',
      'iterHotfixList',
      'iterVersionDisable',
      'iterVersionDelete',
      'deployProjectDeploy',
    ],
    note: '版本列表页',
  },
  {
    pattern: /^\/iteration\/version\/detail\/(?<id>[^/?#]+)\/?$/,
    routeKind: 'iteration.version.detail',
    primaryCommand: 'iterVersionDetail',
    suggestedCommands: ['iterVersionDetail', 'iterVersionEdit', 'iterVersionDisable', 'iterVersionDelete', 'deployProjectDeploy'],
    note: '版本详情页',
  },
  {
    pattern: /^\/iteration\/create(?:\/(?<prodId>[^/?#]+))?(?:\/(?<projectId>[^/?#]+))?\/?$/,
    routeKind: 'iteration.version.create',
    primaryCommand: 'iterVersionAdd',
    suggestedCommands: ['iterVersionAdd', 'iterVersionEdit'],
    note: '新建版本页',
  },
  {
    pattern: /^\/iteration\/createBI(?:\/(?<prodId>[^/?#]+))?(?:\/(?<projectId>[^/?#]+))?\/?$/,
    routeKind: 'iteration.version.create.bi',
    primaryCommand: 'iterVersionAdd',
    suggestedCommands: ['iterVersionAdd', 'iterVersionEdit'],
    note: '新建 BI 版本页',
  },
  {
    pattern: /^\/iteration\/edit(?:\/(?<prodId>[^/?#]+))\/(?<projectId>[^/?#]+)\/(?<id>[^/?#]+)\/?$/,
    routeKind: 'iteration.version.edit',
    primaryCommand: 'iterVersionEdit',
    suggestedCommands: ['iterVersionEdit', 'iterVersionDetail'],
    note: '编辑版本页',
  },
  {
    pattern: /^\/iteration\/editBI(?:\/(?<prodId>[^/?#]+))\/(?<projectId>[^/?#]+)\/(?<id>[^/?#]+)\/?$/,
    routeKind: 'iteration.version.edit.bi',
    primaryCommand: 'iterVersionEdit',
    suggestedCommands: ['iterVersionEdit', 'iterVersionDetail'],
    note: '编辑 BI 版本页',
  },
  {
    pattern: /^\/iteration\/test\/(?<versionId>[^/?#]+)\/create\/?$/,
    routeKind: 'iteration.test.create',
    primaryCommand: 'iterVersionTestVersionSave',
    suggestedCommands: ['iterVersionTestVersionSave', 'iterVersionTestVersionSubmit', 'iterVersionTestVersionList'],
    note: '新建提测页',
  },
  {
    pattern: /^\/iteration\/test\/(?<versionId>[^/?#]+)\/edit\/(?<id>[^/?#]+)\/?$/,
    routeKind: 'iteration.test.edit',
    primaryCommand: 'iterVersionTestVersionSave',
    suggestedCommands: ['iterVersionTestVersionSave', 'iterVersionTestVersionSubmit', 'iterVersionTestVersionList'],
    note: '编辑提测页',
  },
  {
    pattern: /^\/iteration\/test\/(?<versionId>[^/?#]+)(?:\/(?<versionStatus>[^/?#]+))?\/?$/,
    routeKind: 'iteration.test.list',
    primaryCommand: 'iterVersionTestVersionList',
    suggestedCommands: ['iterVersionTestVersionList', 'iterVersionTestVersionSave', 'iterVersionTestVersionSubmit', 'ciInfoJenkinsOutput'],
    note: '提测版本记录页',
  },
  {
    pattern: /^\/iteration\/hotfix\/(?<versionId>[^/?#]+)\/list\/?$/,
    routeKind: 'iteration.hotfix.list',
    primaryCommand: 'iterHotfixList',
    suggestedCommands: ['iterHotfixList', 'iterHotfixSave', 'iterHotfixMerge'],
    note: 'Hotfix 列表页',
  },
  {
    pattern: /^\/iteration\/hotfix\/(?<versionId>[^/?#]+)\/create\/?$/,
    routeKind: 'iteration.hotfix.create',
    primaryCommand: 'iterHotfixSave',
    suggestedCommands: ['iterHotfixSave', 'iterHotfixMerge'],
    note: '新建 Hotfix 页',
  },
  {
    pattern: /^\/iteration\/hotfix\/(?<versionId>[^/?#]+)\/edit\/(?<id>[^/?#]+)\/?$/,
    routeKind: 'iteration.hotfix.edit',
    primaryCommand: 'iterHotfixSave',
    suggestedCommands: ['iterHotfixSave', 'iterHotfixMerge'],
    note: '编辑 Hotfix 页',
  },
  {
    pattern: /^\/arrange\/ambient\/?$/,
    routeKind: 'arrange.ambient.list',
    primaryCommand: 'deployProjectDeployPage',
    suggestedCommands: [
      'deployProjectDeployPage',
      'deployProjectDeployPageExpand',
      'deployProjectPushPage',
      'deployProjectPushPageExpand',
      'deployProjectDeploy',
      'deployProjectRetryDeploy',
      'deployProjectPushGoon',
    ],
    note: '环境部署总览页',
  },
  {
    pattern: /^\/arrange\/ambient\/create\/?$/,
    routeKind: 'arrange.ambient.create',
    primaryCommand: null,
    suggestedCommands: ['deployProjectDeploy', 'deployProjectAzDeploy', 'deployProjectPush', 'deployProjectFilePush'],
    note: '部署创建页，提交命令取决于环境与表单模式',
  },
  {
    pattern: /^\/arrange\/chart\/?$/,
    routeKind: 'arrange.chart.list',
    primaryCommand: null,
    suggestedCommands: ['deployAppsPage', 'deployAppsInstall'],
    note: '应用列表页，点击部署后进入安装表单',
  },
  {
    pattern: /^\/arrange\/chartArrange\/(?<id>[^/?#]+)\/?$/,
    routeKind: 'arrange.chart.detail',
    primaryCommand: 'deployAppsInstall',
    suggestedCommands: ['deployAppsInstall', 'deployClusterList'],
    note: 'chart 部署表单页',
  },
  {
    pattern: /^\/arrange\/cloudapp\/?$/,
    routeKind: 'arrange.cloudapp.list',
    primaryCommand: 'deployAppsPage',
    suggestedCommands: [
      'deployAppsPage',
      'deployAppsUpgrade',
      'deployAppsUninstall',
      'deployAppsViewHistory',
      'deployAppsViewK8s',
      'deployAppsDetailK8s',
    ],
    note: '云端应用页',
  },
  {
    pattern: /^\/arrange\/cloudapp\/cloudAppDetail\/?$/,
    routeKind: 'arrange.cloudapp.detail',
    primaryCommand: 'deployAppsViewK8s',
    suggestedCommands: [
      'deployAppsViewK8s',
      'deployAppsDetailK8s',
      'deployAppsViewHistory',
      'deployAppsRollback',
      'deployAppsImageVersion',
    ],
    note: '云端应用详情页',
  },
  {
    pattern: /^\/arrange\/cluster\/list\/?$/,
    routeKind: 'arrange.cluster.list',
    primaryCommand: 'deployClusterList',
    suggestedCommands: ['deployClusterList', 'deployClusterAdd', 'deployClusterEdit', 'deployClusterDetail'],
    note: '集群列表页',
  },
  {
    pattern: /^\/arrange\/local\/list\/?$/,
    routeKind: 'arrange.local.list',
    primaryCommand: 'deployPushenvList',
    suggestedCommands: ['deployPushenvList', 'deployPushenvAdd', 'deployPushenvEdit', 'deployPushenvDetail'],
    note: '地方环境列表页',
  },
  {
    pattern: /^\/arrange\/material\/list\/?$/,
    routeKind: 'arrange.material.list',
    primaryCommand: 'deployMaterialPage',
    suggestedCommands: ['deployMaterialPage', 'deployMaterialAdd', 'deployMaterialEdit', 'deployMaterialUpload', 'deployMaterialDetail'],
    note: '物料列表页',
  },
  {
    pattern: /^\/integration\/waterLine\/list\/?$/,
    routeKind: 'integration.waterLine.list',
    primaryCommand: 'ciManageGetPipelines',
    suggestedCommands: ['ciManageGetPipelines'],
    note: '流水线列表页，当前以前端只读展示为主',
  },
  {
    pattern: /^\/integration\/unificationRule\/list\/?$/,
    routeKind: 'integration.unificationRule.list',
    primaryCommand: 'ciManageGetTemplateList',
    suggestedCommands: ['ciManageGetTemplateList'],
    note: '统一规则列表页，当前以前端只读展示为主',
  },
  {
    pattern: /^\/integration\/helmConfig\/list\/?$/,
    routeKind: 'integration.helmConfig.list',
    primaryCommand: null,
    suggestedCommands: [],
    note: '未识别到稳定直连命令，建议先看页面按钮和表单',
  },
  {
    pattern: /^\/integration\/build\/repo\/?$/,
    routeKind: 'integration.build.repo',
    primaryCommand: 'ciBuildList',
    suggestedCommands: ['ciBuildList', 'ciBuildManualProcess', 'ciBuildFreedomBuild', 'ciBuildParamsBuild'],
    note: '构建首页',
  },
  {
    pattern: /^\/integration\/build\/list\/(?<repoId>[^/?#]+)\/?$/,
    routeKind: 'integration.build.list',
    primaryCommand: 'ciBuildList',
    suggestedCommands: [
      'ciBuildList',
      'ciBuildManualProcess',
      'ciBuildFreedomBuild',
      'ciBuildParamsBuild',
      'ciBuildCancel',
      'ciAppSync',
      'iterVersionTestVersionSave',
      'deployAppsInstall',
      'deployAppsAzDeploy',
      'ciInfoChangeInfo',
      'ciInfoGetRelCommit',
      'ciRepoConfigDetail',
    ],
    note: '构建列表页',
  },
  {
    pattern: /^\/integration\/build\/detail\/(?<repoId>[^/?#]+)\/?$/,
    routeKind: 'integration.build.detail',
    primaryCommand: 'ciBuildDetail',
    suggestedCommands: ['ciBuildDetail', 'ciBuildCancel', 'ciInfoJenkinsOutput', 'ciInfoChangeInfo', 'ciInfoGetRelCommit'],
    note: '构建详情页',
  },
  {
    pattern: /^\/integration\/build\/repoConfig\/(?<repoId>[^/?#]+)\/?$/,
    routeKind: 'integration.build.repoConfig',
    primaryCommand: 'ciRepoConfigDetail',
    suggestedCommands: [
      'ciRepoConfigDetail',
      'ciManageGetPipelines',
      'ciManageSetConfig',
      'ciManageUpdateConfig',
      'ciManageClearCache',
      'ciManageResetVersion',
    ],
    note: '项目配置流程页',
  },
  {
    pattern: /^\/integration\/repo\/list\/?$/,
    routeKind: 'integration.repo.list',
    primaryCommand: 'ciRepoList',
    suggestedCommands: ['ciRepoList', 'ciRepoAdd', 'ciBranchList', 'ciRepoConfigDetail'],
    note: '项目列表页',
  },
  {
    pattern: /^\/integration\/repo\/detail\/(?<repoId>[^/?#]+)\/?$/,
    routeKind: 'integration.repo.detail',
    primaryCommand: 'ciRepoConfigDetail',
    suggestedCommands: ['ciRepoConfigDetail', 'ciRepoInfo', 'ciBranchList', 'ciManageClearCache', 'ciManageResetVersion'],
    note: '项目详情页',
  },
];

interface ActionRule {
  routeKinds: string[];
  keywords: string[];
  routeKind: string;
  primaryCommand: string | null;
  suggestedCommands: string[];
  note: string;
}

const ACTION_RULES: ActionRule[] = [
  {
    routeKinds: ['arrange.ambient.list'],
    keywords: ['新建部署'],
    routeKind: 'arrange.ambient.list.create',
    primaryCommand: null,
    suggestedCommands: ['deployProjectDeploy', 'deployProjectAzDeploy', 'deployProjectPush', 'deployProjectFilePush'],
    note: '环境部署页的新建部署入口仍需结合目标环境与表单模式',
  },
  {
    routeKinds: ['arrange.ambient.list'],
    keywords: ['继续推包'],
    routeKind: 'arrange.ambient.list.push-goon',
    primaryCommand: 'deployProjectPushGoon',
    suggestedCommands: ['deployProjectPushGoon', 'deployProjectPushPageExpand'],
    note: '生产推包失败后的继续推包',
  },
  {
    routeKinds: ['arrange.ambient.list'],
    keywords: ['重试'],
    routeKind: 'arrange.ambient.list.retry',
    primaryCommand: null,
    suggestedCommands: ['deployProjectRetryDeploy', 'deployProjectPushGoon'],
    note: '重试动作会因部署环境不同落到不同接口',
  },
  {
    routeKinds: ['arrange.ambient.list'],
    keywords: ['详情'],
    routeKind: 'arrange.ambient.list.detail',
    primaryCommand: null,
    suggestedCommands: ['deployProjectDeployPageExpand', 'deployProjectPushPageExpand'],
    note: '详情抽屉展示失败详情，接口会因部署环境不同而变化',
  },
  {
    routeKinds: ['arrange.ambient.create'],
    keywords: ['部署', '确定', '提交'],
    routeKind: 'arrange.ambient.create.submit',
    primaryCommand: null,
    suggestedCommands: ['deployProjectDeploy', 'deployProjectAzDeploy', 'deployProjectPush', 'deployProjectFilePush'],
    note: '提交动作依赖开发/测试/生产及迭代方式/文件方式，需补齐具体 body 后执行',
  },
  {
    routeKinds: ['arrange.ambient.create'],
    keywords: ['推包'],
    routeKind: 'arrange.ambient.create.push',
    primaryCommand: null,
    suggestedCommands: ['deployProjectPush', 'deployProjectFilePush'],
    note: '推包页支持迭代方式与文件方式两条链路',
  },
  {
    routeKinds: ['arrange.chart.list'],
    keywords: ['部署'],
    routeKind: 'arrange.chart.list.deploy',
    primaryCommand: 'deployAppsInstall',
    suggestedCommands: ['deployAppsInstall', 'deployAppsPage'],
    note: '应用列表页的部署按钮会进入安装表单',
  },
  {
    routeKinds: ['arrange.chart.detail'],
    keywords: ['确定', '部署'],
    routeKind: 'arrange.chart.detail.submit',
    primaryCommand: 'deployAppsInstall',
    suggestedCommands: ['deployAppsInstall'],
    note: 'chart 部署表单提交',
  },
  {
    routeKinds: ['arrange.cloudapp.list'],
    keywords: ['升级'],
    routeKind: 'arrange.cloudapp.list.upgrade',
    primaryCommand: 'deployAppsUpgrade',
    suggestedCommands: ['deployAppsUpgrade', 'deployAppsPage'],
    note: '云端应用卡片的升级按钮',
  },
  {
    routeKinds: ['arrange.cloudapp.list'],
    keywords: ['卸载'],
    routeKind: 'arrange.cloudapp.list.uninstall',
    primaryCommand: 'deployAppsUninstall',
    suggestedCommands: ['deployAppsUninstall', 'deployAppsPage'],
    note: '云端应用卡片的卸载按钮',
  },
  {
    routeKinds: ['arrange.cloudapp.list'],
    keywords: ['最近部署列表', '刷新最近部署'],
    routeKind: 'arrange.cloudapp.list.recent',
    primaryCommand: 'deployAppsViewHistory',
    suggestedCommands: ['deployAppsViewHistory', 'deployAppsPage'],
    note: '最近部署列表会刷新最近部署记录',
  },
  {
    routeKinds: ['arrange.cloudapp.detail'],
    keywords: ['部署历史'],
    routeKind: 'arrange.cloudapp.detail.history',
    primaryCommand: 'deployAppsViewHistory',
    suggestedCommands: ['deployAppsViewHistory', 'deployAppsRollback'],
    note: '云端应用详情页的部署历史',
  },
  {
    routeKinds: ['arrange.cloudapp.detail'],
    keywords: ['回滚到当前版本', '回滚'],
    routeKind: 'arrange.cloudapp.detail.rollback',
    primaryCommand: 'deployAppsRollback',
    suggestedCommands: ['deployAppsRollback', 'deployAppsViewHistory'],
    note: '云端应用历史版本回滚',
  },
  {
    routeKinds: ['arrange.cloudapp.detail'],
    keywords: ['调整镜像版本', '修改镜像版本', '镜像版本'],
    routeKind: 'arrange.cloudapp.detail.image-version',
    primaryCommand: 'deployAppsImageVersion',
    suggestedCommands: ['deployAppsImageVersion', 'deployAppsDetailK8s'],
    note: '云端应用详情页的镜像版本调整',
  },
  {
    routeKinds: ['arrange.cloudapp.detail'],
    keywords: ['追踪日志', '查看日志'],
    routeKind: 'arrange.cloudapp.detail.log',
    primaryCommand: null,
    suggestedCommands: ['deployAppsDetailK8s'],
    note: '日志入口会换取外部 URL 后跳转，当前 CLI 无稳定直连命令',
  },
  {
    routeKinds: ['arrange.cloudapp.detail'],
    keywords: ['bash'],
    routeKind: 'arrange.cloudapp.detail.bash',
    primaryCommand: null,
    suggestedCommands: ['deployAppsDetailK8s'],
    note: 'bash 入口会换取外部 URL 后跳转，当前 CLI 无稳定直连命令',
  },
  {
    routeKinds: ['arrange.cloudapp.detail'],
    keywords: ['app 列表', 'k8s APP 列表', 'pod 副本列表', '容器组列表'],
    routeKind: 'arrange.cloudapp.detail.k8s',
    primaryCommand: 'deployAppsDetailK8s',
    suggestedCommands: ['deployAppsViewK8s', 'deployAppsDetailK8s'],
    note: '云端应用详情页的 K8s 视图浏览',
  },
  {
    routeKinds: ['integration.build.repoConfig'],
    keywords: ['导入流水线模板', '重新导入流水线模板', '选择流水线'],
    routeKind: 'integration.build.repoConfig.pipeline-template',
    primaryCommand: 'ciManageGetPipelines',
    suggestedCommands: ['ciManageGetPipelines', 'ciManageSetConfig', 'ciManageUpdateConfig'],
    note: '项目配置流程页会先加载流水线模板供选择',
  },
  {
    routeKinds: ['integration.build.repoConfig'],
    keywords: ['保存配置', '配置', '清空'],
    routeKind: 'integration.build.repoConfig.save',
    primaryCommand: 'ciManageUpdateConfig',
    suggestedCommands: ['ciManageUpdateConfig', 'ciManageSetConfig', 'ciManageGetPipelines'],
    note: '项目配置流程页的保存/清空最终都会落到配置更新接口',
  },
  {
    routeKinds: ['integration.repo.detail'],
    keywords: ['查看分支', '分支列表'],
    routeKind: 'integration.repo.detail.branches',
    primaryCommand: 'ciBranchList',
    suggestedCommands: ['ciBranchList', 'ciRepoConfigDetail'],
    note: '项目详情页的分支列表',
  },
  {
    routeKinds: ['integration.waterLine.list'],
    keywords: ['查看流水线', '选择流水线', '流水线'],
    routeKind: 'integration.waterLine.list.inspect',
    primaryCommand: 'ciManageGetPipelines',
    suggestedCommands: ['ciManageGetPipelines'],
    note: '流水线列表页当前以只读查看为主',
  },
  {
    routeKinds: ['integration.unificationRule.list'],
    keywords: ['查看规则', '通配规则', '规则'],
    routeKind: 'integration.unificationRule.list.inspect',
    primaryCommand: 'ciManageGetTemplateList',
    suggestedCommands: ['ciManageGetTemplateList'],
    note: '统一规则列表页当前以只读查看为主',
  },
  {
    routeKinds: ['integration.build.list', 'integration.build.repo'],
    keywords: ['手动构建', '手动触发'],
    routeKind: 'integration.build.list.manual',
    primaryCommand: 'ciBuildManualProcess',
    suggestedCommands: ['ciBuildManualProcess', 'ciBuildList', 'ciBuildCancel'],
    note: '构建列表页的手动构建按钮',
  },
  {
    routeKinds: ['integration.build.list', 'integration.build.repo'],
    keywords: ['自由构建'],
    routeKind: 'integration.build.list.freedom',
    primaryCommand: 'ciBuildFreedomBuild',
    suggestedCommands: ['ciBuildFreedomBuild', 'ciBuildFreedomTags', 'ciBuildList'],
    note: '构建列表页的自由构建按钮',
  },
  {
    routeKinds: ['integration.build.list', 'integration.build.repo'],
    keywords: ['参数化构建'],
    routeKind: 'integration.build.list.params',
    primaryCommand: 'ciBuildParamsBuild',
    suggestedCommands: ['ciBuildParamsBuild', 'ciBuildList', 'ciBuildCancel'],
    note: '构建列表页的参数化构建按钮',
  },
  {
    routeKinds: ['integration.build.list', 'integration.build.detail'],
    keywords: ['中止构建', '取消构建'],
    routeKind: 'integration.build.cancel',
    primaryCommand: 'ciBuildCancel',
    suggestedCommands: ['ciBuildCancel', 'ciBuildDetail'],
    note: '构建页的中止构建按钮',
  },
  {
    routeKinds: ['integration.build.list'],
    keywords: ['同步test', '同步 test', '同步测试'],
    routeKind: 'integration.build.list.sync-test',
    primaryCommand: 'ciAppSync',
    suggestedCommands: ['ciAppSync', 'ciBuildList'],
    note: '构建列表页的同步 test 按钮',
  },
  {
    routeKinds: ['integration.build.list'],
    keywords: ['提测'],
    routeKind: 'integration.build.list.submit-test',
    primaryCommand: 'iterVersionTestVersionSave',
    suggestedCommands: ['iterVersionTestVersionSave', 'iterVersionTestVersionSubmit'],
    note: '构建列表页的提测按钮',
  },
  {
    routeKinds: ['integration.build.list'],
    keywords: ['Helm部署', 'Helm 部署', 'helm部署'],
    routeKind: 'integration.build.list.deploy.helm',
    primaryCommand: 'deployAppsInstall',
    suggestedCommands: ['deployAppsInstall', 'deployAppsPage'],
    note: '构建列表页的 Helm 部署按钮',
  },
  {
    routeKinds: ['integration.build.list'],
    keywords: ['AZ部署', 'AZ 部署'],
    routeKind: 'integration.build.list.deploy.az',
    primaryCommand: 'deployAppsAzDeploy',
    suggestedCommands: ['deployAppsAzDeploy', 'deployAppsPage'],
    note: '构建列表页的 AZ 部署按钮',
  },
  {
    routeKinds: ['integration.build.list', 'integration.build.detail'],
    keywords: ['查看commit', 'Commit详情', 'commit详情', '查看 commit'],
    routeKind: 'integration.build.commit.detail',
    primaryCommand: 'ciInfoChangeInfo',
    suggestedCommands: ['ciInfoChangeInfo', 'ciInfoGetRelCommit', 'ciBuildDetail'],
    note: '构建页的 commit 详情',
  },
  {
    routeKinds: ['integration.build.list', 'integration.build.detail'],
    keywords: ['刷新commit', '刷新解析', '刷新commit解析', '重新解析commit'],
    routeKind: 'integration.build.commit.refresh',
    primaryCommand: 'ciInfoGetRelCommit',
    suggestedCommands: ['ciInfoGetRelCommit', 'ciInfoChangeInfo'],
    note: '构建页的 commit 解析刷新',
  },
  {
    routeKinds: ['integration.build.list'],
    keywords: ['项目配置流程'],
    routeKind: 'integration.build.repoConfig',
    primaryCommand: 'ciRepoConfigDetail',
    suggestedCommands: ['ciRepoConfigDetail', 'ciManageClearCache', 'ciManageResetVersion'],
    note: '构建列表页的项目配置流程按钮',
  },
  {
    routeKinds: ['integration.build.list'],
    keywords: ['查看构建详情', '构建详情'],
    routeKind: 'integration.build.list.detail',
    primaryCommand: 'ciBuildDetail',
    suggestedCommands: ['ciBuildDetail', 'ciInfoJenkinsOutput', 'ciBuildCancel'],
    note: '构建列表页的查看构建详情',
  },
  {
    routeKinds: ['integration.build.detail'],
    keywords: ['查看日志', '看日志', '日志'],
    routeKind: 'integration.build.detail.log',
    primaryCommand: 'ciInfoJenkinsOutput',
    suggestedCommands: ['ciInfoJenkinsOutput', 'ciBuildDetail'],
    note: '构建详情页的日志查看',
  },
  {
    routeKinds: ['integration.build.repoConfig'],
    keywords: ['清除分支缓存', '清缓存'],
    routeKind: 'integration.build.repoConfig.clear-cache',
    primaryCommand: 'ciManageClearCache',
    suggestedCommands: ['ciManageClearCache', 'ciManageResetVersion'],
    note: '项目配置流程页的清除分支缓存',
  },
  {
    routeKinds: ['integration.build.repoConfig'],
    keywords: ['重置构建版本号', '重置版本号'],
    routeKind: 'integration.build.repoConfig.reset-version',
    primaryCommand: 'ciManageResetVersion',
    suggestedCommands: ['ciManageResetVersion', 'ciManageClearCache'],
    note: '项目配置流程页的重置构建版本号',
  },
  {
    routeKinds: ['integration.repo.list'],
    keywords: ['新增项目', '新增'],
    routeKind: 'integration.repo.list.add',
    primaryCommand: 'ciRepoAdd',
    suggestedCommands: ['ciRepoAdd', 'ciRepoList'],
    note: '项目列表页的新增项目',
  },
  {
    routeKinds: ['integration.repo.list'],
    keywords: ['查看分支', '分支数量'],
    routeKind: 'integration.repo.list.branches',
    primaryCommand: 'ciBranchList',
    suggestedCommands: ['ciBranchList', 'ciRepoList'],
    note: '项目列表页的查看分支',
  },
  {
    routeKinds: ['integration.repo.detail'],
    keywords: ['CI预览', 'CI 预览'],
    routeKind: 'integration.repo.detail.preview',
    primaryCommand: null,
    suggestedCommands: ['ciRepoConfigDetail', 'ciRepoInfo'],
    note: 'CI 预览只是前端展示，没有稳定直连命令',
  },
  {
    routeKinds: ['arrange.cluster.list'],
    keywords: ['新建集群', '新增集群'],
    routeKind: 'arrange.cluster.list.add',
    primaryCommand: 'deployClusterAdd',
    suggestedCommands: ['deployClusterAdd', 'deployClusterEdit', 'deployClusterDetail'],
    note: '集群列表页的新建集群',
  },
  {
    routeKinds: ['arrange.cluster.list'],
    keywords: ['编辑集群', '修改集群'],
    routeKind: 'arrange.cluster.list.edit',
    primaryCommand: 'deployClusterEdit',
    suggestedCommands: ['deployClusterEdit', 'deployClusterDetail'],
    note: '集群列表页的编辑集群',
  },
  {
    routeKinds: ['arrange.cluster.list'],
    keywords: ['集群详情', '查看集群'],
    routeKind: 'arrange.cluster.list.detail',
    primaryCommand: 'deployClusterDetail',
    suggestedCommands: ['deployClusterDetail', 'deployClusterList'],
    note: '集群列表页的查看详情',
  },
  {
    routeKinds: ['arrange.local.list'],
    keywords: ['新建地方环境', '新增地方环境'],
    routeKind: 'arrange.local.list.add',
    primaryCommand: 'deployPushenvAdd',
    suggestedCommands: ['deployPushenvAdd', 'deployPushenvEdit', 'deployPushenvDetail'],
    note: '地方环境列表页的新建地方环境',
  },
  {
    routeKinds: ['arrange.local.list'],
    keywords: ['编辑地方环境', '修改地方环境'],
    routeKind: 'arrange.local.list.edit',
    primaryCommand: 'deployPushenvEdit',
    suggestedCommands: ['deployPushenvEdit', 'deployPushenvDetail'],
    note: '地方环境列表页的编辑地方环境',
  },
  {
    routeKinds: ['arrange.local.list'],
    keywords: ['地方环境详情', '查看地方环境'],
    routeKind: 'arrange.local.list.detail',
    primaryCommand: 'deployPushenvDetail',
    suggestedCommands: ['deployPushenvDetail', 'deployPushenvList'],
    note: '地方环境列表页的查看详情',
  },
  {
    routeKinds: ['arrange.material.list'],
    keywords: ['新建物料', '新增物料'],
    routeKind: 'arrange.material.list.add',
    primaryCommand: 'deployMaterialAdd',
    suggestedCommands: ['deployMaterialAdd', 'deployMaterialEdit', 'deployMaterialUpload', 'deployMaterialDetail'],
    note: '物料列表页的新建物料',
  },
  {
    routeKinds: ['arrange.material.list'],
    keywords: ['编辑物料', '修改物料'],
    routeKind: 'arrange.material.list.edit',
    primaryCommand: 'deployMaterialEdit',
    suggestedCommands: ['deployMaterialEdit', 'deployMaterialUpload', 'deployMaterialDetail'],
    note: '物料列表页的编辑物料',
  },
  {
    routeKinds: ['arrange.material.list'],
    keywords: ['上传文件', '上传物料'],
    routeKind: 'arrange.material.list.upload',
    primaryCommand: 'deployMaterialUpload',
    suggestedCommands: ['deployMaterialUpload', 'deployMaterialAdd', 'deployMaterialEdit'],
    note: '物料列表页的上传文件',
  },
  {
    routeKinds: ['arrange.material.list'],
    keywords: ['物料详情', '查看物料', '预览物料'],
    routeKind: 'arrange.material.list.detail',
    primaryCommand: 'deployMaterialDetail',
    suggestedCommands: ['deployMaterialDetail', 'deployMaterialPage'],
    note: '物料列表页的查看详情',
  },
  {
    routeKinds: ['iteration.list'],
    keywords: ['新建版本', '新增版本'],
    routeKind: 'iteration.list.create',
    primaryCommand: 'iterVersionAdd',
    suggestedCommands: ['iterVersionAdd', 'iterVersionDetail', 'iterVersionEdit'],
    note: '版本列表页的新建版本',
  },
  {
    routeKinds: ['iteration.list'],
    keywords: ['新建BI版本', '新建 BI 版本', '新增BI版本'],
    routeKind: 'iteration.list.create.bi',
    primaryCommand: 'iterVersionAdd',
    suggestedCommands: ['iterVersionAdd', 'iterVersionEdit'],
    note: '版本列表页的新建BI版本',
  },
  {
    routeKinds: ['iteration.list'],
    keywords: ['查看', '查看详情', '详情'],
    routeKind: 'iteration.list.detail',
    primaryCommand: 'iterVersionDetail',
    suggestedCommands: ['iterVersionDetail', 'iterVersionEdit', 'iterVersionDisable', 'iterVersionDelete'],
    note: '版本列表页的查看详情',
  },
  {
    routeKinds: ['iteration.list'],
    keywords: ['编辑BI版本', '编辑 BI 版本'],
    routeKind: 'iteration.list.edit.bi',
    primaryCommand: 'iterVersionEdit',
    suggestedCommands: ['iterVersionEdit', 'iterVersionDetail'],
    note: '版本列表页的编辑BI版本',
  },
  {
    routeKinds: ['iteration.list'],
    keywords: ['编辑版本', '编辑'],
    routeKind: 'iteration.list.edit',
    primaryCommand: 'iterVersionEdit',
    suggestedCommands: ['iterVersionEdit', 'iterVersionEditBI', 'iterVersionDetail'],
    note: '版本列表页的编辑版本',
  },
  {
    routeKinds: ['iteration.list'],
    keywords: ['提测管理'],
    routeKind: 'iteration.list.test',
    primaryCommand: 'iterVersionTestVersionList',
    suggestedCommands: ['iterVersionTestVersionList', 'iterVersionTestVersionSave', 'iterVersionTestVersionSubmit'],
    note: '版本列表页的提测管理',
  },
  {
    routeKinds: ['iteration.list'],
    keywords: ['hotfix管理', 'Hotfix管理'],
    routeKind: 'iteration.list.hotfix',
    primaryCommand: 'iterHotfixList',
    suggestedCommands: ['iterHotfixList', 'iterHotfixSave', 'iterHotfixMerge'],
    note: '版本列表页的 hotfix 管理',
  },
  {
    routeKinds: ['iteration.list'],
    keywords: ['封板'],
    routeKind: 'iteration.list.disable',
    primaryCommand: 'iterVersionDisable',
    suggestedCommands: ['iterVersionDisable', 'iterVersionDelete'],
    note: '版本列表页的封板',
  },
  {
    routeKinds: ['iteration.list'],
    keywords: ['删除'],
    routeKind: 'iteration.list.delete',
    primaryCommand: 'iterVersionDelete',
    suggestedCommands: ['iterVersionDelete', 'iterVersionDetail'],
    note: '版本列表页的删除',
  },
  {
    routeKinds: ['iteration.list'],
    keywords: ['部署'],
    routeKind: 'iteration.list.deploy',
    primaryCommand: 'deployProjectDeploy',
    suggestedCommands: ['deployProjectDeploy', 'deployProjectDeployPage'],
    note: '版本列表页的部署入口',
  },
  {
    routeKinds: ['iteration.version.detail'],
    keywords: ['配置信息', '部署配置', '物料列表'],
    routeKind: 'iteration.version.detail.tab',
    primaryCommand: 'iterVersionDetail',
    suggestedCommands: ['iterVersionDetail'],
    note: '版本详情页的只读 tab 切换',
  },
  {
    routeKinds: ['iteration.test.list'],
    keywords: ['新建提测页面', '新建提测', '新增提测'],
    routeKind: 'iteration.test.list.create',
    primaryCommand: 'iterVersionTestVersionSave',
    suggestedCommands: ['iterVersionTestVersionSave', 'iterVersionTestVersionSubmit'],
    note: '提测记录页的新建提测入口',
  },
  {
    routeKinds: ['iteration.test.list', 'iteration.test.edit'],
    keywords: ['修改提测内容', '编辑提测', '修改提测'],
    routeKind: 'iteration.test.detail.edit',
    primaryCommand: 'iterVersionTestVersionSave',
    suggestedCommands: ['iterVersionTestVersionSave', 'iterVersionTestVersionSubmit'],
    note: '提测详情页的修改提测内容',
  },
  {
    routeKinds: ['iteration.test.list', 'iteration.test.edit'],
    keywords: ['提交提测', '提测成功'],
    routeKind: 'iteration.test.detail.submit',
    primaryCommand: 'iterVersionTestVersionSubmit',
    suggestedCommands: ['iterVersionTestVersionSubmit', 'iterVersionTestVersionSave'],
    note: '提测详情页的提交提测',
  },
  {
    routeKinds: ['iteration.test.list', 'iteration.test.edit'],
    keywords: ['查看pkg chart日志', '查看日志', '日志'],
    routeKind: 'iteration.test.detail.log',
    primaryCommand: null,
    suggestedCommands: ['ciInfoJenkinsOutput'],
    note: '提测详情页的日志查看是外跳或展示，不是稳定直连命令',
  },
  {
    routeKinds: ['iteration.hotfix.list'],
    keywords: ['新建hotfix', '新建 Hotfix', '新增hotfix'],
    routeKind: 'iteration.hotfix.list.create',
    primaryCommand: 'iterHotfixSave',
    suggestedCommands: ['iterHotfixSave', 'iterHotfixList', 'iterHotfixMerge'],
    note: 'Hotfix 列表页的新建 hotfix',
  },
  {
    routeKinds: ['iteration.hotfix.list', 'iteration.hotfix.edit'],
    keywords: ['修改hotfix', '编辑hotfix', '修改 Hotfix'],
    routeKind: 'iteration.hotfix.detail.edit',
    primaryCommand: 'iterHotfixSave',
    suggestedCommands: ['iterHotfixSave', 'iterHotfixList'],
    note: 'Hotfix 详情页的修改 hotfix',
  },
  {
    routeKinds: ['iteration.hotfix.list', 'iteration.hotfix.edit'],
    keywords: ['合并'],
    routeKind: 'iteration.hotfix.detail.merge',
    primaryCommand: 'iterHotfixMerge',
    suggestedCommands: ['iterHotfixMerge', 'iterHotfixSave'],
    note: 'Hotfix 详情页的合并',
  },
  {
    routeKinds: ['iteration.hotfix.list', 'iteration.hotfix.edit'],
    keywords: ['驳回'],
    routeKind: 'iteration.hotfix.detail.reject',
    primaryCommand: 'iterHotfixMerge',
    suggestedCommands: ['iterHotfixMerge', 'iterHotfixSave'],
    note: 'Hotfix 详情页的驳回',
  },
];

const DEVOPS_ROUTE_PREFIXES = ['/iteration', '/arrange', '/integration', 'iteration/', 'arrange/', 'integration/'];

export interface NormalizedImplicitSceneInvocation {
  commandName: string;
  commandArgs: string[];
}

export function normalizeImplicitSceneInvocation(
  commandName: string | undefined,
  commandArgs: string[],
): NormalizedImplicitSceneInvocation | null {
  if (commandArgs.some((arg) => arg.startsWith('-'))) {
    return null;
  }

  const rawInput = [commandName, ...commandArgs].filter(Boolean).join(' ');

  if (!commandName || !looksLikeDevopsSceneInput(rawInput)) {
    return null;
  }

  return {
    commandName: DEVOPS_SCENE_COMMAND,
    commandArgs: ['--input', rawInput],
  };
}

export function looksLikeDevopsSceneInput(rawInput: string): boolean {
  const target = extractSceneTarget(rawInput)?.targetText;
  if (!target) return false;

  const parsedUrl = tryParseUrl(target);
  if (parsedUrl) {
    const pathname = stripDevopsBasePath(parsedUrl.pathname);
    return DEVOPS_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix.startsWith('/') ? prefix : `/${prefix}`));
  }

  const normalized = target.trim();
  if (DEVOPS_ROUTE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  return (
    normalized.startsWith('/main/devops/') ||
    normalized.startsWith('/micro/devops/') ||
    normalized.startsWith('main/devops/') ||
    normalized.startsWith('micro/devops/')
  );
}

export function parseDevopsScene(rawInput: string): DevopsSceneResult {
  const sceneInput = normalizeSceneInput(rawInput);
  const matchedRule = ROUTE_RULES.find((rule) => rule.pattern.test(sceneInput.pathname));

  if (!matchedRule) {
    return {
      matchedServer: 'devops',
      routeKind: 'unknown',
      params: sceneInput.params,
      primaryCommand: null,
      suggestedCommands: [],
      note: '未识别到已知 devops 路由，先核对页面路径后再选命令。',
    };
  }

  const pathMatch = sceneInput.pathname.match(matchedRule.pattern);
  const routeParams = extractRouteParams(pathMatch);
  const actionOverlay = resolveActionOverlay(matchedRule.routeKind, sceneInput.contextText);

  if (actionOverlay) {
    return {
      matchedServer: 'devops',
      routeKind: actionOverlay.routeKind,
      params: { ...routeParams, ...sceneInput.params },
      primaryCommand: actionOverlay.primaryCommand,
      suggestedCommands: actionOverlay.suggestedCommands,
      note: actionOverlay.note,
    };
  }

  return {
    matchedServer: 'devops',
    routeKind: matchedRule.routeKind,
    params: { ...routeParams, ...sceneInput.params },
    primaryCommand: matchedRule.primaryCommand,
    suggestedCommands: matchedRule.suggestedCommands,
    note: matchedRule.note,
  };
}

function normalizeSceneInput(rawInput: string): {
  pathname: string;
  params: Record<string, string>;
  contextText: string;
} {
  const extracted = extractSceneTarget(rawInput);
  const trimmed = rawInput.trim();
  const sceneTarget = extracted?.targetText ?? trimmed;
  const contextText = extracted?.contextText ?? '';
  const parsedUrl = tryParseUrl(sceneTarget);

  if (parsedUrl) {
    return {
      pathname: stripDevopsBasePath(parsedUrl.pathname),
      params: collectParams(parsedUrl.searchParams),
      contextText,
    };
  }

  const [rawPath, rawSearch = ''] = sceneTarget.split('?');
  const pathname = stripDevopsBasePath(rawPath.startsWith('/') ? rawPath : `/${rawPath}`);
  const params = rawSearch ? collectParams(new URLSearchParams(rawSearch)) : {};

  return { pathname, params, contextText };
}

function resolveActionOverlay(routeKind: string, contextText: string): ActionRule | null {
  const normalizedContext = contextText.trim();
  if (!normalizedContext) return null;

  return (
    ACTION_RULES.find((rule) => {
      if (!rule.routeKinds.some((kind) => routeKind === kind || routeKind.startsWith(`${kind}.`))) {
        return false;
      }

      return rule.keywords.some((keyword) => normalizedContext.includes(keyword));
    }) ?? null
  );
}

function extractSceneTarget(rawInput: string): { targetText: string; contextText: string } | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const targetMatch = trimmed.match(
    /(https?:\/\/[^\s]+|www\.[^\s]+|\/(?:main\/devops|micro\/devops|devops|iteration|arrange|integration)(?:\/[^\s]*)?|(?:main\/devops|micro\/devops|devops|iteration|arrange|integration)\/[^\s]*)/i,
  );

  if (!targetMatch) return null;

  const targetText = targetMatch[0].replace(/[),.，。;；]+$/, '');
  const contextText = trimmed.replace(targetMatch[0], ' ').replace(/\s+/g, ' ').trim();

  return {
    targetText,
    contextText,
  };
}

function tryParseUrl(value: string): URL | null {
  try {
    if (/^https?:\/\//i.test(value) || /^www\./i.test(value)) {
      return new URL(value.startsWith('http') ? value : `https://${value}`);
    }
  } catch {
    return null;
  }

  return null;
}

function stripDevopsBasePath(pathname: string): string {
  const normalized = pathname
    .replace(/^\/+(?:main|micro)\/devops(?=\/|$)/, '')
    .replace(/^\/+devops(?=\/|$)/, '')
    .replace(/\/+/g, '/');

  return normalized.startsWith('/') ? normalized || '/' : `/${normalized}`;
}

function collectParams(searchParams: URLSearchParams): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }
  return params;
}

function extractRouteParams(match: RegExpMatchArray | null): Record<string, string> {
  if (!match?.groups) return {};

  return Object.entries(match.groups).reduce<Record<string, string>>((result, [key, value]) => {
    if (value) {
      result[key] = value;
    }
    return result;
  }, {});
}
