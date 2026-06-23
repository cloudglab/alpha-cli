import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { AlphaConfig } from '../types/common.js';

const CONFIG_DIR = path.join(homedir(), '.alpha-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

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
  };
}

export function loadConfig(): AlphaConfig | null {
  const envConfig = {
    url: normalizeOptionalEnvValue(process.env.ALPHA_URL),
    token: normalizeOptionalEnvValue(process.env.ALPHA_TOKEN),
    username: normalizeOptionalEnvValue(process.env.ALPHA_USERNAME) || normalizeOptionalEnvValue(process.env.ALPHA_ACCOUNT),
    password: normalizeOptionalEnvValue(process.env.ALPHA_PASSWORD),
    timeoutMs: parseOptionalTimeoutMs(process.env.ALPHA_TIMEOUT_MS),
  };

  const hasAnyEnvOverride = Object.values(envConfig).some((value) => value !== undefined && value !== '');

  if (!existsSync(CONFIG_FILE)) {
    return envConfig.url ? normalizeConfig(envConfig) : null;
  }

  const raw = readConfigFile();
  if (!hasAnyEnvOverride) return normalizeConfig(raw);

  return normalizeConfig({
    ...raw,
    ...Object.fromEntries(Object.entries(envConfig).filter(([, value]) => value !== undefined && value !== '')),
  });
}

export function saveConfig(config: AlphaConfig): void {
  const normalized = normalizeConfig(config);
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
}

function readConfigFile(): Partial<AlphaConfig> {
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as unknown;
    if (!isRecord(parsed)) {
      throw new Error('配置内容必须是 JSON 对象');
    }
    return parsed as Partial<AlphaConfig>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Alpha 配置文件损坏，请检查 ${CONFIG_FILE}：${message}`);
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
