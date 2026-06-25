import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { AlphaConfig, OpsConfig } from '../types/common.js';

const CONFIG_DIR = path.join(homedir(), '.alpha');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const LEGACY_CONFIG_DIR = path.join(homedir(), '.alpha-cli');
const LEGACY_CONFIG_FILE = path.join(LEGACY_CONFIG_DIR, 'config.json');

function normalizeServerUrl(url: string): string {
  const trimmed = url.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/+$/, '');
}

export function maskConfig(config: AlphaConfig): AlphaConfig {
  return {
    ...config,
    token: config.token ? '******' : undefined,
    password: config.password ? '******' : undefined,
    sshUser: config.sshUser,
    sshPass: config.sshPass ? '******' : undefined,
    ops: config.ops,
  };
}

export function normalizeConfig(config: Partial<AlphaConfig>): AlphaConfig {
  const url = requireNonBlank(config.url, '缺少 Alpha 服务地址 url');
  return {
    url: normalizeServerUrl(url),
    token: normalizeOptionalText(config.token),
    username: normalizeOptionalText(config.username),
    password: normalizeOptionalText(config.password),
    timeoutMs: normalizeTimeoutMs(config.timeoutMs) ?? 30_000,
    ops: normalizeOpsConfig(config.ops),
    // sshUser/sshPass 不落盘，仅从环境变量或运行时入参传入；normalize 时保留运行时入参
    sshUser: normalizeOptionalText(config.sshUser),
    sshPass: normalizeOptionalText(config.sshPass),
  };
}

function normalizeOpsConfig(ops: unknown): OpsConfig | undefined {
  if (!isRecord(ops)) return undefined;
  const cities = Array.isArray(ops.cities)
    ? ops.cities.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : undefined;
  const normalized: OpsConfig = {};
  const bastionHost = normalizeOptionalText(ops.bastionHost);
  if (bastionHost) normalized.bastionHost = bastionHost;
  const targetServer = normalizeOptionalText(ops.targetServer);
  if (targetServer) normalized.targetServer = targetServer;
  const systemUserId = normalizeOptionalText(ops.systemUserId);
  if (systemUserId) normalized.systemUserId = systemUserId;
  const downloadDir = normalizeOptionalText(ops.downloadDir);
  if (downloadDir) normalized.downloadDir = downloadDir;
  const rsyncScript = normalizeOptionalText(ops.rsyncScript);
  if (rsyncScript) normalized.rsyncScript = rsyncScript;
  const rsyncBasePath = normalizeOptionalText(ops.rsyncBasePath);
  if (rsyncBasePath) normalized.rsyncBasePath = rsyncBasePath;
  const rsyncTargetBase = normalizeOptionalText(ops.rsyncTargetBase);
  if (rsyncTargetBase) normalized.rsyncTargetBase = rsyncTargetBase;
  if (cities && cities.length > 0) normalized.cities = cities;
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function loadConfig(): AlphaConfig | null {
  const envConfig: Partial<AlphaConfig> = {
    url: normalizeOptionalEnvValue(process.env.ALPHA_URL),
    token: normalizeOptionalEnvValue(process.env.ALPHA_TOKEN),
    username: normalizeOptionalEnvValue(process.env.ALPHA_USERNAME) || normalizeOptionalEnvValue(process.env.ALPHA_ACCOUNT),
    password: normalizeOptionalEnvValue(process.env.ALPHA_PASSWORD),
    timeoutMs: parseOptionalTimeoutMs(process.env.ALPHA_TIMEOUT_MS),
    // SSH 凭据只来自环境变量或运行时入参，不落 config.json
    sshUser: normalizeOptionalEnvValue(process.env.ALPHA_SSH_USER),
    sshPass: normalizeOptionalEnvValue(process.env.ALPHA_SSH_PASS),
    ops: loadOpsEnvConfig(),
  };

  const hasAnyEnvOverride = Object.values(envConfig).some((value) => value !== undefined && value !== '');

  if (!existsSync(CONFIG_FILE)) {
    if (existsSync(LEGACY_CONFIG_FILE)) {
      const raw = readConfigFile(LEGACY_CONFIG_FILE);
      return hasAnyEnvOverride ? normalizeConfig(mergeWithEnv(raw, envConfig)) : normalizeConfig(raw);
    }
    return envConfig.url ? normalizeConfig(envConfig) : null;
  }

  const raw = readConfigFile(CONFIG_FILE);
  if (!hasAnyEnvOverride) return normalizeConfig(raw);

  const merged: Partial<AlphaConfig> = {
    ...raw,
    ...Object.fromEntries(
      Object.entries(envConfig).filter(([, value]) => value !== undefined && value !== ''),
    ),
  };
  // ops 段需要单独深合并：env 部分覆盖 config.json 的 ops 段，而非整体替换
  if (raw.ops || envConfig.ops) {
    merged.ops = mergeOpsConfig(raw.ops, envConfig.ops);
  }
  return normalizeConfig(merged);
}

function mergeWithEnv(raw: Partial<AlphaConfig>, envConfig: Partial<AlphaConfig>): Partial<AlphaConfig> {
  const merged: Partial<AlphaConfig> = {
    ...raw,
    ...Object.fromEntries(
      Object.entries(envConfig).filter(([, value]) => value !== undefined && value !== ''),
    ),
  };
  if (raw.ops || envConfig.ops) {
    merged.ops = mergeOpsConfig(raw.ops, envConfig.ops);
  }
  return merged;
}

/**
 * 加载运维操作环境变量覆盖（ALPHA_OPS_*）。
 */
function loadOpsEnvConfig(): OpsConfig | undefined {
  const ops: OpsConfig = {};
  const bastionHost = normalizeOptionalEnvValue(process.env.ALPHA_OPS_BASTION);
  if (bastionHost) ops.bastionHost = bastionHost;
  const targetServer = normalizeOptionalEnvValue(process.env.ALPHA_OPS_TARGET);
  if (targetServer) ops.targetServer = targetServer;
  const systemUserId = normalizeOptionalEnvValue(process.env.ALPHA_OPS_SYSTEM_USER_ID);
  if (systemUserId) ops.systemUserId = systemUserId;
  const downloadDir = normalizeOptionalEnvValue(process.env.ALPHA_OPS_DOWNLOAD_DIR);
  if (downloadDir) ops.downloadDir = downloadDir;
  const rsyncScript = normalizeOptionalEnvValue(process.env.ALPHA_OPS_RSYNC_SCRIPT);
  if (rsyncScript) ops.rsyncScript = rsyncScript;
  const rsyncBasePath = normalizeOptionalEnvValue(process.env.ALPHA_OPS_RSYNC_BASE_PATH);
  if (rsyncBasePath) ops.rsyncBasePath = rsyncBasePath;
  const rsyncTargetBase = normalizeOptionalEnvValue(process.env.ALPHA_OPS_RSYNC_TARGET_BASE);
  if (rsyncTargetBase) ops.rsyncTargetBase = rsyncTargetBase;
  const cities = normalizeOptionalEnvValue(process.env.ALPHA_OPS_CITIES);
  if (cities) ops.cities = cities.split(',').map((item) => item.trim()).filter(Boolean);
  return Object.keys(ops).length > 0 ? ops : undefined;
}

function mergeOpsConfig(base: unknown, override: unknown): OpsConfig | undefined {
  const baseOps = isRecord(base) ? base : {};
  const overrideOps = isRecord(override) ? override : {};
  return normalizeOpsConfig({ ...baseOps, ...overrideOps });
}

export function saveConfig(config: AlphaConfig): void {
  const normalized = normalizeConfig(config);
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
}

function readConfigFile(filePath: string = CONFIG_FILE): Partial<AlphaConfig> {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    if (!isRecord(parsed)) {
      throw new Error('配置内容必须是 JSON 对象');
    }
    return parsed as Partial<AlphaConfig>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Alpha 配置文件损坏，请检查 ${filePath}：${message}`);
  }
}

function requireNonBlank(value: unknown, message: string): string {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  throw new Error(message);
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized === '' ? undefined : normalized;
}

function normalizeOptionalEnvValue(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized === '' ? undefined : normalized;
}

function parseOptionalTimeoutMs(value: string | undefined): number | undefined {
  const normalized = normalizeOptionalEnvValue(value);
  if (!normalized) return undefined;

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`ALPHA_TIMEOUT_MS 必须是正整数，收到: ${value}`);
  }

  return parsed;
}

function normalizeTimeoutMs(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;

  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.trim())
      : Number.NaN;

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`timeoutMs 必须是正整数，收到: ${String(value)}`);
  }

  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
