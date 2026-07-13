export type Role = 'full' | 'ci' | 'deploy' | 'iter' | 'rbac' | 'file' | 'ops';

/**
 * 运维操作配置段：承接 one-shot ServerConfig 的堡垒机/目标机/下载目录等约定。
 * 账密不落 config.json，只走环境变量（ALPHA_SSH_USER/ALPHA_SSH_PASS）或运行时入参。
 */
export interface OpsConfig {
  /** 堡垒机地址，例如 192.168.60.101 */
  bastionHost?: string;
  /** 目标服务器地址，例如 192.168.8.45 */
  targetServer?: string;
  /** 堡垒机登录的系统用户 ID，例如 "1" */
  systemUserId?: string;
  /** 目标机下载/打包目录，默认 /data/pkg_release/fz_downloads */
  downloadDir?: string;
  /** rsync 推送脚本路径，默认 /data/pkg_release/rsync.sh */
  rsyncScript?: string;
  /** rsync 临时检测路径前缀，默认 /data/ftp/data_sync/pro */
  rsyncBasePath?: string;
  /** 推送目标路径前缀，默认 /data/ftp，最终落到 /data/ftp/{city}_upload */
  rsyncTargetBase?: string;
  /** 支持的城市列表 */
  cities?: string[];
}

export interface AlphaConfig {
  url: string;
  token?: string;
  username?: string;
  password?: string;
  timeoutMs: number;
  /** 是否跳过 TLS 证书校验（内网自签证书），默认 false */
  insecure?: boolean;
  /** 运维操作配置段，可选 */
  ops?: OpsConfig;
  /** SSH 账号（仅来自环境变量或运行时，不落盘） */
  sshUser?: string;
  /** SSH 密码（仅来自环境变量或运行时，不落盘） */
  sshPass?: string;
}

export interface JsonContentResult {
  [key: string]: unknown;
  content: Array<{
    type: 'text';
    text: string;
  }>;
}
