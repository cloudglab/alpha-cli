import { z } from 'zod';
import axios from 'axios';
import type { CliRegistry } from '../core/cli-registry.js';
import { getApi } from '../core/api-provider.js';
import { opsPush, type OpsPushResult } from '../core/ssh.js';
import { jsonResult, runWithPreview, withToolMeta } from './shared.js';

export const PUSH_COMMAND_NAMES: readonly string[] = ['pushPkg'];

const CHARTS_REPO_NAME = 'job-glab-pkg_charts';
const CHARTS_REPO_FALLBACK_ID = 494;
const IMAGES_REPO_NAME = 'job-glab-pkg_images';
const IMAGES_REPO_FALLBACK_ID = 210;
const MASTER_BRANCH = 'master';
// 发布产物服务器是公开静态资源，故意不走鉴权；允许通过环境变量覆盖默认地址。
const RELEASE_BASE_URL = process.env.ALPHA_RELEASE_BASE_URL ?? 'http://devops.cloudglab.cn/release';
// 公开静态资源下载的超时时间。
const RELEASE_FETCH_TIMEOUT_MS = 30_000;

interface RepoListItem {
  id?: number | string;
  name?: string;
  appName?: string;
  orgTag?: string;
}

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
}

interface ParamsBuildResponse {
  buildId?: number | string;
  id?: number | string;
}

interface MaterialUploadResponse {
  fileId?: string;
  id?: string;
  url?: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatTimestamp(date: Date, pattern: 'MMDDHHmm' | 'YYYYMMDDHHmm'): string {
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  if (pattern === 'MMDDHHmm') {
    return `${month}${day}${hours}${minutes}`;
  }
  return `${date.getFullYear()}${month}${day}${hours}${minutes}`;
}

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

async function waitForBuild(
  repoId: number,
  branch: string,
  buildId: number,
  timeoutSeconds: number,
  intervalSeconds: number,
  onProgress?: (text: string) => void,
): Promise<BuildRecord> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let attempt = 0;
  const interrupter = createInterruptibleSleep();
  try {
    while (true) {
      attempt += 1;
      const response = (await getApi().request('POST', '/alpha/ci/build/list', {
        body: { repoId, branch, page: 1, count: 20 },
      })) as BuildListResponse;
      const list = Array.isArray(response?.list) ? response.list : [];
      const target = list.find((item) => Number(item.id) === buildId);

      if (target) {
        const status = typeof target.status === 'string' ? target.status : '';
        onProgress?.(`[poll #${attempt}] buildId=${buildId} status=${status}`);
        if (status === 'success') return target;
        if (status === 'error' || status === 'failed') {
          throw new Error(`构建失败: repoId=${repoId} branch=${branch} buildId=${buildId} status=${status}`);
        }
      } else {
        onProgress?.(`[poll #${attempt}] buildId=${buildId} 暂未出现，继续等待...`);
      }

      if (Date.now() >= deadline) {
        throw new Error(`等待构建超时(${timeoutSeconds}秒): repoId=${repoId} branch=${branch} buildId=${buildId}`);
      }

      await interrupter.sleep(intervalSeconds * 1000);
    }
  } finally {
    interrupter.dispose();
  }
}

interface RuleItem {
  key: string;
  value: string;
  extraValue: Record<string, unknown>;
}

async function triggerBuild(
  repoId: number,
  branch: string,
  rules: RuleItem[],
  label: string,
  onProgress?: (text: string) => void,
): Promise<number> {
  onProgress?.(`[${label}] 触发 paramsBuild: repoId=${repoId} branch=${branch}`);
  const response = (await getApi().request('POST', '/alpha/ci/build/paramsBuild', {
    body: { branch, repoId, rules },
  })) as ParamsBuildResponse;
  const rawId = response?.buildId ?? response?.id;
  const buildId = Number(rawId);
  if (!Number.isFinite(buildId) || buildId <= 0) {
    throw new Error(`[${label}] paramsBuild 未返回有效 buildId: ${JSON.stringify(response)}`);
  }
  onProgress?.(`[${label}] paramsBuild 返回 buildId=${buildId}`);
  return buildId;
}

interface ChartsResult {
  chartsTarUrl: string;
  chartsImagesText: string;
}

async function buildCharts(
  repoId: number,
  branch: string,
  versions: string[],
  localPkgName: string,
  timeoutSeconds: number,
  intervalSeconds: number,
  onProgress?: (text: string) => void,
): Promise<ChartsResult> {
  const rules: RuleItem[] = [
    {
      key: 'pkg_name',
      value: localPkgName,
      extraValue: { projects: 'xj', destination: 'hzcore' },
    },
    {
      key: 'charts',
      value: versions.join('\n'),
      extraValue: { projects: 'xj', destination: 'hzcore' },
    },
  ];
  const buildId = await triggerBuild(repoId, branch, rules, 'charts', onProgress);
  const buildItem = await waitForBuild(repoId, branch, buildId, timeoutSeconds, intervalSeconds, onProgress);

  const version = typeof buildItem.version === 'string' ? buildItem.version : '';
  const simpleVersion = version.includes(':') ? version.split(':')[1] : version;
  if (!simpleVersion) {
    throw new Error(`charts 构建结果缺少 version: ${JSON.stringify(buildItem)}`);
  }
  const dashIndex = simpleVersion.lastIndexOf('-');
  const buildNumber = dashIndex >= 0 ? simpleVersion.slice(dashIndex + 1) : simpleVersion;

  const chartsTarUrl = `${RELEASE_BASE_URL}/${CHARTS_REPO_NAME}/${simpleVersion}/pkg-xj-hzcore-charts-${buildNumber}.tar.gz`;
  const chartsImagesUrl = `${RELEASE_BASE_URL}/${CHARTS_REPO_NAME}/${simpleVersion}/images.txt`;

  onProgress?.(`[charts] 下载 images.txt: ${chartsImagesUrl}`);
  // 该 URL 是公开静态资源，故意不走鉴权/重试；用 axios + timeout 避免无超时挂起。
  const resp = await axios.get<string>(chartsImagesUrl, { timeout: RELEASE_FETCH_TIMEOUT_MS, responseType: 'text' });
  const text = typeof resp.data === 'string' ? resp.data : String(resp.data ?? '');
  if (text.includes('404 Not Found')) {
    throw new Error(`构建失败: ${version}`);
  }

  return { chartsTarUrl, chartsImagesText: text };
}

interface ImagesResult {
  imagesTarUrl: string;
  pkgName: string;
  id: string;
}

async function buildImages(
  repoId: number,
  branch: string,
  chartsImagesText: string,
  arch: 'linux/amd64' | 'linux/arm64',
  localPkgName: string,
  timeoutSeconds: number,
  intervalSeconds: number,
  onProgress?: (text: string) => void,
): Promise<ImagesResult> {
  const rules: RuleItem[] = [
    { key: 'pkg_name', value: localPkgName, extraValue: {} },
    { key: 'images', value: chartsImagesText, extraValue: {} },
    { key: 'APP_TAG', value: '', extraValue: { style: arch } },
  ];
  const buildId = await triggerBuild(repoId, branch, rules, 'images', onProgress);
  const buildItem = await waitForBuild(repoId, branch, buildId, timeoutSeconds, intervalSeconds, onProgress);

  const version = typeof buildItem.version === 'string' ? buildItem.version : '';
  const id = version.includes(':') ? version.split(':')[1] : version;
  if (!id) {
    throw new Error(`images 构建结果缺少 version: ${JSON.stringify(buildItem)}`);
  }

  const pkgName = `pkg-${localPkgName}-${id}.tar`;
  const imagesTarUrl = `${RELEASE_BASE_URL}/${IMAGES_REPO_NAME}/${id}/pkg-${localPkgName}-aio-${id}.tar`;
  return { imagesTarUrl, pkgName, id };
}

function resolveRepoId(list: RepoListItem[], name: string, fallbackId: number): number {
  const matched = list.find((item) => typeof item.name === 'string' && item.name === name);
  const raw = matched?.id;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : fallbackId;
}

interface MaterialEntry {
  fileId: string;
  name: string;
}

async function uploadLocalMaterial(
  path: string,
  city: string,
  now: Date,
): Promise<MaterialEntry> {
  const uploadResp = (await getApi().request('POST', '/alpha/deploy/material/upload', {
    files: [path],
  })) as MaterialUploadResponse;
  const fileId = uploadResp?.fileId ?? uploadResp?.id;
  if (typeof fileId !== 'string' || fileId.length === 0) {
    throw new Error(`material/upload 未返回 fileId: ${JSON.stringify(uploadResp)}`);
  }
  const name = `local-material-${city}-${formatTimestamp(now, 'YYYYMMDDHHmm')}`;
  await getApi().request('POST', '/alpha/deploy/material/add', {
    body: { info: name, name, url: fileId },
  });
  return { fileId, name };
}

async function registerRemoteMaterial(remoteUrl: string, city: string, now: Date): Promise<MaterialEntry> {
  const name = `remote-material-${city}-${formatTimestamp(now, 'YYYYMMDDHHmm')}`;
  await getApi().request('POST', '/alpha/deploy/material/add', {
    body: { info: name, name, url: remoteUrl },
  });
  return { fileId: remoteUrl, name };
}

const pushPkgSchema = {
  versions: z.array(z.string()).min(1).describe('要推送的版本列表，元素为 appName:version 格式，例如 ["jwsp-office-automation:3.0.0-319751"]'),
  arch: z.enum(['linux/amd64', 'linux/arm64']).default('linux/amd64').describe('镜像架构，默认 linux/amd64'),
  city: z.string().trim().min(1).describe('rsync 推送目标城市，例如 hzcore'),
  files: z.array(z.string()).optional().describe('可选，本地物料文件路径或远程 URL 列表'),
  includeChart: z.boolean().default(false).describe('是否在推送时携带 chart 包'),
  materialDescription: z.string().trim().optional().describe('可选物料描述'),
  noPush: z.boolean().default(false).describe('不推送到远程服务器，仅生成下载链接'),
  chartsTimeoutSeconds: z.number().int().positive().default(600).describe('charts 构建等待超时（秒），默认 600'),
  imagesTimeoutSeconds: z.number().int().positive().default(600).describe('images 构建等待超时（秒），默认 600'),
  pollIntervalSeconds: z.number().int().positive().default(5).describe('轮询间隔（秒），默认 5'),
  verbose: z.boolean().default(false).describe('是否把进度打印到 stderr（默认静默）'),
  confirm: z.boolean().optional().default(false).describe('写操作必须传 confirm=true 才会真正执行；不传或 false 时只返回 preview。'),
};

export function registerPushTools(server: CliRegistry): void {
  server.tool(
    'pushPkg',
    pushPkgSchema,
    async (input) => {
      const execute = async () => {
        const makeProgress = (text: string): void => {
          if (input.verbose) {
            process.stderr.write(`[pushPkg] ${text}\n`);
          }
        };

        const repoList = (await getApi().request('POST', '/alpha/ci/repo/list', {})) as RepoListItem[];
        const repos = Array.isArray(repoList) ? repoList : [];
        const chartsRepoId = resolveRepoId(repos, CHARTS_REPO_NAME, CHARTS_REPO_FALLBACK_ID);
        const imagesRepoId = resolveRepoId(repos, IMAGES_REPO_NAME, IMAGES_REPO_FALLBACK_ID);
        makeProgress(`charts repoId=${chartsRepoId} (${CHARTS_REPO_NAME}), images repoId=${imagesRepoId} (${IMAGES_REPO_NAME})`);

        const chartsStart = new Date();
        const chartsPkgName = `1.0.0-${formatTimestamp(chartsStart, 'MMDDHHmm')}`;
        const chartsResult = await buildCharts(
          chartsRepoId,
          MASTER_BRANCH,
          input.versions,
          chartsPkgName,
          input.chartsTimeoutSeconds,
          input.pollIntervalSeconds,
          makeProgress,
        );

        const imagesStart = new Date();
        const imagesPkgName = `1.0.0-${formatTimestamp(imagesStart, 'MMDDHHmm')}`;
        const imagesResult = await buildImages(
          imagesRepoId,
          MASTER_BRANCH,
          chartsResult.chartsImagesText,
          input.arch,
          imagesPkgName,
          input.imagesTimeoutSeconds,
          input.pollIntervalSeconds,
          makeProgress,
        );

        const materialUrls: string[] = [];
        const materialNames: string[] = [];
        if (input.files && input.files.length > 0) {
          const now = new Date();
          for (const item of input.files) {
            const isRemote = /^https?:\/\//i.test(item);
            const entry = isRemote
              ? await registerRemoteMaterial(item, input.city, now)
              : await uploadLocalMaterial(item, input.city, now);
            materialUrls.push(entry.fileId);
            materialNames.push(entry.name);
          }
        }

        const downloadLinks: string[] = [imagesResult.imagesTarUrl, ...materialUrls];
        if (input.includeChart && chartsResult.chartsTarUrl) {
          downloadLinks.push(chartsResult.chartsTarUrl);
        }

        const baseResult = {
          pushed: false as boolean,
          versions: input.versions,
          city: input.city,
          arch: input.arch,
          pkgName: imagesResult.pkgName,
          imagesTarUrl: imagesResult.imagesTarUrl,
          chartsTarUrl: input.includeChart ? chartsResult.chartsTarUrl : undefined,
          materialUrls,
          materialNames,
          materialDescription: input.materialDescription,
          includeChart: input.includeChart,
          downloadLinks,
        };

        if (input.noPush) {
          return jsonResult(
            withToolMeta(baseResult, {
              source: 'push',
              command: 'pushPkg',
              method: 'orchestrate',
              group: 'push',
            }),
          );
        }

        const sshResult: OpsPushResult = await opsPush({
          urls: downloadLinks,
          pkgName: imagesResult.pkgName,
          city: input.city,
          includeChart: input.includeChart,
          onProgress: input.verbose
            ? (text: string) => process.stderr.write(`[pushPkg] ${text}\n`)
            : () => {},
        });

        const stagesSeconds = {
          login: Math.round(sshResult.stages.login / 1000),
          download: Math.round(sshResult.stages.download / 1000),
          tar: Math.round(sshResult.stages.tar / 1000),
          rsync: Math.round(sshResult.stages.rsync / 1000),
        };
        const totalSeconds =
          stagesSeconds.login +
          stagesSeconds.download +
          stagesSeconds.tar +
          stagesSeconds.rsync;

        const finalResult = {
          ...baseResult,
          pushed: sshResult.transferred,
          targetPath: sshResult.targetPath,
          transferred: sshResult.transferred,
          stages: stagesSeconds,
          totalSeconds,
        };

        return jsonResult(
          withToolMeta(finalResult, {
            source: 'push',
            command: 'pushPkg',
            method: 'orchestrate',
            group: 'push',
          }),
        );
      };

      const preview = await runWithPreview(
        'pushPkg',
        {
          versions: input.versions,
          arch: input.arch,
          city: input.city,
          files: input.files,
          includeChart: input.includeChart,
          noPush: input.noPush,
        },
        input.confirm,
        execute,
      );
      return jsonResult(preview);
    },
    {
      group: 'push',
      description: '一键推送包:选版本→构建charts→构建images→上传物料→SSH推送到城市。',
      examples: [
        'alpha pushPkg --versions jwsp-office-automation:3.0.0-319751 --city hzcore',
        'alpha pushPkg --versions a:1.0.0-1 --versions b:2.0.0-2 --arch linux/arm64 --city hzcore --includeChart true',
        'alpha pushPkg --versions a:1.0.0-1 --city hzcore --noPush true',
        'alpha pushPkg --versions a:1.0.0-1 --city hzcore --confirm true',
      ],
      costHint: 'high',
      nextBestTools: ['ciBuildFind', 'ciBuildWait', 'opsPush', 'deployMaterialUpload'],
      recommendations: [
        {
          tool: 'opsPush',
          reason: '基于当前产物下载链接直接重新推送到目标城市',
          priority: 2,
          args: {
            urls: { source: 'payload', path: 'downloadLinks' },
            pkgName: { source: 'payload', path: 'pkgName' },
            city: { source: 'payload', path: 'city' },
            includeChart: { source: 'payload', path: 'includeChart' },
          },
        },
        {
          tool: 'ciBuildFind',
          reason: '继续核对本次版本对应的构建记录',
          priority: 1,
          args: {
            app: { source: 'input', path: 'versions.0' },
          },
        },
        {
          tool: 'deployMaterialUpload',
          reason: '补充上传额外物料文件',
          priority: 0,
        },
      ],
    },
  );
}
