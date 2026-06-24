import { Client } from 'ssh2';
import { loadConfig } from './config.js';
import type { OpsConfig } from '../types/common.js';

/**
 * opsPush 单次执行的入参。
 * urls/pkgName/city 由上层 push 逻辑决定，opsConfig/ssh 凭据来自配置或运行时覆盖。
 */
export interface OpsPushOptions {
  /** 待下载的 URL 列表（镜像包、chart 包、物料 URL） */
  urls: string[];
  /** 最终 tar 打包文件名，例如 pkg-1.0.0-MMDDHHmm-aio-xxx.tar */
  pkgName: string;
  /** rsync 推送目标城市，例如 hzcore */
  city: string;
  /** 是否同时下载 chart 包（影响 urls 拼装由上层负责，本封装只看 urls） */
  includeChart?: boolean;
  /** ops 配置覆盖（运行时入参优先于 config.json） */
  ops?: Partial<OpsConfig>;
  /** SSH 账密覆盖（运行时入参优先于环境变量） */
  sshUser?: string;
  sshPass?: string;
  /** 进度回调，可选 */
  onProgress?: (text: string) => void;
}

export interface OpsPushResult {
  pkgName: string;
  city: string;
  targetPath: string;
  transferred: boolean;
  /** 各阶段耗时（毫秒），便于汇总 */
  stages: {
    login: number;
    download: number;
    tar: number;
    rsync: number;
  };
}

export interface ResolvedOpsConfig extends Required<
  Omit<OpsConfig, 'cities'>
> {
  cities?: string[];
}

const DEFAULT_DOWNLOAD_DIR = '/data/pkg_release/fz_downloads';
const DEFAULT_RSYNC_SCRIPT = '/data/pkg_release/rsync.sh';
const DEFAULT_RSYNC_BASE_PATH = '/data/ftp/data_sync/pro';
const DEFAULT_RSYNC_TARGET_BASE = '/data/ftp';

const LOGIN_TIMEOUT_MS = 10_000;
const DOWNLOAD_MAX_RETRY = 3;
const DOWNLOAD_RETRY_DELAY_MS = 5_000;
const RSYNC_MAX_CHECK_ATTEMPTS = 6000;
const RSYNC_CHECK_INTERVAL_MS = 1000;
const CONNECT_READY_TIMEOUT_MS = 30_000;
const KEEPALIVE_INTERVAL_MS = 10_000;

type LoginStatus = 'pending' | 'connecting' | 'waiting' | 'success' | 'failed' | 'finished' | undefined;
type DownloadStatus = 'started' | 'success' | 'failed' | 'process' | 'retrying' | undefined;
type TarStatus = 'started' | 'success' | 'failed' | 'process' | undefined;
type RsyncStatus = 'started' | 'success' | 'failed' | 'process' | 'finished' | undefined;

interface StreamState {
  loginStatus: LoginStatus;
  rsyncStatus: RsyncStatus;
  downloadStatus: DownloadStatus;
  tarStatus: TarStatus;
  checkCount: number;
  buffer: string;
  downloadCount: number;
  downloadRetryCount: number;
  loginAttemptTime: number | null;
  loginStart: number;
}

/**
 * 解析 ops 配置：运行时入参 > 配置文件 ops 段 > 内置默认值。
 */
export function resolveOpsConfig(overrides?: Partial<OpsConfig>): ResolvedOpsConfig {
  const config = loadConfig();
  const ops: OpsConfig = { ...(config?.ops ?? {}), ...(overrides ?? {}) };
  return {
    bastionHost: ops.bastionHost ?? '',
    targetServer: ops.targetServer ?? '',
    systemUserId: ops.systemUserId ?? '',
    downloadDir: ops.downloadDir ?? DEFAULT_DOWNLOAD_DIR,
    rsyncScript: ops.rsyncScript ?? DEFAULT_RSYNC_SCRIPT,
    rsyncBasePath: ops.rsyncBasePath ?? DEFAULT_RSYNC_BASE_PATH,
    rsyncTargetBase: ops.rsyncTargetBase ?? DEFAULT_RSYNC_TARGET_BASE,
    cities: ops.cities,
  };
}

/**
 * 解析 SSH 凭据：运行时入参 > 环境变量。
 * 不读 config.json（账密永不落盘）。
 */
export function resolveSshCredentials(overrides?: { sshUser?: string; sshPass?: string }): {
  username: string;
  password: string;
} {
  const config = loadConfig();
  const username = overrides?.sshUser || config?.sshUser || '';
  const password = overrides?.sshPass || config?.sshPass || '';
  if (!username || !password) {
    throw new Error(
      '缺少 SSH 凭据。请设置 ALPHA_SSH_USER/ALPHA_SSH_PASS，或在命令运行时传入 sshUser/sshPass。',
    );
  }
  return { username, password };
}

export function shellEscape(value: string): string {
  if (/^[A-Za-z0-9_\-./:]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * 登录堡垒机并推送到目标机：登录 → wget 下载 → tar 打包 → rsync 选城市推送 → 检测文件到位。
 * 复刻 one-shot 01.push-pkg.ts 的 pushPackages / handleSSHStream PTY 状态机。
 */
export function opsPush(options: OpsPushOptions): Promise<OpsPushResult> {
  const resolvedOps = resolveOpsConfig(options.ops);
  const { username, password } = resolveSshCredentials({ sshUser: options.sshUser, sshPass: options.sshPass });

  if (!resolvedOps.bastionHost) throw new Error('缺少堡垒机地址，请配置 ops.bastionHost');
  if (!resolvedOps.targetServer) throw new Error('缺少目标服务器地址，请配置 ops.targetServer');
  if (!resolvedOps.systemUserId) throw new Error('缺少系统用户ID，请配置 ops.systemUserId');
  if (options.urls.length === 0) throw new Error('没有可下载的文件 URL');

  const onProgress = options.onProgress ?? (() => {});

  return new Promise<OpsPushResult>((resolve, reject) => {
    const conn = new Client();
    const state: StreamState = {
      loginStatus: undefined,
      rsyncStatus: undefined,
      downloadStatus: undefined,
      tarStatus: undefined,
      checkCount: 0,
      buffer: '',
      downloadCount: 0,
      downloadRetryCount: 0,
      loginAttemptTime: null,
      loginStart: 0,
    };
    const stages = { login: 0, download: 0, tar: 0, rsync: 0 };

    let settled = false;
    const fail = (message: string): void => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch { /* ignore */ }
      reject(new Error(message));
    };
    const done = (result: OpsPushResult): void => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch { /* ignore */ }
      resolve(result);
    };

    conn.on('ready', () => {
      onProgress('SSH连接已建立，正在请求PTY...');
      conn.shell({ term: 'xterm-color' }, (err, stream) => {
        if (err) {
          fail(`请求伪终端失败: ${err.message}`);
          return;
        }
        onProgress('正在建立链接...');
        stream.on('data', (data: Buffer) => {
          state.buffer = data.toString();
          handleStream(stream, state, options, resolvedOps, stages, onProgress, done, fail);
        });
        stream.stderr.on('data', (data: Buffer) => {
          onProgress(`[stderr] ${data.toString()}`);
        });
        stream.on('close', () => {
          onProgress('SSH会话已关闭');
          if (!settled) {
            done({
              pkgName: options.pkgName,
              city: options.city,
              targetPath: `${resolvedOps.rsyncTargetBase}/${options.city}_upload`,
              transferred: state.rsyncStatus === 'finished',
              stages,
            });
          }
        });
      });
    });

    conn.on('error', (err) => fail(`SSH连接错误: ${err.message}`));
    conn.on('timeout', () => fail('SSH连接超时'));

    conn.connect({
      host: resolvedOps.bastionHost,
      port: 22,
      username,
      password,
      readyTimeout: CONNECT_READY_TIMEOUT_MS,
      keepaliveInterval: KEEPALIVE_INTERVAL_MS,
      tryKeyboard: true,
      algorithms: {
        serverHostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256', 'ssh-ed25519'],
      },
    });
  });
}

function handleStream(
  stream: { write: (input: string) => void; close?: () => void },
  state: StreamState,
  options: OpsPushOptions,
  ops: ResolvedOpsConfig,
  stages: OpsPushResult['stages'],
  onProgress: (text: string) => void,
  done: (result: OpsPushResult) => void,
  fail: (message: string) => void,
): void {
  if (state.rsyncStatus === 'finished') {
    stream.close?.();
    return;
  }

  const { loginStatus, downloadStatus, tarStatus } = state;
  try {
    if (loginStatus !== 'success' && loginStatus !== 'finished') {
      handleLoginPhase(stream, state, options, ops, onProgress, () => {
        stages.login = Date.now() - state.loginStart;
      });
      return;
    }

    if ((loginStatus === 'success' || loginStatus === 'finished') && (!downloadStatus || downloadStatus !== 'success')) {
      handleDownloadPhase(stream, state, options, ops, onProgress, () => {
        if (!stages.download) stages.download = Date.now() - state.loginStart - stages.login;
      }, fail);
      return;
    }

    if (downloadStatus === 'success' && (!tarStatus || tarStatus !== 'success')) {
      handleTarPhase(stream, state, options, ops, onProgress, () => {
        if (!stages.tar) stages.tar = Date.now() - state.loginStart - stages.login - stages.download;
      }, fail);
      return;
    }

    if (tarStatus === 'success') {
      handleRsyncPhase(stream, state, options, ops, stages, onProgress, () => {
        stages.rsync = Date.now() - state.loginStart - stages.login - stages.download - stages.tar;
      }, done, fail);
    }
  } catch (error) {
    onProgress(`处理出错: ${error instanceof Error ? error.message : '未知错误'}`);
    stream.close?.();
  }
}

function handleLoginPhase(
  stream: { write: (input: string) => void },
  state: StreamState,
  options: OpsPushOptions,
  ops: ResolvedOpsConfig,
  onProgress: (text: string) => void,
  onLoginSuccess: () => void,
): void {
  if (!state.loginStart) state.loginStart = Date.now();

  if (state.buffer.includes('Opt>') && !state.buffer.includes('ID>') && state.loginStatus !== 'success') {
    onProgress('连接堡垒机...');
    state.loginStatus = 'pending';
    stream.write(`${ops.targetServer}\r`);
    return;
  }

  if (state.buffer.includes('ID>') && state.loginStatus !== 'success') {
    onProgress('输入系统用户ID...');
    state.loginStatus = 'connecting';
    stream.write(`${ops.systemUserId}\r`);
    return;
  }

  if (state.buffer.includes('开始连接到') && state.loginStatus !== 'success') {
    state.loginStatus = 'connecting';
    onProgress('连接目标服务器...');
    return;
  }

  if (state.buffer.includes('复用SSH连接') && state.loginStatus !== 'success') {
    state.loginStatus = 'connecting';
    onProgress('复用SSH连接中...');
    return;
  }

  if (state.buffer.includes('Last login:') && state.loginStatus !== 'success') {
    state.loginStatus = 'waiting';
    onProgress('等待登录完成...');
    state.loginAttemptTime = Date.now();
    setTimeout(() => confirmLogin(stream, state, onProgress, onLoginSuccess), 1000);
    return;
  }

  if (
    state.loginStatus === 'waiting'
    && (state.buffer.match(/\[dev@.*\]/) || state.buffer.includes('ga-transform'))
    && state.buffer.includes('LOGIN_SUCCESS')
  ) {
    state.loginStatus = 'success';
    onProgress(`成功登录到 ${ops.targetServer} 服务器`);
    onLoginSuccess();
    onProgress('创建下载目录');
    void options; // options 预留
    stream.write(`mkdir -p ${ops.downloadDir}\r`);
    stream.write(`rm -r ${ops.downloadDir}/*\r`);
    stream.write(`cd ${ops.downloadDir}\r`);
    return;
  }

  if (state.loginStatus === 'waiting' && state.loginAttemptTime && Date.now() - state.loginAttemptTime > LOGIN_TIMEOUT_MS) {
    onProgress('登录确认超时，重新尝试...');
    confirmLogin(stream, state, onProgress, onLoginSuccess);
  }
}

function confirmLogin(
  stream: { write: (input: string) => void },
  state: StreamState,
  onProgress: (text: string) => void,
  onLoginSuccess: () => void,
): void {
  if (state.loginStatus === 'success' || state.loginStatus === 'failed' || state.loginStatus === 'finished') return;
  onProgress('正在确认登录状态...');
  stream.write('echo "LOGIN_SUCCESS"\r');
  state.loginStatus = 'waiting';
  state.loginAttemptTime = Date.now();
  void onLoginSuccess;
}

function handleDownloadPhase(
  stream: { write: (input: string) => void },
  state: StreamState,
  options: OpsPushOptions,
  ops: ResolvedOpsConfig,
  onProgress: (text: string) => void,
  onDownloadSuccess: () => void,
  fail: (message: string) => void,
): void {
  const urls = options.urls.filter(Boolean);
  if (urls.length === 0) {
    fail('没有可下载的文件');
    return;
  }
  const escapedUrls = urls.map((url) => shellEscape(url));
  const downloadCommand = `wget -q ${escapedUrls.join(' ')} && echo "DOWNLOAD_FINISHED" || echo "DOWNLOAD_FAILED"`;

  if (!state.downloadStatus) {
    state.loginStatus = 'finished';
    onProgress('开始下载文件...');
    if (options.includeChart) {
      onProgress('包含 Chart 包');
    }
    state.downloadStatus = 'started';
    stream.write(`${downloadCommand}\r`);
    state.downloadStatus = 'process';
    return;
  }

  if (
    state.downloadStatus === 'process'
    && state.buffer.includes('DOWNLOAD_FAILED')
    && !state.buffer.includes('DOWNLOAD_FINISHED')
  ) {
    state.downloadRetryCount = state.downloadRetryCount || 0;
    if (state.downloadRetryCount < DOWNLOAD_MAX_RETRY) {
      state.downloadRetryCount += 1;
      state.downloadStatus = 'retrying';
      onProgress(`文件下载失败，正在重试 (${state.downloadRetryCount}/${DOWNLOAD_MAX_RETRY})`);
      setTimeout(() => {
        stream.write(`cd ${ops.downloadDir} && rm -f *.tmp* *.part*\r`);
        setTimeout(() => {
          onProgress(`重新下载文件 (尝试 ${state.downloadRetryCount}/${DOWNLOAD_MAX_RETRY})...`);
          stream.write(`${downloadCommand}\r`);
          state.downloadStatus = 'process';
        }, 1000);
      }, DOWNLOAD_RETRY_DELAY_MS);
      return;
    }
    state.downloadStatus = 'failed';
    fail(`文件下载失败，已重试 ${DOWNLOAD_MAX_RETRY} 次`);
    return;
  }

  if (
    state.downloadStatus === 'process'
    && state.buffer.includes('DOWNLOAD_FINISHED')
    && !state.buffer.includes('DOWNLOAD_FAILED')
  ) {
    state.downloadStatus = 'success';
    const retryInfo = state.downloadRetryCount > 0 ? ` (重试了 ${state.downloadRetryCount} 次)` : '';
    onProgress(`所有推送文件下载完成${retryInfo}，存储路径: ${ops.downloadDir}`);
    onDownloadSuccess();
    stream.write('\r');
  }
}

function handleTarPhase(
  stream: { write: (input: string) => void },
  state: StreamState,
  options: OpsPushOptions,
  ops: ResolvedOpsConfig,
  onProgress: (text: string) => void,
  onTarSuccess: () => void,
  fail: (message: string) => void,
): void {
  if (!state.tarStatus) {
    onProgress('开始打包文件...');
    stream.write(`cd ${ops.downloadDir}\r`);
    state.tarStatus = 'started';
    stream.write(`tar -czf ${options.pkgName} * && echo "TAR_COMPLETED" || echo "TAR_FAILED"\r`);
    state.tarStatus = 'process';
    return;
  }

  if (state.tarStatus === 'process') {
    if (state.buffer.includes('TAR_COMPLETED')) {
      state.tarStatus = 'success';
      onProgress(`文件打包完成, 文件名: ${options.pkgName}`);
      onTarSuccess();
      onProgress('正在准备推送文件...');
      stream.write(`sh ${ops.rsyncScript} ${options.pkgName}\r`);
    } else if (state.buffer.includes('TAR_FAILED')) {
      state.tarStatus = 'failed';
      fail('tar 打包失败');
    }
  }
}

function handleRsyncPhase(
  stream: { write: (input: string) => void; close?: () => void },
  state: StreamState,
  options: OpsPushOptions,
  ops: ResolvedOpsConfig,
  stages: OpsPushResult['stages'],
  onProgress: (text: string) => void,
  onRsyncSuccess: () => void,
  done: (result: OpsPushResult) => void,
  fail: (message: string) => void,
): void {
  if (state.buffer.includes('请选择需要发送的城市 :') && !state.rsyncStatus) {
    state.rsyncStatus = 'started';
    onProgress(`输入目标城市: ${options.city}`);
    stream.write(`${options.city}\r`);
    return;
  }

  if (state.rsyncStatus === 'started') {
    if (state.buffer.includes('检查是否存在该文件')) {
      onProgress(`正在推送至: ${options.city}`);
      state.rsyncStatus = 'process';
      checkFileTransfer(stream, state, options, ops, onProgress, onRsyncSuccess, done, fail);
    } else if (state.buffer.includes('选择的城市有误') || state.buffer.includes('失败')) {
      state.rsyncStatus = 'failed';
      onProgress(`推送失败: 城市 ${options.city} 有误`);
      fail(`推送失败: 城市 ${options.city} 有误`);
    }
    return;
  }

  if (
    state.rsyncStatus === 'process'
    && state.buffer.includes('FILE_TRANSFERRED')
    && !state.buffer.includes('test -f')
  ) {
    onProgress(`文件: ${options.pkgName} 推送完成`);
    state.rsyncStatus = 'finished';
    onRsyncSuccess();
    stream.write('exit\r');
    stream.close?.();
    done({
      pkgName: options.pkgName,
      city: options.city,
      targetPath: `${ops.rsyncTargetBase}/${options.city}_upload`,
      transferred: true,
      stages,
    });
  }
}

function checkFileTransfer(
  stream: { write: (input: string) => void; close?: () => void },
  state: StreamState,
  options: OpsPushOptions,
  ops: ResolvedOpsConfig,
  onProgress: (text: string) => void,
  onRsyncSuccess: () => void,
  done: (result: OpsPushResult) => void,
  fail: (message: string) => void,
): void {
  if (state.rsyncStatus !== 'process') return;

  onProgress(`检测文件传输状态，检查次数: ${state.checkCount}`);
  const tempRsyncPath = `${ops.rsyncBasePath}/${options.city}/`;

  if (state.checkCount >= RSYNC_MAX_CHECK_ATTEMPTS) {
    state.rsyncStatus = 'failed';
    onProgress('推送超时，请手动确认状态');
    fail('推送超时，请手动确认状态');
    stream.write('exit\r');
    stream.close?.();
    return;
  }

  stream.write(`test -f ${tempRsyncPath}${options.pkgName} || echo "FILE_TRANSFERRED"\r`);
  state.checkCount += 1;

  setTimeout(() => {
    if (state.rsyncStatus === 'started' || state.rsyncStatus === 'process') {
      checkFileTransfer(stream, state, options, ops, onProgress, onRsyncSuccess, done, fail);
    }
  }, RSYNC_CHECK_INTERVAL_MS);
}
