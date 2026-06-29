import { z } from 'zod';
import type { CliCommandMetadata, CliRecommendation, CliRegistry } from '../core/cli-registry.js';
import type { EndpointToolGroup } from '../core/roles.js';
import { summarizeList } from '../core/list-summary.js';
import { getApi } from '../core/api-provider.js';
import { jsonResult, runWithPreview, withToolMeta } from './shared.js';

export interface EndpointDefinition {
  group: EndpointToolGroup;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  request?: string;
  mode?: 'body' | 'query' | 'multipart' | 'none';
  /**
   * 显式标记该 endpoint 在服务端是只读查询（即便 method 为 POST）。
   * true 表示无需 --confirm 即可调用；未标记则按 method + READ_ENDPOINT_NAMES 白名单判定。
   * 白名单内容已与后端逐一确认只读，新增只读 POST 接口时建议在此标记 true 并补白名单。
   */
  readonly?: boolean;
}

// 部分 POST 接口在 Alpha 后端是只读查询（userinfo/uid/fileMetadataTypes 等），不强制 confirm。
// 该白名单已与后端确认只读；新增只读 POST 接口时请同步维护，并在 EndpointDefinition.readonly 标记 true。
const READ_ENDPOINT_NAMES: ReadonlySet<string> = new Set([
  'userinfo',
  'uid',
  'healthHealthPing',
  'testApi',
  'ciBuildList',
  'ciBuildPopularList',
  'ciBuildGetLatest',
  'ciBuildGetSelfBuild',
  'ciBranchList',
  'ciBranchSearch',
  'ciBuildGetBuild',
  'ciInfoGetServerTime',
  'ciInfoJenkinsOutput',
  'ciInfoGetRelCommit',
  'ciInfoChangeInfo',
  'ciManageGetPipelines',
  'ciManageGetTemplateList',
  'ciManageGetConfig',
  'ciRepoList',
  'ciRepoPage',
  'ciRepoInfo',
  'ciRepoConfigDetail',
  'deployAppsPage',
  'deployAppsVersionList',
  'deployAppsNsList',
  'deployAppsRecentList',
  'deployAppsViewK8s',
  'deployAppsDetailK8s',
  'deployAppsLogUrl',
  'deployAppsBashUrl',
  'deployAppsViewHistory',
  'deployChartsPage',
  'deployChartsDetail',
  'deployChartsVersion',
  'deployChartsValues',
  'deployChartsDeployStatus',
  'deployClusterPage',
  'deployClusterList',
  'deployClusterDetail',
  'deployClusterTypeList',
  'deployClusterDestinations',
  'deployMaterialPage',
  'deployMaterialList',
  'deployMaterialDetail',
  'deployProjectAzProList',
  'deployProjectAzUserList',
  'deployProjectDeployPage',
  'deployProjectDeployPageExpand',
  'deployProjectPushList',
  'deployProjectPushPage',
  'deployProjectPushPageExpand',
  'deployPushenvPage',
  'deployPushenvList',
  'deployPushenvDetail',
  'fileMetadataPage',
  'fileMetadataTypes',
  'iterHotfixList',
  'iterHotfixDetail',
  'iterProdGetList',
  'iterProjectGetList',
  'iterGetTree',
  'iterVersionList',
  'iterVersionTagList',
  'iterVersionDetail',
  'iterVersionTestVersionList',
  'iterVersionTestVersionDetail',
  'iterVersionTestVersionCount',
  'iterVersionGetTree',
  'iterVersionGetRecentTestSubmitted',
  'rbacPrivilegeCurrentList',
  'rbacPrivilegeList',
  'rbacRoleCurrentList',
]);

function isWriteMethod(method: string): boolean {
  const upper = method.toUpperCase();
  return upper === 'POST' || upper === 'PUT' || upper === 'DELETE' || upper === 'PATCH';
}

function isWriteEndpoint(endpoint: EndpointDefinition): boolean {
  if (endpoint.readonly === true) return false;
  if (!isWriteMethod(endpoint.method)) return false;
  if (READ_ENDPOINT_NAMES.has(endpoint.name)) return false;
  return true;
}

const baseEndpointSchema = {
  body: z.record(z.unknown()).optional().describe('JSON 请求体。'),
  query: z.record(z.unknown()).optional().describe('URL query 参数。'),
  file: z.array(z.string()).optional().describe('multipart 文件路径，可重复传。'),
};

const writeEndpointSchema = {
  ...baseEndpointSchema,
  confirm: z.boolean().optional().default(false).describe('写操作必须传 confirm=true 才会真正执行；不传或 false 时只返回 preview。'),
};

const LIST_RESPONSE_KEYS = ['list', 'items', 'data', 'rows', 'records'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSummaryItems(items: unknown[]): Array<{ id: number | string; [key: string]: unknown }> {
  return items.map((item, index) => {
    if (isPlainObject(item)) {
      const id = typeof item.id === 'number' || typeof item.id === 'string' ? item.id : index + 1;
      return { id, ...item };
    }

    return { id: index + 1, name: String(item) };
  });
}

function getListPayload(result: unknown): { items: unknown[]; container: Record<string, unknown> } | null {
  if (Array.isArray(result)) return { items: result, container: {} };
  if (!isPlainObject(result)) return null;

  for (const key of LIST_RESPONSE_KEYS) {
    const value = result[key];
    if (Array.isArray(value)) return { items: value, container: result };
  }

  return null;
}

function decorateListResult(result: unknown): unknown {
  const payload = getListPayload(result);
  if (!payload) return result;

  const summary = summarizeList(toSummaryItems(payload.items), { sortKey: 'deadline', groupKey: 'product' });
  const total = payload.items.length;

  if (Array.isArray(result)) {
    return {
      items: result,
      summary,
      meta: { processed: true, partial: false, total },
    };
  }

  const record = result as Record<string, unknown>;
  return {
    ...record,
    summary,
    meta: {
      ...(isPlainObject(record.meta) ? record.meta : {}),
      processed: true,
      partial: false,
      total,
    },
  };
}

export function registerEndpointTools(server: CliRegistry, group?: EndpointToolGroup): void {
  for (const endpoint of ENDPOINTS) {
    if (group && endpoint.group !== group) continue;
    const groupName = endpoint.group;
    const isWrite = isWriteEndpoint(endpoint);
    const schema = isWrite ? writeEndpointSchema : baseEndpointSchema;
    server.tool(endpoint.name, schema, async (input) => {
      const { body, query, file, confirm } = input as { body?: Record<string, unknown>; query?: Record<string, unknown>; file?: string[]; confirm?: boolean };
      const execute = async () => {
        const result = await getApi().request(endpoint.method, endpoint.path, {
          body: endpoint.mode === 'query' || endpoint.mode === 'none' ? undefined : body,
          query: endpoint.mode === 'body' || endpoint.mode === 'multipart' ? query : query ?? body,
          files: file,
        });
        const decorated = withToolMeta(result, {
          source: 'alpha-api',
          command: endpoint.name,
          method: endpoint.method,
          path: endpoint.path,
          mode: endpoint.mode ?? 'body',
          group: groupName,
        });
        return jsonResult(decorateListResult(decorated));
      };

      if (!isWrite) return execute();

      const preview = await runWithPreview(
        endpoint.name,
        { method: endpoint.method, path: endpoint.path, body, query, file },
        confirm,
        execute,
      );
      return jsonResult(preview);
    }, buildEndpointMetadata(endpoint));
  }
}

export function findEndpointGroup(commandName: string): EndpointToolGroup | undefined {
  return ENDPOINTS.find((endpoint) => endpoint.name === commandName)?.group;
}

const GROUP_RECOMMENDED_NEXT: Record<EndpointToolGroup, string[]> = {
  root: ['healthHealthPing', 'userinfo', 'initAlpha'],
  ci: ['ciBuildList', 'ciBuildGetLatest', 'ciInfoGetServerTime'],
  deploy: ['deployAppsPage', 'deployClusterList', 'deployAppsViewHistory'],
  file: ['fileMetadataPage', 'fileMetadataTypes', 'fileMetadataDownload'],
  iter: ['iterVersionList', 'iterGetTree', 'iterHotfixList'],
  rbac: ['rbacPrivilegeCurrentList', 'rbacRoleCurrentList'],
};

const ENDPOINT_RECOMMENDATIONS: Partial<Record<string, CliRecommendation[]>> = {
  deployAppsPage: [
    {
      tool: 'deployAppsViewHistory',
      reason: '继续查看某个应用的部署历史',
      priority: 2,
      args: { body: { appId: { source: ['payload', 'input'], path: ['list.0.appId', 'list.0.id', 'id', 'data.0.appId', 'data.0.id', 'body.appId', 'body.id'] } } },
    },
    { tool: 'deployAppsViewK8s', reason: '继续查看应用当前 K8s 资源', priority: 1 },
    { tool: 'deployClusterList', reason: '切回集群维度筛选部署目标', priority: 0 },
  ],
  deployAppsViewHistory: [
    {
      tool: 'deployAppsRollback',
      reason: '基于同一查询条件继续发起回滚',
      priority: 2,
      args: { body: { source: 'input', path: 'body' } },
    },
    {
      tool: 'deployAppsPage',
      reason: '回到应用分页列表继续筛选',
      priority: 0,
    },
  ],
  deployClusterList: [
    {
      tool: 'deployClusterDetail',
      reason: '继续查看某个集群的详情',
      priority: 1,
      args: { body: { id: { source: ['payload', 'input'], path: ['list.0.id', 'id', 'data.0.id', 'body.id'] } } },
    },
    { tool: 'deployAppsPage', reason: '按集群结果继续查看应用部署', priority: 0 },
  ],
  deployMaterialPage: [
    {
      tool: 'deployMaterialDetail',
      reason: '继续查看某个物料详情',
      priority: 1,
      args: { body: { id: { source: ['payload', 'input'], path: ['list.0.id', 'id', 'data.0.id', 'body.id'] } } },
    },
    { tool: 'deployMaterialUpload', reason: '补充上传新物料', priority: 0 },
  ],
  deployProjectDeployPage: [
    {
      tool: 'deployProjectDeployPageExpand',
      reason: '继续展开单条部署记录看详情',
      priority: 2,
      args: { body: { deployId: { source: ['payload', 'input'], path: ['list.0.deployId', 'list.0.id', 'deployId', 'id', 'data.0.deployId', 'data.0.id', 'body.deployId', 'body.id'] } } },
    },
    { tool: 'deployProjectPushPage', reason: '切到推包记录页继续排查', priority: 1 },
  ],
  deployProjectPushPage: [
    {
      tool: 'deployProjectPushPageExpand',
      reason: '继续展开单条推包记录看详情',
      priority: 2,
      args: { body: { id: { source: ['payload', 'input'], path: ['list.0.id', 'id', 'data.0.id', 'body.id'] } } },
    },
    { tool: 'deployProjectPushGoon', reason: '继续推进失败的推包任务', priority: 1 },
  ],
  deployAppsInstall: [
    {
      tool: 'deployAppsViewHistory',
      reason: '安装后先查看应用历史记录',
      priority: 2,
      args: { body: { appId: { source: ['payload', 'input'], path: ['appId', 'id', 'body.appId', 'body.id'] } } },
    },
    {
      tool: 'deployAppsViewK8s',
      reason: '安装后继续确认应用当前 K8s 资源',
      priority: 1,
      args: { body: { appId: { source: ['payload', 'input'], path: ['appId', 'id', 'body.appId', 'body.id'] } } },
    },
  ],
  deployAppsUpgrade: [
    {
      tool: 'deployAppsViewHistory',
      reason: '升级后先查看应用历史记录',
      priority: 2,
      args: { body: { appId: { source: ['payload', 'input'], path: ['appId', 'id', 'body.appId', 'body.id'] } } },
    },
    {
      tool: 'deployAppsRollback',
      reason: '如升级异常，可直接进入回滚链路',
      priority: 1,
      args: { body: { appId: { source: ['payload', 'input'], path: ['appId', 'id', 'body.appId', 'body.id'] } } },
    },
  ],
  deployAppsRollback: [
    {
      tool: 'deployAppsViewHistory',
      reason: '回滚后先确认应用历史记录是否更新',
      priority: 2,
      args: { body: { appId: { source: ['payload', 'input'], path: ['appId', 'body.appId', 'id'] } } },
    },
    {
      tool: 'deployAppsViewK8s',
      reason: '回滚后继续确认当前 K8s 资源状态',
      priority: 1,
      args: { body: { appId: { source: ['payload', 'input'], path: ['appId', 'body.appId', 'id'] } } },
    },
  ],
  deployProjectDeploy: [
    {
      tool: 'deployProjectDeployPage',
      reason: '部署后先查看部署历史记录',
      priority: 2,
      args: { body: { projectId: { source: ['payload', 'input'], path: ['projectId', 'id', 'body.projectId', 'body.id'] } } },
    },
    {
      tool: 'deployProjectDeployPageExpand',
      reason: '如果已返回 deployId，可直接展开部署详情',
      priority: 1,
      args: { body: { deployId: { source: ['payload', 'input'], path: ['deployId', 'id', 'body.deployId', 'body.id'] } } },
    },
  ],
  deployProjectPush: [
    {
      tool: 'deployProjectPushPage',
      reason: '推包后先查看推包历史记录',
      priority: 2,
    },
    {
      tool: 'deployProjectPushPageExpand',
      reason: '如果已返回推包 ID，可直接展开推包详情',
      priority: 1,
      args: { body: { id: { source: ['payload', 'input'], path: ['pushId', 'id', 'body.id'] } } },
    },
    {
      tool: 'deployProjectPushGoon',
      reason: '如果推包未完成，可继续或中止该任务',
      priority: 0,
      args: { body: { id: { source: ['payload', 'input'], path: ['pushId', 'id', 'body.id'] } } },
    },
  ],
  deployProjectPushGoon: [
    {
      tool: 'deployProjectPushPageExpand',
      reason: '继续后先确认推包详情状态',
      priority: 2,
      args: { body: { id: { source: ['payload', 'input'], path: ['pushId', 'id', 'body.id'] } } },
    },
    {
      tool: 'deployProjectPushPage',
      reason: '回到推包历史列表继续排查',
      priority: 1,
    },
  ],
  iterVersionList: [
    {
      tool: 'iterVersionDetail',
      reason: '继续查看某个版本详情',
      priority: 2,
      args: { body: { id: { source: ['payload', 'input'], path: ['list.0.id', 'id', 'data.0.id', 'body.id'] } } },
    },
    {
      tool: 'iterVersionTestVersionList',
      reason: '查看该版本相关提测记录',
      priority: 1,
      args: { body: { versionId: { source: ['payload', 'input'], path: ['list.0.id', 'id', 'data.0.id', 'body.id'] } } },
    },
    {
      tool: 'iterHotfixList',
      reason: '继续查看该版本的 hotfix 列表',
      priority: 0,
      args: { body: { versionId: { source: ['payload', 'input'], path: ['list.0.id', 'id', 'data.0.id', 'body.id'] } } },
    },
  ],
  iterVersionDetail: [
    {
      tool: 'iterVersionEdit',
      reason: '基于同一版本参数继续编辑版本',
      priority: 2,
      args: { body: { id: { source: ['payload', 'input'], path: ['id', 'body.id'] } } },
    },
    {
      tool: 'iterVersionTestVersionList',
      reason: '继续查看该版本的提测记录',
      priority: 1,
      args: { body: { versionId: { source: ['payload', 'input'], path: ['id', 'body.id'] } } },
    },
  ],
  iterVersionAdd: [
    {
      tool: 'iterVersionDetail',
      reason: '创建后先查看版本详情确认内容',
      priority: 2,
      args: { body: { id: { source: ['payload', 'input'], path: ['id', 'versionId', 'body.id'] } } },
    },
    {
      tool: 'iterVersionTestVersionList',
      reason: '继续进入该版本的提测管理',
      priority: 1,
      args: { body: { versionId: { source: ['payload', 'input'], path: ['id', 'versionId', 'body.id'] } } },
    },
    {
      tool: 'deployProjectDeploy',
      reason: '如果版本已确认，可继续发起部署',
      priority: 0,
    },
  ],
  iterVersionTestVersionSave: [
    {
      tool: 'iterVersionTestVersionList',
      reason: '保存后先回到该版本的提测列表',
      priority: 2,
      args: { body: { versionId: { source: ['payload', 'input'], path: ['versionId', 'body.versionId'] } } },
    },
    {
      tool: 'iterVersionTestVersionDetail',
      reason: '如果已返回提测单 ID，可直接查看详情',
      priority: 1,
      args: { body: { id: { source: ['payload', 'input'], path: ['testVersionId', 'id', 'body.id'] } } },
    },
    {
      tool: 'iterVersionTestVersionSubmit',
      reason: '内容确认后继续提交提测单',
      priority: 0,
      args: { body: { id: { source: ['payload', 'input'], path: ['testVersionId', 'id', 'body.id'] } } },
    },
  ],
  iterVersionTestVersionSubmit: [
    {
      tool: 'iterVersionTestVersionDetail',
      reason: '提交后先查看提测单详情确认状态',
      priority: 2,
      args: { body: { id: { source: ['payload', 'input'], path: ['testVersionId', 'id', 'body.id'] } } },
    },
    {
      tool: 'iterVersionTestVersionList',
      reason: '回到提测列表继续查看当前版本记录',
      priority: 1,
      args: { body: { versionId: { source: ['payload', 'input'], path: ['versionId', 'body.versionId'] } } },
    },
    {
      tool: 'iterVersionTestVersionCount',
      reason: '继续统计当前版本提测单数量',
      priority: 0,
      args: { body: { versionId: { source: ['payload', 'input'], path: ['versionId', 'body.versionId'] } } },
    },
  ],
  iterHotfixList: [
    {
      tool: 'iterHotfixDetail',
      reason: '继续查看某个 hotfix 详情',
      priority: 2,
      args: { body: { id: { source: ['payload', 'input'], path: ['list.0.id', 'id', 'data.0.id', 'body.id'] } } },
    },
    {
      tool: 'iterHotfixSave',
      reason: '基于当前版本继续新增或修改 hotfix',
      priority: 1,
      args: { body: { versionId: { source: ['payload', 'input'], path: ['versionId', 'body.versionId'] } } },
    },
    {
      tool: 'iterHotfixMerge',
      reason: '继续处理 hotfix 合并动作',
      priority: 0,
      args: { body: { id: { source: ['payload', 'input'], path: ['id', 'body.id'] } } },
    },
  ],
  iterHotfixSave: [
    {
      tool: 'iterHotfixDetail',
      reason: '保存后先查看 hotfix 详情',
      priority: 2,
      args: { body: { id: { source: ['payload', 'input'], path: ['id', 'hotfixId', 'body.id'] } } },
    },
    {
      tool: 'iterHotfixList',
      reason: '回到该版本的 hotfix 列表继续处理',
      priority: 1,
      args: { body: { versionId: { source: ['payload', 'input'], path: ['versionId', 'body.versionId'] } } },
    },
    {
      tool: 'iterHotfixMerge',
      reason: '如果 hotfix 已完成，可继续合并',
      priority: 0,
      args: { body: { id: { source: ['payload', 'input'], path: ['id', 'hotfixId', 'body.id'] } } },
    },
  ],
};

function buildEndpointMetadata(endpoint: EndpointDefinition): CliCommandMetadata {
  const nextBestTools = (GROUP_RECOMMENDED_NEXT[endpoint.group] ?? []).filter((name) => name !== endpoint.name);
  return {
    group: endpoint.group,
    description: `${endpoint.method} ${endpoint.path}`,
    examples: [buildEndpointExample(endpoint)],
    costHint: endpoint.mode === 'multipart' ? 'high' : endpoint.mode === 'none' ? 'low' : 'medium',
    nextBestTools: nextBestTools.length > 0 ? nextBestTools : undefined,
    recommendations: ENDPOINT_RECOMMENDATIONS[endpoint.name],
  };
}

function buildEndpointExample(endpoint: EndpointDefinition): string {
  const prefix = `alpha ${endpoint.name}`;
  switch (endpoint.mode) {
    case 'query':
      return `${prefix} --query '{"id":1}'`;
    case 'multipart':
      return `${prefix} --file ./example.bin`;
    case 'none':
      return prefix;
    case 'body':
    default:
      return `${prefix} --body '{}'`;
  }
}

export const ENDPOINTS: EndpointDefinition[] = [
  { group: 'root', name: 'healthHealthPing', method: 'GET', path: '/health/health/ping', mode: 'none', readonly: true },
  { group: 'root', name: 'login', method: 'POST', path: '/alpha/login', request: 'LoginReq', mode: 'body' },
  { group: 'root', name: 'userinfo', method: 'POST', path: '/alpha/userinfo', mode: 'none', readonly: true },
  { group: 'root', name: 'uid', method: 'POST', path: '/alpha/uid', request: 'JsonNode', mode: 'body', readonly: true },
  { group: 'root', name: 'logout', method: 'POST', path: '/alpha/logout', mode: 'none' },
  { group: 'root', name: 'testApi', method: 'GET', path: '/alpha/test-api', mode: 'none', readonly: true },
  { group: 'ci', name: 'ciAppSync', method: 'POST', path: '/alpha/ci/app/sync', request: 'JsonNode', mode: 'body' },
  { group: 'ci', name: 'ciBranchList', method: 'POST', path: '/alpha/ci/branch/list', request: 'BranchReq', mode: 'body' },
  { group: 'ci', name: 'ciBranchSearch', method: 'POST', path: '/alpha/ci/branch/search', request: 'BuildReq', mode: 'body' },
  { group: 'ci', name: 'ciBuildGetBuild', method: 'POST', path: '/alpha/ci/build/getBuild', request: 'BuildDetailReq', mode: 'body' },
  { group: 'ci', name: 'ciBuildManualProcess', method: 'POST', path: '/alpha/ci/build/manualProcess', request: 'BuildProcessReq', mode: 'body' },
  { group: 'ci', name: 'ciBuildFreedomBuild', method: 'POST', path: '/alpha/ci/build/freedomBuild', request: 'BuildProcessReq', mode: 'body' },
  { group: 'ci', name: 'ciBuildFreedomTags', method: 'POST', path: '/alpha/ci/build/freedomTags', mode: 'none' },
  { group: 'ci', name: 'ciBuildParamsBuild', method: 'POST', path: '/alpha/ci/build/paramsBuild', request: 'BuildProcessReq', mode: 'body' },
  { group: 'ci', name: 'ciBuildList', method: 'POST', path: '/alpha/ci/build/list', request: 'BuildPageReq', mode: 'body' },
  { group: 'ci', name: 'ciBuildPopularList', method: 'POST', path: '/alpha/ci/build/popularList', mode: 'none' },
  { group: 'ci', name: 'ciBuildGetLatest', method: 'POST', path: '/alpha/ci/build/getLatest', mode: 'none' },
  { group: 'ci', name: 'ciBuildGetSelfBuild', method: 'POST', path: '/alpha/ci/build/getSelfBuild', mode: 'none' },
  { group: 'ci', name: 'ciBuildCancel', method: 'POST', path: '/alpha/ci/build/cancel', request: 'BuildDetailReq', mode: 'body' },
  { group: 'ci', name: 'ciInfoChangeInfo', method: 'POST', path: '/alpha/ci/info/changeInfo', request: 'ChangeInfoReq', mode: 'body' },
  { group: 'ci', name: 'ciInfoGetServerTime', method: 'POST', path: '/alpha/ci/info/getServerTime', mode: 'none' },
  { group: 'ci', name: 'ciInfoJenkinsOutput', method: 'POST', path: '/alpha/ci/info/jenkins-output', request: 'BuildDetailReq', mode: 'body' },
  { group: 'ci', name: 'ciInfoGetRelCommit', method: 'POST', path: '/alpha/ci/info/getRelCommit', request: 'BuildDetailReq', mode: 'body' },
  { group: 'ci', name: 'ciManageGetPipelines', method: 'POST', path: '/alpha/ci/manage/getPipelines', mode: 'none' },
  { group: 'ci', name: 'ciManageGetTemplateList', method: 'POST', path: '/alpha/ci/manage/getTemplateList', mode: 'none' },
  { group: 'ci', name: 'ciManageSetConfig', method: 'POST', path: '/alpha/ci/manage/setConfig', request: 'SetConfigReq', mode: 'body' },
  { group: 'ci', name: 'ciManageGetConfig', method: 'POST', path: '/alpha/ci/manage/getConfig', request: 'JsonNode', mode: 'body' },
  { group: 'ci', name: 'ciManageUpdateConfig', method: 'POST', path: '/alpha/ci/manage/updateConfig', request: 'ConfigUpdateReq', mode: 'body' },
  { group: 'ci', name: 'ciManageClearCache', method: 'POST', path: '/alpha/ci/manage/clearCache', request: 'JsonNode', mode: 'body' },
  { group: 'ci', name: 'ciManageResetVersion', method: 'POST', path: '/alpha/ci/manage/resetVersion', request: 'JsonNode', mode: 'body' },
  { group: 'ci', name: 'ciManageSyncCiConfig', method: 'POST', path: '/alpha/ci/manage/sync-ci-config', request: 'JenkinsConfigReq', mode: 'body' },
  { group: 'ci', name: 'ciRepoList', method: 'POST', path: '/alpha/ci/repo/list', mode: 'none' },
  { group: 'ci', name: 'ciRepoPage', method: 'POST', path: '/alpha/ci/repo/page', request: 'CommonSearchPageReq', mode: 'body' },
  { group: 'ci', name: 'ciRepoInfo', method: 'POST', path: '/alpha/ci/repo/info', request: 'CiRepo', mode: 'body' },
  { group: 'ci', name: 'ciRepoAdd', method: 'POST', path: '/alpha/ci/repo/add', request: 'CiRepo', mode: 'body' },
  { group: 'ci', name: 'ciRepoConfigDetail', method: 'POST', path: '/alpha/ci/repo/config-detail', request: 'CiRepoBranch', mode: 'body' },
  { group: 'deploy', name: 'deployAppsSync', method: 'POST', path: '/alpha/deploy/apps/sync', request: 'JsonNode', mode: 'body' },
  { group: 'deploy', name: 'deployAppsPage', method: 'POST', path: '/alpha/deploy/apps/page', request: 'CloudAppsPageReq', mode: 'body' },
  { group: 'deploy', name: 'deployAppsVersionList', method: 'POST', path: '/alpha/deploy/apps/version-list', request: 'JsonNode', mode: 'body' },
  { group: 'deploy', name: 'deployAppsNsList', method: 'POST', path: '/alpha/deploy/apps/ns-list', request: 'JsonNode', mode: 'body' },
  { group: 'deploy', name: 'deployAppsInstall', method: 'POST', path: '/alpha/deploy/apps/install', request: 'CloudAppInstallReq', mode: 'body' },
  { group: 'deploy', name: 'deployAppsAzDeploy', method: 'POST', path: '/alpha/deploy/apps/azDeploy', request: 'BuildAzDeployReq', mode: 'body' },
  { group: 'deploy', name: 'deployAppsUpgrade', method: 'POST', path: '/alpha/deploy/apps/upgrade', request: 'CloudAppUpdateReq', mode: 'body' },
  { group: 'deploy', name: 'deployAppsUninstall', method: 'POST', path: '/alpha/deploy/apps/uninstall', request: 'JsonNode', mode: 'body' },
  { group: 'deploy', name: 'deployAppsRollback', method: 'POST', path: '/alpha/deploy/apps/rollback', request: 'AppHistoryReq', mode: 'body' },
  { group: 'deploy', name: 'deployAppsRecentList', method: 'POST', path: '/alpha/deploy/apps/recent-list', request: 'CloudAppRecentListReq', mode: 'body' },
  { group: 'deploy', name: 'deployAppsViewK8s', method: 'POST', path: '/alpha/deploy/apps/view-k8s', request: 'CloudAppViewPageReq', mode: 'body' },
  { group: 'deploy', name: 'deployAppsDetailK8s', method: 'POST', path: '/alpha/deploy/apps/detail-k8s', request: 'CloudAppViewPageReq', mode: 'body' },
  { group: 'deploy', name: 'deployAppsRefreshResource', method: 'POST', path: '/alpha/deploy/apps/refresh-resource', request: 'JsonNode', mode: 'body' },
  { group: 'deploy', name: 'deployAppsLogUrl', method: 'POST', path: '/alpha/deploy/apps/log-url', request: 'InfoOrBashReq', mode: 'body' },
  { group: 'deploy', name: 'deployAppsBashUrl', method: 'POST', path: '/alpha/deploy/apps/bash-url', request: 'InfoOrBashReq', mode: 'body' },
  { group: 'deploy', name: 'deployAppsViewHistory', method: 'POST', path: '/alpha/deploy/apps/view-history', request: 'AppHistoryReq', mode: 'body' },
  { group: 'deploy', name: 'deployAppsImageVersion', method: 'POST', path: '/alpha/deploy/apps/image-version', request: 'UpdateImageReq', mode: 'body' },
  { group: 'deploy', name: 'deployChartsPage', method: 'POST', path: '/alpha/deploy/charts/page', request: 'CommonSearchPageReq', mode: 'body' },
  { group: 'deploy', name: 'deployChartsDetail', method: 'POST', path: '/alpha/deploy/charts/detail', request: 'JsonNode', mode: 'body' },
  { group: 'deploy', name: 'deployChartsVersion', method: 'POST', path: '/alpha/deploy/charts/version', request: 'JsonNode', mode: 'body' },
  { group: 'deploy', name: 'deployChartsValues', method: 'POST', path: '/alpha/deploy/charts/values', request: 'JsonNode', mode: 'body' },
  { group: 'deploy', name: 'deployChartsDeployStatus', method: 'POST', path: '/alpha/deploy/charts/deploy-status', request: 'JsonNode', mode: 'body' },
  { group: 'deploy', name: 'deployClusterAdd', method: 'POST', path: '/alpha/deploy/cluster/add', request: 'DeployCluster', mode: 'body' },
  { group: 'deploy', name: 'deployClusterEdit', method: 'POST', path: '/alpha/deploy/cluster/edit', request: 'DeployCluster', mode: 'body' },
  { group: 'deploy', name: 'deployClusterPage', method: 'POST', path: '/alpha/deploy/cluster/page', request: 'CommonSearchPageReq', mode: 'body' },
  { group: 'deploy', name: 'deployClusterList', method: 'POST', path: '/alpha/deploy/cluster/list', request: 'DeployCluster', mode: 'body' },
  { group: 'deploy', name: 'deployClusterDetail', method: 'POST', path: '/alpha/deploy/cluster/detail', request: 'DeployCluster', mode: 'body' },
  { group: 'deploy', name: 'deployClusterTypeList', method: 'POST', path: '/alpha/deploy/cluster/type-list', mode: 'none' },
  { group: 'deploy', name: 'deployClusterDestinations', method: 'POST', path: '/alpha/deploy/cluster/destinations', request: 'DeployClusterReq', mode: 'body' },
  { group: 'deploy', name: 'deployMaterialAdd', method: 'POST', path: '/alpha/deploy/material/add', request: 'DeployMaterial', mode: 'body' },
  { group: 'deploy', name: 'deployMaterialEdit', method: 'POST', path: '/alpha/deploy/material/edit', request: 'DeployMaterial', mode: 'body' },
  { group: 'deploy', name: 'deployMaterialUpload', method: 'POST', path: '/alpha/deploy/material/upload', mode: 'multipart' },
  { group: 'deploy', name: 'deployMaterialPage', method: 'POST', path: '/alpha/deploy/material/page', request: 'CommonSearchPageReq', mode: 'body' },
  { group: 'deploy', name: 'deployMaterialList', method: 'POST', path: '/alpha/deploy/material/list', mode: 'none' },
  { group: 'deploy', name: 'deployMaterialDetail', method: 'POST', path: '/alpha/deploy/material/detail', request: 'DeployMaterial', mode: 'body' },
  { group: 'deploy', name: 'deployMaterialSync', method: 'POST', path: '/alpha/deploy/material/sync', mode: 'none' },
  { group: 'deploy', name: 'deployProjectAzProList', method: 'POST', path: '/alpha/deploy/project/azProList', request: 'DeployReq', mode: 'body' },
  { group: 'deploy', name: 'deployProjectAzUserList', method: 'POST', path: '/alpha/deploy/project/azUserList', request: 'DeployReq', mode: 'body' },
  { group: 'deploy', name: 'deployProjectAzProjectAdd', method: 'POST', path: '/alpha/deploy/project/azProjectAdd', request: 'DeployReq', mode: 'body' },
  { group: 'deploy', name: 'deployProjectAzDeploy', method: 'POST', path: '/alpha/deploy/project/azDeploy', request: 'DeployReq', mode: 'body' },
  { group: 'deploy', name: 'deployProjectRetryAzDeploy', method: 'POST', path: '/alpha/deploy/project/retry-azDeploy', request: 'DeployReq', mode: 'body' },
  { group: 'deploy', name: 'deployProjectDeploy', method: 'POST', path: '/alpha/deploy/project/deploy', request: 'DeployReq', mode: 'body' },
  { group: 'deploy', name: 'deployProjectRetryDeploy', method: 'POST', path: '/alpha/deploy/project/retry-deploy', request: 'DeployReq', mode: 'body' },
  { group: 'deploy', name: 'deployProjectDeployPage', method: 'POST', path: '/alpha/deploy/project/deploy-page', request: 'DeployHistoryReq', mode: 'body' },
  { group: 'deploy', name: 'deployProjectDeployPageExpand', method: 'POST', path: '/alpha/deploy/project/deploy-page-expand', request: 'DeployDetailReq', mode: 'body' },
  { group: 'deploy', name: 'deployProjectPush', method: 'POST', path: '/alpha/deploy/project/push', request: 'PushPackageReq', mode: 'body' },
  { group: 'deploy', name: 'deployProjectFilePush', method: 'POST', path: '/alpha/deploy/project/file-push', request: 'PushFileReq', mode: 'body' },
  { group: 'deploy', name: 'deployProjectPushGoon', method: 'POST', path: '/alpha/deploy/project/push-goon', request: 'PushGoOnReq', mode: 'body' },
  { group: 'deploy', name: 'deployProjectPushList', method: 'POST', path: '/alpha/deploy/project/push-list', request: 'QueryPushListReq', mode: 'body' },
  { group: 'deploy', name: 'deployProjectPushPage', method: 'POST', path: '/alpha/deploy/project/push-page', request: 'PushPackagePageReq', mode: 'body' },
  { group: 'deploy', name: 'deployProjectPushPageExpand', method: 'POST', path: '/alpha/deploy/project/push-page-expand', request: 'PushPackageReq', mode: 'body' },
  { group: 'deploy', name: 'deployPushenvAdd', method: 'POST', path: '/alpha/deploy/pushenv/add', request: 'PushEnvReq', mode: 'body' },
  { group: 'deploy', name: 'deployPushenvPage', method: 'POST', path: '/alpha/deploy/pushenv/page', request: 'CommonSearchPageReq', mode: 'body' },
  { group: 'deploy', name: 'deployPushenvList', method: 'POST', path: '/alpha/deploy/pushenv/list', mode: 'none' },
  { group: 'deploy', name: 'deployPushenvEdit', method: 'POST', path: '/alpha/deploy/pushenv/edit', request: 'PushEnvReq', mode: 'body' },
  { group: 'deploy', name: 'deployPushenvDetail', method: 'POST', path: '/alpha/deploy/pushenv/detail', request: 'PushEnvReq', mode: 'body' },
  { group: 'file', name: 'fileMetadataPage', method: 'POST', path: '/alpha/file/metadata/page', request: 'FileMetadataReq', mode: 'body' },
  { group: 'file', name: 'fileMetadataTypes', method: 'POST', path: '/alpha/file/metadata/types', mode: 'none' },
  { group: 'file', name: 'fileMetadataDownload', method: 'GET', path: '/alpha/file/metadata/download', request: 'FileDownloadReq', mode: 'query', readonly: true },
  { group: 'file', name: 'fileMetadataPreview', method: 'GET', path: '/alpha/file/metadata/preview', request: 'FilePreviewReq', mode: 'query', readonly: true },
  { group: 'file', name: 'fileMetadataAdd', method: 'POST', path: '/alpha/file/metadata/add', request: 'FileUploadReq', mode: 'multipart' },
  { group: 'iter', name: 'iterHotfixSave', method: 'POST', path: '/alpha/iter/hotfix/save', request: 'HotfixReq', mode: 'body' },
  { group: 'iter', name: 'iterHotfixList', method: 'POST', path: '/alpha/iter/hotfix/list', request: 'HotfixReq', mode: 'body' },
  { group: 'iter', name: 'iterHotfixDetail', method: 'POST', path: '/alpha/iter/hotfix/detail', request: 'HotfixIdReq', mode: 'body' },
  { group: 'iter', name: 'iterHotfixMerge', method: 'POST', path: '/alpha/iter/hotfix/merge', request: 'HotfixReq', mode: 'body' },
  { group: 'iter', name: 'iterProdAdd', method: 'POST', path: '/alpha/iter/prod/add', request: 'JsonNode', mode: 'body' },
  { group: 'iter', name: 'iterProdGetList', method: 'POST', path: '/alpha/iter/prod/getList', mode: 'none' },
  { group: 'iter', name: 'iterProjectAdd', method: 'POST', path: '/alpha/iter/project/add', request: 'JsonNode', mode: 'body' },
  { group: 'iter', name: 'iterProjectGetList', method: 'POST', path: '/alpha/iter/project/getList', request: 'JsonNode', mode: 'body' },
  { group: 'iter', name: 'iterProjectDelete', method: 'POST', path: '/alpha/iter/project/delete', request: 'JsonNode', mode: 'body' },
  { group: 'iter', name: 'iterGetTree', method: 'POST', path: '/alpha/iter/getTree', mode: 'none' },
  { group: 'iter', name: 'iterVersionAdd', method: 'POST', path: '/alpha/iter/version/add', request: 'VersionReq', mode: 'body' },
  { group: 'iter', name: 'iterVersionSwitchAz2resourceUrl', method: 'POST', path: '/alpha/iter/version/switchAz2resourceUrl', request: 'VersionReq', mode: 'body' },
  { group: 'iter', name: 'iterVersionSwitchGflow2resourceUrl', method: 'POST', path: '/alpha/iter/version/switchGflow2resourceUrl', request: 'VersionReq', mode: 'body' },
  { group: 'iter', name: 'iterVersionSwitchEnvInit2resourceUrl', method: 'POST', path: '/alpha/iter/version/switchEnvInit2resourceUrl', request: 'VersionReq', mode: 'body' },
  { group: 'iter', name: 'iterVersionSwitchUdf2resourceUrl', method: 'POST', path: '/alpha/iter/version/switchUdf2resourceUrl', request: 'VersionReq', mode: 'body' },
  { group: 'iter', name: 'iterVersionDisable', method: 'POST', path: '/alpha/iter/version/disable', request: 'VersionReq', mode: 'body' },
  { group: 'iter', name: 'iterVersionEdit', method: 'POST', path: '/alpha/iter/version/edit', request: 'VersionReq', mode: 'body' },
  { group: 'iter', name: 'iterVersionDetail', method: 'POST', path: '/alpha/iter/version/detail', request: 'JsonNode', mode: 'body' },
  { group: 'iter', name: 'iterVersionMergeHis', method: 'POST', path: '/alpha/iter/version/merge-his', request: 'JsonNode', mode: 'body' },
  { group: 'iter', name: 'iterVersionList', method: 'POST', path: '/alpha/iter/version/list', request: 'VersionListPageReq', mode: 'body' },
  { group: 'iter', name: 'iterVersionTagList', method: 'POST', path: '/alpha/iter/version/tag-list', mode: 'none' },
  { group: 'iter', name: 'iterVersionDelete', method: 'POST', path: '/alpha/iter/version/delete', request: 'JsonNode', mode: 'body' },
  { group: 'iter', name: 'iterVersionTestVersionSave', method: 'POST', path: '/alpha/iter/version/testVersionSave', request: 'TestVersionReq', mode: 'body' },
  { group: 'iter', name: 'iterVersionTestVersionList', method: 'POST', path: '/alpha/iter/version/testVersionList', request: 'TestVersionReq', mode: 'body' },
  { group: 'iter', name: 'iterVersionTestVersionDetail', method: 'POST', path: '/alpha/iter/version/testVersionDetail', request: 'TestVersionReq', mode: 'body' },
  { group: 'iter', name: 'iterVersionTestVersionSubmit', method: 'POST', path: '/alpha/iter/version/testVersionSubmit', request: 'TestVersionReq', mode: 'body' },
  { group: 'iter', name: 'iterVersionTestVersionCount', method: 'POST', path: '/alpha/iter/version/testVersionCount', request: 'TestVersionReq', mode: 'body' },
  { group: 'iter', name: 'iterVersionGetTree', method: 'POST', path: '/alpha/iter/version/getTree', mode: 'none' },
  { group: 'iter', name: 'iterVersionGetRecentTestSubmitted', method: 'POST', path: '/alpha/iter/version/getRecentTestSubmitted', mode: 'none' },
  { group: 'rbac', name: 'rbacPrivilegeCurrentList', method: 'POST', path: '/alpha/rbac/privilege/current-list', mode: 'none' },
  { group: 'rbac', name: 'rbacPrivilegeList', method: 'POST', path: '/alpha/rbac/privilege/list', request: 'PrivilegeListReq', mode: 'body' },
  { group: 'rbac', name: 'rbacPrivilegeAssignPrivileges', method: 'POST', path: '/alpha/rbac/privilege/assign-privileges', request: 'PrivilegeAssignReq', mode: 'body' },
  { group: 'rbac', name: 'rbacRoleCurrentList', method: 'POST', path: '/alpha/rbac/role/current-list', mode: 'none' },
  { group: 'rbac', name: 'rbacRoleAssignRoles', method: 'POST', path: '/alpha/rbac/role/assign-roles', request: 'RoleAssignReq', mode: 'body' },
];
