import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { CLI_VERSION } from './version.js';

const PACKAGE_NAME = '@cloudglab/alpha-cli';
const CHECK_FILE = path.join(homedir(), '.alpha', 'update-check.json');
const SKIP_COMMANDS = new Set(['help', 'list', 'version', 'install', 'update', 'upgrade', 'changelog', 'uninstall', 'remove', '--help', '-h', '--version', '-v']);

interface UpdateCheckState {
  lastCheckedDate?: string;
  latestVersion?: string;
  currentVersion?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function runDailyUpdateProbe(commandName?: string): Promise<void> {
  if (!commandName || SKIP_COMMANDS.has(commandName)) return;
  if (process.env.NODE_ENV === 'test') return;
  if (process.env.ALPHA_SKIP_UPDATE_CHECK === 'true') return;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const state = await readUpdateCheckState();

    notifyIfUpdateAvailable(state.latestVersion);

    if (state.lastCheckedDate === today) return;

    await writeUpdateCheckState({ ...state, lastCheckedDate: today, currentVersion: CLI_VERSION });
    triggerBackgroundVersionCheck();
  } catch {
    // 更新检查失败不应阻塞主命令
  }
}

export async function writeUpdateCacheAfterInstall(version?: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await writeUpdateCheckState({
    lastCheckedDate: today,
    latestVersion: version ?? CLI_VERSION,
    currentVersion: CLI_VERSION,
  });
}

function notifyIfUpdateAvailable(latestVersion?: string): void {
  if (!latestVersion || !isNewerVersion(latestVersion, CLI_VERSION)) return;

  process.stderr.write([
    `检测到 alpha CLI 新版本 ${latestVersion}（当前 ${CLI_VERSION}）。`,
    '建议执行以下命令完成更新：',
    '  alpha update',
    '如只更新工具且跳过配置校验，可执行：',
    '  alpha update --skip-config-check',
    '',
  ].join('\n'));
}

async function readUpdateCheckState(): Promise<UpdateCheckState> {
  try {
    const parsed = JSON.parse(await readFile(CHECK_FILE, 'utf8')) as unknown;
    if (!isRecord(parsed)) {
      return {};
    }
    return parsed as UpdateCheckState;
  } catch {
    return {};
  }
}

async function writeUpdateCheckState(state: UpdateCheckState): Promise<void> {
  await mkdir(path.dirname(CHECK_FILE), { recursive: true, mode: 0o700 });
  await writeFile(CHECK_FILE, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function triggerBackgroundVersionCheck(): void {
  // 用 node:https 直接探测 npm registry，避免 spawn npm 在 Windows 上的路径/转义问题，
  // 也避免把 packageName/cliVersion 拼进 shell 命令带来的转义风险。
  const script = `
    const https = require('https');
    const { mkdirSync, writeFileSync } = require('fs');
    const { homedir } = require('os');
    const path = require('path');

    const packageName = ${JSON.stringify(PACKAGE_NAME)};
    const cliVersion = ${JSON.stringify(CLI_VERSION)};

    const req = https.request({
      hostname: 'registry.npmjs.org',
      path: '/' + encodeURIComponent(packageName) + '/latest',
      method: 'GET',
      timeout: 8000,
    }, function (res) {
      let body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        if (res.statusCode !== 200) return;
        let info;
        try { info = JSON.parse(body); } catch (e) { return; }
        const latestVersion = typeof info.version === 'string' ? info.version : '';
        if (!latestVersion) return;
        const today = new Date().toISOString().slice(0, 10);
        const checkFile = path.join(homedir(), '.alpha', 'update-check.json');
        mkdirSync(path.dirname(checkFile), { recursive: true, mode: 0o700 });
        writeFileSync(checkFile, JSON.stringify({ lastCheckedDate: today, latestVersion: latestVersion, currentVersion: cliVersion }, null, 2) + '\\n', { mode: 0o600 });
      });
    });
    req.on('error', function () {});
    req.on('timeout', function () { req.destroy(); });
    req.end();
  `;

  const child = spawn(process.execPath, ['-e', script], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

function isNewerVersion(latestVersion: string, currentVersion: string): boolean {
  const latest = parseVersion(latestVersion);
  const current = parseVersion(currentVersion);
  for (let index = 0; index < Math.max(latest.length, current.length); index += 1) {
    const latestPart = latest[index] ?? 0;
    const currentPart = current[index] ?? 0;
    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }
  return false;
}

function parseVersion(version: string): number[] {
  return version
    .replace(/^v/, '')
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}
