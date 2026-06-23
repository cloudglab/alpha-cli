import { spawn } from 'node:child_process';
import { access, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const PACKAGE_NAME = '@cloudglab/alpha-cli';
const CLI_COMMAND = 'alpha';
const CLI_DISPLAY_NAME = 'alpha CLI';

type InstallAction = '安装' | '更新';

export async function runInstallCommand(args: string[] = []): Promise<void> {
  ensureNoUnexpectedArgs('install', args);
  await installGlobalCli('安装');
  printSuccessGuide('安装');
}

export async function runUpdateCommand(args: string[] = []): Promise<void> {
  ensureNoUnexpectedArgs('update', args);
  await installGlobalCli('更新');
  printSuccessGuide('更新');
}

export function renderBanner(): string {
  return [
    '___       ___       ___       ___       ___       ___       ___       ___   ',
    '/\\  \\     /\\__\\     /\\  \\     /\\__\\     /\\  \\     /\\  \\     /\\__\\     /\\  \\  ',
    '/::\\  \\   /:/  /    /::\\  \\   /:/__/_   /::\\  \\   /::\\  \\   /:/  /    _\\:\\  \\ ',
    '/::\\:\\__\\ /:/__/    /::\\:\\__\\ /::\\/\\__\\ /::\\:\\__\\ /:/\\:\\__\\ /:/__/    /\\/::\\__\\',
    '\\/\\::/  / \\:\\  \\    \\/\\::/  / \\/\\::/  / \\/\\::/  / \\:\\ \/__/ \\:\\  \\    \\::/\\/__/',
    '/:/  /   \\:\\__\\      \\/__/    /:/  /    /:/  /   \\:\\__\\    \\:\\__\\    \\:\\__\\ ',
    '\\/__/     \\/__/               \\/__/     \\/__/     \\/__/     \\/__/     \\/__/ ',
  ].join('\n');
}

function printSuccessGuide(action: InstallAction): void {
  process.stdout.write(`\n${action}完成。\n\n${renderBanner()}\n\n`);
  process.stdout.write(`快速开始：
  ${CLI_COMMAND} help                              查看帮助
  ${CLI_COMMAND} list                              查看可用命令
  ${CLI_COMMAND} initAlpha --url https://host --token xxx --save true
  ${CLI_COMMAND} getAlphaConfig                    查看当前配置
  ${CLI_COMMAND} healthHealthPing                  检查服务状态

常用命令：
  ${CLI_COMMAND} update                            更新 CLI
  ${CLI_COMMAND} --output verbose getAlphaConfig   查看完整配置输出
`);
}

function ensureNoUnexpectedArgs(commandName: string, args: string[]): void {
  if (args.length === 0) return;
  throw new Error(`${commandName} 不支持额外参数: ${args.join(' ')}`);
}

async function installGlobalCli(action: InstallAction): Promise<void> {
  const args = ['install', '-g', `${PACKAGE_NAME}@latest`];
  try {
    await runStep(`${action} ${CLI_DISPLAY_NAME}`, 'npm', args);
  } catch (error) {
    if (!isNpmDirectoryNotEmptyError(error)) {
      throw error;
    }

    process.stdout.write('\n检测到 npm 全局安装目录残留，正在清理后重试...\n');
    await cleanupGlobalPackageResidues();
    await runStep(`${action} ${CLI_DISPLAY_NAME}`, 'npm', args);
  }
}

function isNpmDirectoryNotEmptyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('ENOTEMPTY') || message.toLowerCase().includes('directory not empty');
}

async function cleanupGlobalPackageResidues(): Promise<void> {
  const globalRoot = await captureCommandOutput('npm', ['root', '-g']);
  const packagePath = path.join(globalRoot, ...PACKAGE_NAME.split('/'));

  if (await pathExists(packagePath)) {
    await rm(packagePath, { recursive: true, force: true });
  }

  const scopeDir = path.dirname(packagePath);
  const packageLeaf = path.basename(packagePath);

  if (scopeDir !== globalRoot && await pathExists(scopeDir)) {
    const entries = await readdir(scopeDir);
    if (entries.length === 0 || (entries.length === 1 && entries[0] === packageLeaf)) {
      await rm(scopeDir, { recursive: true, force: true });
    }
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runStep(title: string, command: string, args: string[]): Promise<void> {
  process.stdout.write(`\n==> ${title}\n`);
  await spawnCommand(command, args, 'inherit');
}

async function captureCommandOutput(command: string, args: string[]): Promise<string> {
  const output = await spawnCommand(command, args, 'pipe');
  return output.trim();
}

function spawnCommand(command: string, args: string[], stdio: 'inherit' | 'pipe'): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: stdio === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    if (stdio === 'pipe') {
      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      const details = stderr.trim() || stdout.trim();
      reject(new Error(`${command} ${args.join(' ')} 执行失败${details ? `: ${details}` : ''}`));
    });
  });
}
