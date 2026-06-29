import { z } from 'zod';
import type { CliRegistry } from '../core/cli-registry.js';
import { getApi } from '../core/api-provider.js';
import { jsonResult, withToolMeta } from './shared.js';

// 与后端 APP_REGEX = ^([0-9a-z-]+):([0-9]+\.[0-9]+\.[0-9]+-[0-9]+)$ 保持一致
const APP_REGEX = /^([0-9a-z-]+):(\d+\.\d+\.\d+-\d+)$/;

interface BuildListResponse {
  list?: BuildRecord[];
  total?: number;
  page?: number;
  size?: number;
}

interface BuildRecord {
  id?: number | string;
  repoId?: number | string;
  branch?: string;
  version?: string;
  status?: string;
  commit?: string;
  createdTime?: number | string;
  [key: string]: unknown;
}

interface BranchSearchItem {
  id?: number | string;
  branch?: string;
  version?: string;
  appName?: string;
  repoId?: number | string;
  commit?: string;
  status?: string;
  createdTime?: number | string;
  [key: string]: unknown;
}

interface SelfBuildItem {
  id: number | string;
  name?: string;
  branch?: string;
  [key: string]: unknown;
}

function pickBuild(record: BuildRecord | BranchSearchItem): BuildRecord {
  // 浅拷贝后返回，避免外部调用方持有并修改内部引用；去掉裸 as 断言。
  return { ...record } as BuildRecord;
}

function compareByCreatedTimeDesc(a: BuildRecord, b: BuildRecord): number {
  const aTime = typeof a.createdTime === 'number' ? a.createdTime : Number(a.createdTime ?? 0);
  const bTime = typeof b.createdTime === 'number' ? b.createdTime : Number(b.createdTime ?? 0);
  return bTime - aTime;
}

/**
 * 可被 SIGINT 中断的 sleep。返回一个在超时后 resolve 的 Promise，
 * 期间收到 SIGINT 则 reject，便于长轮询循环在 Ctrl-C 时尽快退出。
 * 调用方应在循环结束后调用 disposeInterrupt() 清理监听器。
 */
function createInterruptibleSleep(): { sleep: (ms: number) => Promise<void>; dispose: () => void } {
  let interrupted = false;
  let rejectPending: ((err: Error) => void) | null = null;
  const onSigint = (): void => {
    interrupted = true;
    if (rejectPending) rejectPending(new Error('已取消：收到 SIGINT，轮询被用户中断。'));
  };
  process.once('SIGINT', onSigint);

  return {
    sleep(ms: number): Promise<void> {
      if (interrupted) return Promise.reject(new Error('已取消：收到 SIGINT，轮询被用户中断。'));
      return new Promise<void>((resolve, reject) => {
        rejectPending = reject;
        setTimeout(() => {
          rejectPending = null;
          resolve();
        }, ms);
      });
    },
    dispose(): void {
      process.removeListener('SIGINT', onSigint);
    },
  };
}

export function registerCiOrchestratedTools(server: CliRegistry): void {
  // ciBuildFind:零相似度反查 repo+分支+build
  server.tool(
    'ciBuildFind',
    {
      app: z.string().trim().min(1).describe('appName:version,例如 jwsp-office-automation:3.0.0-319751'),
      repoId: z.number().int().optional().describe('可选,若已知 repoId 可跳过 branch/search 直接走 build/list。'),
      branch: z.string().trim().optional().describe('可选分支过滤。'),
      includeUnfinished: z.boolean().default(false).describe('是否包含未完成的构建,默认只看 success。'),
    },
    async ({ app, repoId, branch, includeUnfinished }) => {
      if (!APP_REGEX.test(app)) {
        throw new Error('版本格式不合法,期望 appName:version,例如 jwsp-office-automation:3.0.0-319751');
      }
      const [, appName, version] = app.match(APP_REGEX) as RegExpMatchArray;

      if (typeof repoId === 'number') {
        const response = (await getApi().request('POST', '/alpha/ci/build/list', {
          body: { repoId, branch: branch ?? '', version, page: 1, count: 10 },
        })) as BuildListResponse;
        const candidates = Array.isArray(response?.list) ? response.list : [];
        const matched = candidates.filter((item) => {
          if (item.version !== version) return false;
          if (!includeUnfinished && item.status !== 'success') return false;
          return true;
        });
        if (matched.length === 0) {
          throw new Error(`未找到版本 ${app} 的构建记录`);
        }
        matched.sort(compareByCreatedTimeDesc);
        const build = pickBuild(matched[0]);
        return jsonResult(
          withToolMeta(
            {
              found: true,
              build,
              appName,
              version,
              repoId: build.repoId,
              branch: build.branch,
            },
            { source: 'ci-orchestrated', command: 'ciBuildFind', method: 'app-version-resolve', group: 'ci' },
          ),
        );
      }

      const branchSearch = (await getApi().request('POST', '/alpha/ci/branch/search', {
        body: { appList: [app] },
      })) as BranchSearchItem[];
      const list = Array.isArray(branchSearch) ? branchSearch : [];

      const matched = list
        .filter((item) => item.version === version)
        .filter((item) => includeUnfinished || item.status === 'success');

      if (matched.length === 0) {
        throw new Error(`未找到版本 ${app} 的构建记录`);
      }

      const sorted = [...matched].sort((a, b) => {
        const aTime = typeof a.createdTime === 'number' ? a.createdTime : Number(a.createdTime ?? 0);
        const bTime = typeof b.createdTime === 'number' ? b.createdTime : Number(b.createdTime ?? 0);
        return bTime - aTime;
      });
      const build = pickBuild(sorted[0]);

      return jsonResult(
        withToolMeta(
          {
            found: true,
            build,
            appName,
            version,
            repoId: build.repoId,
            branch: build.branch,
          },
          { source: 'ci-orchestrated', command: 'ciBuildFind', method: 'app-version-resolve', group: 'ci' },
        ),
      );
    },
    {
      group: 'ci',
      description: '按 appName:version 零相似度反查 repoId/branch/build。',
      examples: [
        'alpha ciBuildFind --app jwsp-office-automation:3.0.0-319751',
        'alpha ciBuildFind --app jwsp-office-automation:3.0.0-319751 --repoId 42 --branch main',
        'alpha ciBuildFind --app jwsp-office-automation:3.0.0-319751 --includeUnfinished true',
      ],
      costHint: 'medium',
      nextBestTools: ['ciBuildList', 'ciBuildGetSelfBuild'],
      recommendations: [
        {
          tool: 'ciBuildWait',
          reason: '继续等待这条构建完成',
          priority: 2,
          args: {
            repoId: { source: 'payload', path: 'repoId' },
            branch: { source: 'payload', path: 'branch' },
            buildId: { source: 'payload', path: 'build.id' },
          },
        },
        {
          tool: 'ciBuildList',
          reason: '按 repoId 和分支查看同批次构建列表',
          priority: 1,
          args: {
            body: {
              repoId: { source: 'payload', path: 'repoId' },
              branch: { source: 'payload', path: 'branch' },
            },
          },
        },
        {
          tool: 'ciBuildGetSelfBuild',
          reason: '回到当前用户的常用构建仓库列表',
          priority: 0,
        },
      ],
    },
  );

  // ciBuildWait:轮询等构建完成
  server.tool(
    'ciBuildWait',
    {
      repoId: z.number().int().describe('必填,仓库 ID。'),
      branch: z.string().trim().min(1).describe('必填,分支名。'),
      buildId: z.number().int().optional().describe('可选,指定要等的 buildId;不传则取该 repo+branch 最新一条。'),
      timeoutSeconds: z.number().int().positive().default(1800).describe('超时秒数,默认 1800(30 分钟)。'),
      intervalSeconds: z.number().int().positive().default(5).describe('轮询间隔秒数,默认 5 秒。'),
    },
    async ({ repoId, branch, buildId, timeoutSeconds, intervalSeconds }) => {
      const startTime = Date.now();
      const deadline = startTime + timeoutSeconds * 1000;
      const interrupter = createInterruptibleSleep();

      try {
        while (true) {
          const response = (await getApi().request('POST', '/alpha/ci/build/list', {
            body: { repoId, branch, page: 1, count: 20 },
          })) as BuildListResponse;
          const list = Array.isArray(response?.list) ? response.list : [];

          const target = typeof buildId === 'number'
            ? list.find((item) => Number(item.id) === buildId)
            : list[0];

          if (!target) {
            throw new Error(`未找到 repoId=${repoId} branch=${branch} 的构建`);
          }

          const status = typeof target.status === 'string' ? target.status : '';

          if (status === 'success') {
            return jsonResult(
              withToolMeta(
                {
                  done: true,
                  status: 'success',
                  build: target,
                  waitedSeconds: Math.round((Date.now() - startTime) / 1000),
                },
                { source: 'ci-orchestrated', command: 'ciBuildWait', method: 'poll', group: 'ci' },
              ),
            );
          }

          if (status === 'error' || status === 'failed') {
            throw new Error(`构建失败: repoId=${repoId} branch=${branch} buildId=${buildId ?? target.id}`);
          }

          if (Date.now() >= deadline) {
            throw new Error(`等待构建超时(${timeoutSeconds}秒)`);
          }

          await interrupter.sleep(intervalSeconds * 1000);
        }
      } finally {
        interrupter.dispose();
      }
    },
    {
      group: 'ci',
      description: '轮询等待指定 repo+branch(或 buildId)的构建变为 success。',
      examples: [
        'alpha ciBuildWait --repoId 42 --branch main',
        'alpha ciBuildWait --repoId 42 --branch main --buildId 1001',
        'alpha ciBuildWait --repoId 42 --branch main --timeoutSeconds 600 --intervalSeconds 10',
      ],
      costHint: 'high',
      nextBestTools: ['ciBuildList', 'ciBuildGetSelfBuild'],
      recommendations: [
        {
          tool: 'ciBuildList',
          reason: '查看这条构建所在分支的最新构建列表',
          priority: 1,
          args: {
            body: {
              repoId: { source: 'input', path: 'repoId' },
              branch: { source: 'input', path: 'branch' },
            },
          },
        },
        {
          tool: 'ciBuildGetBuild',
          reason: '查看成功构建的详情',
          priority: 2,
          args: {
            body: {
              id: { source: 'payload', path: 'build.id' },
            },
          },
        },
      ],
    },
  );

  // ciBuildRecent:聚合最近构建候选
  server.tool(
    'ciBuildRecent',
    {
      excludeJobGlab: z.boolean().default(true).describe('默认排除 name 含 job-glab 的仓库。'),
      statusFilter: z.array(z.string()).optional().describe('可选,只保留这些状态,例如 --statusFilter process --statusFilter success。'),
    },
    async ({ excludeJobGlab, statusFilter }) => {
      const selfBuild = (await getApi().request('POST', '/alpha/ci/build/getSelfBuild', {})) as SelfBuildItem[];
      const repos = Array.isArray(selfBuild) ? selfBuild : [];

      const filteredRepos = excludeJobGlab
        ? repos.filter((item) => !(typeof item.name === 'string' && item.name.includes('job-glab')))
        : repos;

      const builds: Array<Record<string, unknown>> = [];
      for (const repo of filteredRepos) {
        const repoIdNum = Number(repo.id);
        const branch = typeof repo.branch === 'string' ? repo.branch : '';
        const response = (await getApi().request('POST', '/alpha/ci/build/list', {
          body: { repoId: repoIdNum, branch, page: 1, count: 5 },
        })) as BuildListResponse;
        const list = Array.isArray(response?.list) ? response.list : [];

        const processBuild = list.find((item) => item.status === 'process');
        if (processBuild) {
          builds.push({
            repoId: repo.id,
            repoName: repo.name,
            branch: processBuild.branch ?? branch,
            version: processBuild.version,
            status: processBuild.status,
            build: processBuild,
          });
        }

        const successBuild = list.find((item) => item.status === 'success');
        if (successBuild) {
          builds.push({
            repoId: repo.id,
            repoName: repo.name,
            branch: successBuild.branch ?? branch,
            version: successBuild.version,
            status: successBuild.status,
            build: successBuild,
          });
        }
      }

      const finalBuilds = Array.isArray(statusFilter) && statusFilter.length > 0
        ? builds.filter((entry) => typeof entry.status === 'string' && statusFilter.includes(entry.status))
        : builds;

      return jsonResult(
        withToolMeta(
          {
            builds: finalBuilds,
            count: finalBuilds.length,
            scannedRepos: repos.length,
          },
          { source: 'ci-orchestrated', command: 'ciBuildRecent', method: 'aggregate', group: 'ci' },
        ),
      );
    },
    {
      group: 'ci',
      description: '聚合当前用户最近构建过的仓库及其 process/success 构建候选。',
      examples: [
        'alpha ciBuildRecent',
        'alpha ciBuildRecent --excludeJobGlab false',
        'alpha ciBuildRecent --statusFilter process --statusFilter success',
      ],
      costHint: 'medium',
      nextBestTools: ['ciBuildList', 'ciBuildGetSelfBuild'],
    },
  );
}
