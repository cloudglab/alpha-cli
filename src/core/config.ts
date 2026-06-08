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
  return `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, '');
}

export function maskConfig(config: AlphaConfig): AlphaConfig {
  return {
    ...config,
    token: config.token ? '******' : undefined,
    password: config.password ? '******' : undefined,
  };
}

export function normalizeConfig(config: Partial<AlphaConfig>): AlphaConfig {
  if (!config.url) throw new Error('缺少 Alpha 服务地址 url');
  return {
    url: normalizeServerUrl(config.url),
    token: config.token,
    username: config.username,
    password: config.password,
    timeoutMs: config.timeoutMs ?? 30_000,
  };
}

export function loadConfig(): AlphaConfig | null {
  const envConfig: Partial<AlphaConfig> = {
    url: process.env.ALPHA_URL,
    token: process.env.ALPHA_TOKEN,
    username: process.env.ALPHA_USERNAME || process.env.ALPHA_ACCOUNT,
    password: process.env.ALPHA_PASSWORD,
    timeoutMs: process.env.ALPHA_TIMEOUT_MS ? Number(process.env.ALPHA_TIMEOUT_MS) : undefined,
  };

  if (envConfig.url) return normalizeConfig(envConfig);
  if (!existsSync(CONFIG_FILE)) return null;

  const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as Partial<AlphaConfig>;
  return normalizeConfig(raw);
}

export function saveConfig(config: AlphaConfig): void {
  const normalized = normalizeConfig(config);
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
}
