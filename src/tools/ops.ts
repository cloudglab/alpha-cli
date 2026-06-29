import { z } from 'zod';
import type { CliRegistry } from '../core/cli-registry.js';
import { opsPush, type OpsPushOptions, type OpsPushResult } from '../core/ssh.js';
import type { OpsConfig } from '../types/common.js';
import { jsonResult, runWithPreview, withToolMeta } from './shared.js';

/**
 * 运维命令清单：tool-registry 用它把命令路由到 ops 加载器。
 * 显式声明为 readonly string[]，便于外部以宽松 string 形式调用 includes。
 */
export const OPS_COMMAND_NAMES: readonly string[] = ['opsPush'];

/**
 * 判断一个命令名是否属于 ops 自定义命令集合。
 */
export function isOpsCommand(name: string): boolean {
  return OPS_COMMAND_NAMES.includes(name as never);
}

const opsPushSchema = {
  urls: z.array(z.string()).min(1).describe('待下载的 URL 列表（镜像包 / chart 包 / 物料），至少 1 个'),
  pkgName: z.string().trim().min(1).describe('tar 打包文件名，例如 pkg-1.0.0-MMDDHHmm-aio-xxx.tar'),
  city: z.string().trim().min(1).describe('rsync 推送目标城市，例如 hzcore'),
  includeChart: z.boolean().default(false).describe('是否同时下载 chart 包（仅作 meta 标记）'),
  bastionHost: z.string().trim().optional().describe('运行时覆盖堡垒机地址'),
  targetServer: z.string().trim().optional().describe('运行时覆盖目标服务器地址'),
  systemUserId: z.string().trim().optional().describe('运行时覆盖堡垒机登录的系统用户ID'),
  downloadDir: z.string().trim().optional().describe('运行时覆盖目标机下载/打包目录'),
  rsyncScript: z.string().trim().optional().describe('运行时覆盖 rsync 推送脚本路径'),
  sshUser: z.string().trim().optional().describe('运行时 SSH 账号（覆盖 ALPHA_SSH_USER）'),
  sshPass: z.string().trim().optional().describe('运行时 SSH 密码（覆盖 ALPHA_SSH_PASS）'),
  verbose: z.boolean().default(false).describe('是否把 SSH 推送进度打印到 stderr（默认静默）'),
  confirm: z.boolean().optional().default(false).describe('写操作必须传 confirm=true 才会真正执行；不传或 false 时只返回 preview。'),
};

export function registerOpsTools(server: CliRegistry): void {
  server.tool(
    'opsPush',
    opsPushSchema,
    async (input) => {
      const execute = async () => {
        const opsOverrides: Partial<OpsConfig> = {};
        if (input.bastionHost) opsOverrides.bastionHost = input.bastionHost;
        if (input.targetServer) opsOverrides.targetServer = input.targetServer;
        if (input.systemUserId) opsOverrides.systemUserId = input.systemUserId;
        if (input.downloadDir) opsOverrides.downloadDir = input.downloadDir;
        if (input.rsyncScript) opsOverrides.rsyncScript = input.rsyncScript;

        const options: OpsPushOptions = {
          urls: input.urls,
          pkgName: input.pkgName,
          city: input.city,
          includeChart: input.includeChart,
          ops: opsOverrides,
          sshUser: input.sshUser,
          sshPass: input.sshPass,
          ...(input.verbose
            ? {
                onProgress: (text: string) => {
                  process.stderr.write(`[opsPush] ${text}\n`);
                },
              }
            : {}),
        };

        const result: OpsPushResult = await opsPush(options);
        const stagesSeconds = {
          login: Math.round(result.stages.login / 1000),
          download: Math.round(result.stages.download / 1000),
          tar: Math.round(result.stages.tar / 1000),
          rsync: Math.round(result.stages.rsync / 1000),
        };
        const totalSeconds =
          stagesSeconds.login +
          stagesSeconds.download +
          stagesSeconds.tar +
          stagesSeconds.rsync;

        return jsonResult(
          withToolMeta(
            {
              pkgName: result.pkgName,
              city: result.city,
              targetPath: result.targetPath,
              transferred: result.transferred,
              stages: stagesSeconds,
              totalSeconds,
            },
            {
              source: 'ops',
              command: 'opsPush',
              method: 'ssh-push',
              group: 'ops',
            },
          ),
        );
      };

      const preview = await runWithPreview(
        'opsPush',
        {
          urls: input.urls,
          pkgName: input.pkgName,
          city: input.city,
          includeChart: input.includeChart,
        },
        input.confirm,
        execute,
      );
      return jsonResult(preview);
    },
    {
      group: 'ops',
      description: '通过堡垒机登录目标服务器,下载 URL 列表、打包并用 rsync 推送到指定城市。',
      examples: [
        'alpha opsPush --urls http://devops.cloudglab.cn/release/job-glab-pkg_images/319751/pkg-1.0.0-aio-319751.tar --pkgName pkg-1.0.0-319751.tar --city hzcore',
        'alpha opsPush --urls http://a.tar --urls http://b.tar --pkgName pkg.tar --city hzcore --verbose',
        'alpha opsPush --urls http://a.tar --pkgName pkg.tar --city hzcore --confirm true',
      ],
      costHint: 'high',
      nextBestTools: ['pushPkg', 'deployMaterialUpload', 'ciBuildParamsBuild'],
      recommendations: [
        {
          tool: 'pushPkg',
          reason: '下次可直接走一键推包链路',
          priority: 0,
          args: {
            city: { source: 'payload', path: 'city' },
          },
        },
        {
          tool: 'deployMaterialUpload',
          reason: '补充上传更多本地物料到 Alpha',
          priority: -1,
        },
      ],
    },
  );
}
