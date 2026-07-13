import { spawn } from 'node:child_process';
import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { AlphaApi } from './api/index.js';
import { hasConfigFile, loadConfig, maskConfig, normalizeConfig, saveConfig } from './core/config.js';
import type { AlphaConfig } from './types/common.js';
import { writeUpdateCacheAfterInstall } from './update-probe.js';

const PACKAGE_NAME = '@cloudglab/alpha-cli';
const CLI_COMMAND = 'alpha';
const CLI_DISPLAY_NAME = 'alpha CLI';
const GIT_SKILL_SOURCE = 'cloudglab/alpha-cli';
const GLOBAL_SKILL_AGENT = 'universal';

type SkillSource = 'local' | 'git' | 'npm';

interface InstallOptions {
  skillSource: SkillSource;
  skillLocalPath?: string;
  skipConfigCheck: boolean;
  cliOnly: boolean;
  skillOnly: boolean;
}

interface UninstallOptions {
  confirm: boolean;
  keepConfig: boolean;
  cliOnly: boolean;
  skillOnly: boolean;
}

export async function runInstallCommand(args: string[] = []): Promise<void> {
  const options = parseInstallOptions(args);
  await installPackageAndSkill('安装', options);
  await writeUpdateCacheAfterInstall();
  if (options.skipConfigCheck) {
    printSuccessGuide('安装', '已跳过 Alpha 配置校验。');
    return;
  }
  await ensureValidAlphaConfig();
  printSuccessGuide('安装', 'Alpha 配置校验通过。');
}

export async function runUpdateCommand(args: string[] = []): Promise<void> {
  const options = parseInstallOptions(args);
  await installPackageAndSkill('更新', options);
  await writeUpdateCacheAfterInstall();
  if (options.skipConfigCheck) {
    printSuccessGuide('更新', '已跳过 Alpha 配置校验。');
    return;
  }
  await ensureValidAlphaConfig();
  printSuccessGuide('更新', 'Alpha 配置校验通过。');
}

export async function runUninstallCommand(args: string[] = []): Promise<void> {
  const options = parseUninstallOptions(args);
  if (!options.confirm) {
    printUninstallPreview(options);
    return;
  }

  if (!options.cliOnly) {
    await uninstallSkill();
  }
  if (!options.skillOnly) {
    await uninstallPackage();
  }
  if (shouldRemoveConfig(options)) {
    await removeConfigFile();
  }

  process.stdout.write('\n卸载完成。\n');
}

function printSuccessGuide(action: '安装' | '更新', status: string): void {
  process.stdout.write(`\n${action}完成，${status}\n\n${renderBanner()}\n\n`);
  process.stdout.write(`写操作说明：
  写操作默认已开启。
  写命令需要加 --confirm 才会真正执行。
  如需禁用写操作，设置 ALPHA_DISABLE_WRITE=true。

快速开始：
  ${CLI_COMMAND} help                    查看帮助
  ${CLI_COMMAND} list                    查看可用命令
  ${CLI_COMMAND} whoami                  校验当前 Alpha 账号
  ${CLI_COMMAND} --output verbose getAlphaConfig  查看完整配置
  ${CLI_COMMAND} healthHealthPing        检查服务状态

常用配置：
  ${CLI_COMMAND} update                       更新 CLI 和 Skill
  ${CLI_COMMAND} install --skip-config-check  仅安装，跳过配置校验
  ${CLI_COMMAND} uninstall --confirm true      卸载 CLI 和 skill
`);
}

export function renderBanner(): string {
  return [
    '___       ___       ___       ___       ___       ___       ___       ___   ',
    '/\\  \\     /\\__\\     /\\  \\     /\\__\\     /\\  \\     /\\__\\     /\\  \\     /\\__\\  ',
    '/::\\  \\   /:/  /    /::\\  \\   /:/__/_   /::\\  \\   /::\\  \\   /:/  /    _\\:\\  \\ ',
    '/::\\:\\__\\ /:/__/    /::\\:\\__\\ /::\\/\\__\\ /::\\:\\__\\ /:/\\:\\__\\ /:/__/    /\\/::\\__\\',
    '\\/\\::/  / \\:\\  \\    \\/\\::/  / \\/\\::/  / \\/\\::/  / \\:\\ \\/__/ \\:\\  \\    \\::/\\/__/',
    '/:/  /   \\:\\__\\      \\/__/    /:/  /    /:/  /   \\:\\__\\    \\:\\__\\    \\:\\__\\ ',
    '\\/__/     \\/__/               \\/__/     \\/__/     \\/__/     \\/__/     \\/__/ ',
  ].join('\n');
}

function createSkillAddArgs(source: string): string[] {
  return ['-y', 'skills', 'add', source, '--global', '--agent', GLOBAL_SKILL_AGENT, '--yes'];
}

function createSkillRemoveArgs(global = false): string[] {
  return ['-y', 'skills', 'remove', 'alpha-cli', '--yes', ...(global ? ['--global'] : [])];
}

function parseInstallOptions(args: string[]): InstallOptions {
  let skillSource: SkillSource = 'local';
  let skillLocalPath: string | undefined;
  let skipConfigCheck = false;
  let cliOnly = false;
  let skillOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--skill-source' || arg.startsWith('--skill-source=')) {
      const value = readRequiredOptionValue(args, index, '--skill-source');
      if (value !== 'local' && value !== 'git' && value !== 'npm') {
        throw new Error('--skill-source 只支持 local、git 或 npm');
      }
      skillSource = value;
      if (arg === '--skill-source') index += 1;
      continue;
    }

    if (arg === '--skill-local-path' || arg.startsWith('--skill-local-path=')) {
      const value = readRequiredOptionValue(args, index, '--skill-local-path');
      skillLocalPath = value;
      if (arg === '--skill-local-path') index += 1;
      continue;
    }

    if (arg === '--skip-config-check' || arg.startsWith('--skip-config-check=')) {
      const parsed = readBooleanFlag(args, index, '--skip-config-check');
      skipConfigCheck = parsed.value;
      index += parsed.consumedArgs;
      continue;
    }

    if (arg === '--cli-only' || arg.startsWith('--cli-only=')) {
      const parsed = readBooleanFlag(args, index, '--cli-only');
      cliOnly = parsed.value;
      index += parsed.consumedArgs;
      continue;
    }

    if (arg === '--skill-only' || arg.startsWith('--skill-only=')) {
      const parsed = readBooleanFlag(args, index, '--skill-only');
      skillOnly = parsed.value;
      index += parsed.consumedArgs;
      continue;
    }

    throw new Error(`未知安装参数: ${arg}`);
  }

  if (cliOnly && skillOnly) {
    throw new Error('--cli-only 和 --skill-only 不能同时使用');
  }

  return { skillSource, skillLocalPath, skipConfigCheck, cliOnly, skillOnly };
}

function parseUninstallOptions(args: string[]): UninstallOptions {
  let confirm = false;
  let keepConfig = false;
  let cliOnly = false;
  let skillOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--confirm' || arg.startsWith('--confirm=')) {
      const parsed = readBooleanFlag(args, index, '--confirm');
      confirm = parsed.value;
      index += parsed.consumedArgs;
      continue;
    }

    if (arg === '--keep-config' || arg.startsWith('--keep-config=')) {
      const parsed = readBooleanFlag(args, index, '--keep-config');
      keepConfig = parsed.value;
      index += parsed.consumedArgs;
      continue;
    }

    if (arg === '--cli-only' || arg.startsWith('--cli-only=')) {
      const parsed = readBooleanFlag(args, index, '--cli-only');
      cliOnly = parsed.value;
      index += parsed.consumedArgs;
      continue;
    }

    if (arg === '--skill-only' || arg.startsWith('--skill-only=')) {
      const parsed = readBooleanFlag(args, index, '--skill-only');
      skillOnly = parsed.value;
      index += parsed.consumedArgs;
      continue;
    }

    throw new Error(`未知卸载参数: ${arg}`);
  }

  if (cliOnly && skillOnly) {
    throw new Error('--cli-only 和 --skill-only 不能同时使用');
  }

  return { confirm, keepConfig, cliOnly, skillOnly };
}

function printUninstallPreview(options: UninstallOptions): void {
  const steps = [
    ...(!options.cliOnly ? ['卸载 alpha skill（项目级和全局级）'] : []),
    ...(!options.skillOnly ? ['卸载全局 CLI 包并清理 npm 残留目录'] : []),
    ...(shouldRemoveConfig(options) ? ['删除 ~/.alpha/config.json'] : ['保留 ~/.alpha/config.json']),
  ];
  process.stdout.write(`卸载预览：\n${steps.map((step) => `  - ${step}`).join('\n')}\n\n真实执行请运行：\n  ${CLI_COMMAND} uninstall --confirm true\n  npx -y ${PACKAGE_NAME}@latest uninstall --confirm true\n\n可选参数：\n  --keep-config true   保留 Alpha 配置\n  --cli-only true      只卸载 CLI\n  --skill-only true    只卸载 skill\n`);
}

function shouldRemoveConfig(options: UninstallOptions): boolean {
  return !options.keepConfig && !options.cliOnly && !options.skillOnly;
}

function readOptionValue(arg: string, optionName: string): string | undefined {
  const prefix = `${optionName}=`;
  if (!arg.startsWith(prefix)) return undefined;
  return arg.slice(prefix.length);
}

function readRequiredOptionValue(args: string[], index: number, optionName: string): string {
  const arg = args[index];
  const inlineValue = readOptionValue(arg, optionName);
  if (inlineValue !== undefined) {
    if (inlineValue.trim() === '') {
      throw createMissingOptionValueError(optionName);
    }
    return inlineValue;
  }

  const next = args[index + 1];
  if (typeof next !== 'string' || next.startsWith('--')) {
    throw createMissingOptionValueError(optionName);
  }

  return next;
}

function createMissingOptionValueError(optionName: string): Error {
  if (optionName === '--skill-local-path') {
    return new Error('--skill-local-path 需要传入本地目录路径');
  }

  return new Error(`${optionName} 需要传入参数值`);
}

function readBooleanFlag(args: string[], index: number, optionName: string): { value: boolean; consumedArgs: number } {
  const arg = args[index];
  const inlineValue = readOptionValue(arg, optionName);
  if (inlineValue !== undefined) {
    return { value: parseBooleanValue(inlineValue, optionName), consumedArgs: 0 };
  }

  const next = args[index + 1];
  if (typeof next === 'string' && !next.startsWith('--')) {
    return { value: parseBooleanValue(next, optionName), consumedArgs: 1 };
  }

  return { value: true, consumedArgs: 0 };
}

function parseBooleanValue(value: string, optionName: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  throw new Error(`${optionName} 只支持 true 或 false`);
}

async function installPackageAndSkill(action: '安装' | '更新', options: InstallOptions): Promise<void> {
  if (!options.skillOnly) {
    await cleanupGlobalPackageResidues();
    await installGlobalCli(action);
  }
  if (!options.cliOnly) {
    await installSkill(action, options);
  }
}

async function installGlobalCli(action: '安装' | '更新'): Promise<void> {
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

async function runNpxStepWithRetry(
  title: string,
  args: string[],
  _action: '安装' | '更新' | '卸载',
): Promise<void> {
  try {
    await runStep(title, 'npx', args);
  } catch (error) {
    if (!isNpmDirectoryNotEmptyError(error)) {
      throw error;
    }
    process.stdout.write(`\n检测到 npx 缓存目录残留，正在清理后重试 ${title}...\n`);
    await cleanupNpxResidues();
    await runStep(title, 'npx', args);
  }
}

async function installSkill(action: '安装' | '更新', options: InstallOptions): Promise<void> {
  if (options.skillLocalPath) {
    await runNpxStepWithRetry(`${action} alpha skill`, createSkillAddArgs(path.resolve(options.skillLocalPath)), action);
    return;
  }

  if (options.skillSource === 'local') {
    await installSkillFromInstalledPackage(action);
    return;
  }

  if (options.skillSource === 'git') {
    await runNpxStepWithRetry(`${action} alpha skill`, createSkillAddArgs(GIT_SKILL_SOURCE), action);
    return;
  }

  await installSkillFromNpmPackage(action);
}

async function installSkillFromInstalledPackage(action: '安装' | '更新'): Promise<void> {
  const skillPath = await getInstalledPackageSkillPath();
  try {
    await access(skillPath);
  } catch {
    throw new Error(`未找到已安装包内的 alpha skill：${skillPath}。可重试 --skill-source npm 或 --skill-source git。`);
  }

  await runNpxStepWithRetry(`${action} alpha skill`, createSkillAddArgs(skillPath), action);
}

async function getInstalledPackageSkillPath(): Promise<string> {
  const globalNodeModules = (await runCommandOutput('npm', ['root', '-g'])).trim();
  if (!globalNodeModules) {
    throw new Error('npm root -g 没有返回全局 node_modules 路径');
  }
  return path.join(globalNodeModules, PACKAGE_NAME, 'skills', 'alpha-cli');
}

async function installSkillFromNpmPackage(action: '安装' | '更新'): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'alpha-cli-skill-'));
  try {
    const stdout = await runCommandOutput('npm', ['pack', `${PACKAGE_NAME}@latest`, '--pack-destination', tempDir, '--silent']);
    const tarballName = stdout.trim().split('\n').filter(Boolean).at(-1);
    if (!tarballName) {
      throw new Error('npm pack 没有返回包文件名');
    }

    const tarballPath = path.join(tempDir, tarballName);
    await runStep('解压 alpha npm 包', 'tar', ['-xzf', tarballPath, '-C', tempDir]);
    await runNpxStepWithRetry(`${action} alpha skill`, createSkillAddArgs(path.join(tempDir, 'package')), action);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function uninstallSkill(): Promise<void> {
  await runNpxStepWithRetry('卸载项目级 alpha skill', createSkillRemoveArgs(false), '卸载');
  await runNpxStepWithRetry('卸载全局级 alpha skill', createSkillRemoveArgs(true), '卸载');
}

async function uninstallPackage(): Promise<void> {
  await runStep(`卸载 ${CLI_DISPLAY_NAME}`, 'npm', ['uninstall', '-g', PACKAGE_NAME]);
  await cleanupGlobalPackageResidues();
}

async function cleanupGlobalPackageResidues(): Promise<void> {
  const globalRoot = await captureCommandOutput('npm', ['root', '-g']);
  const packagePath = path.join(globalRoot, ...PACKAGE_NAME.split('/'));
  const packageLeaf = path.basename(packagePath);
  const scopeDir = path.dirname(packagePath);

  if (await pathExists(packagePath)) {
    await rm(packagePath, { recursive: true, force: true });
  }

  if (scopeDir !== globalRoot && await pathExists(scopeDir)) {
    let entries: string[] = [];
    try {
      entries = await readdir(scopeDir);
    } catch {
      // scope 目录不存在时忽略
    }
    await Promise.all(entries
      .filter((entry) => entry.startsWith('.alpha-cli-') || entry === packageLeaf)
      .map((entry) => rm(path.join(scopeDir, entry), { recursive: true, force: true })));
  }

  await cleanupNpxResidues();
}

async function cleanupNpxResidues(): Promise<void> {
  const npxCacheDir = path.join(os.homedir(), '.npm', '_npx');
  let entries: string[] = [];
  try {
    entries = await readdir(npxCacheDir);
  } catch {
    return;
  }

  await Promise.all(entries.map(async (entry) => {
    const hashDir = path.join(npxCacheDir, entry);
    const cloudglabDir = path.join(hashDir, 'node_modules', '@cloudglab');
    let cloudglabEntries: string[] = [];
    try {
      cloudglabEntries = await readdir(cloudglabDir);
    } catch {
      return;
    }

    const hasAlphaCli = cloudglabEntries.some(
      (e) => e === 'alpha-cli' || e.startsWith('.alpha-cli-'),
    );
    if (hasAlphaCli) {
      await rm(hashDir, { recursive: true, force: true });
    }
  }));
}

async function removeConfigFile(): Promise<void> {
  const configDir = path.join(os.homedir(), '.alpha');
  await rm(path.join(configDir, 'config.json'), { force: true });
  // 兜底清理旧版 ~/.alpha-cli/config.json
  const legacyConfigFile = path.join(os.homedir(), '.alpha-cli', 'config.json');
  await rm(legacyConfigFile, { force: true });
}

async function runStep(title: string, command: string, args: string[]): Promise<void> {
  process.stdout.write(`\n${title}...\n`);
  await runCommand(command, args);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: process.platform === 'win32' });
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      process.stdout.write(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderr += text;
      process.stderr.write(text);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(createCommandFailedError(command, args, code, stderr));
    });
  });
}

function createCommandFailedError(command: string, args: string[], code: number | null, stderr: string): Error {
  const baseMessage = `${command} ${args.join(' ')} 执行失败，退出码 ${String(code)}`;
  const tail = stderr ? `：${stderr.trim()}` : '';
  return new Error(baseMessage + tail);
}

function runCommandOutput(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: process.platform === 'win32' });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} 执行失败，退出码 ${String(code)}${stderr ? `：${stderr.trim()}` : ''}`));
    });
  });
}

async function captureCommandOutput(command: string, args: string[]): Promise<string> {
  return (await runCommandOutput(command, args)).trim();
}

async function ensureValidAlphaConfig(): Promise<void> {
  const { config: existing, error: loadError } = tryLoadConfig();

  // 1. 已有配置且校验通过
  if (existing && (await validateConfig(existing))) {
    // 如果配置来自环境变量但磁盘上没有配置文件，落盘一份方便后续使用
    if (!hasConfigFile()) {
      saveConfig(existing);
      process.stdout.write('\n已从环境变量生成配置文件 ~/.alpha/config.json\n');
    }
    process.stdout.write(`\nAlpha 配置校验通过：${JSON.stringify(maskConfig(existing))}\n`);
    printEnvOverrideNotice();
    return;
  }

  // 2. 非交互环境：给出明确指引而不是直接抛错
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    if (existing) {
      // 有配置（可能来自 env）但校验失败，先落盘再提示
      if (!hasConfigFile()) saveConfig(existing);
      throw new Error(
        'Alpha 配置校验失败（当前为非交互式终端，无法引导输入）。\n' +
        '请检查 ALPHA_URL / ALPHA_TOKEN / ALPHA_USERNAME / ALPHA_PASSWORD 是否正确，\n' +
        '或安装完成后运行：alpha initAlpha --url https://host --token xxx --save true',
      );
    }
    if (loadError) throw loadError;
    throw new Error(
      '未检测到 Alpha 配置（当前为非交互式终端，无法引导输入）。\n' +
      '请先设置环境变量 ALPHA_URL 和 ALPHA_TOKEN（或 ALPHA_USERNAME + ALPHA_PASSWORD），\n' +
      '或安装完成后运行：alpha initAlpha --url https://host --token xxx --save true',
    );
  }

  // 3. 交互环境：提示并引导输入
  if (existing) {
    process.stdout.write('\n检测到已有 Alpha 配置，但登录校验失败，请重新输入。\n');
  } else if (loadError) {
    process.stdout.write(`\n检测到 Alpha 配置文件异常：${loadError.message}\n`);
  } else {
    process.stdout.write('\n未检测到可用 Alpha 配置，请输入配置。\n');
  }

  const config = await promptForConfig(existing ?? undefined);
  // 先落盘，避免校验失败时丢失用户输入
  saveConfig(config);
  try {
    await validateConfigOrThrow(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`\n配置已保存到 ~/.alpha/config.json，但校验失败：${message}\n`);
    process.stdout.write('请检查地址和凭据是否正确，可重新运行：alpha initAlpha --url https://host --token xxx --save true\n');
    printEnvOverrideNotice();
    return;
  }
  process.stdout.write(`已保存 Alpha 配置：${JSON.stringify(maskConfig(config))}\n`);
  printEnvOverrideNotice();
}

function printEnvOverrideNotice(): void {
  if (!hasAlphaEnvConfig()) return;
  process.stdout.write('提示：当前 shell 存在 ALPHA_* 环境变量，后续命令会优先使用环境变量；如果仍登录失败，请同步更新或清除这些环境变量。\n');
}

function tryLoadConfig(): { config: AlphaConfig | null; error?: Error } {
  try {
    return { config: loadConfig() };
  } catch (error) {
    return {
      config: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

function hasAlphaEnvConfig(): boolean {
  return [
    process.env.ALPHA_URL,
    process.env.ALPHA_TOKEN,
    process.env.ALPHA_USERNAME,
    process.env.ALPHA_ACCOUNT,
    process.env.ALPHA_PASSWORD,
    process.env.ALPHA_TIMEOUT_MS,
  ].some((value) => typeof value === 'string' && value.trim() !== '');
}

async function validateConfig(config: AlphaConfig): Promise<boolean> {
  try {
    await validateConfigOrThrow(config);
    return true;
  } catch {
    return false;
  }
}

async function validateConfigOrThrow(config: AlphaConfig): Promise<void> {
  const api = new AlphaApi(config);
  await api.http.request('POST', '/alpha/test-api', {});
}

async function promptForConfig(defaults?: AlphaConfig): Promise<AlphaConfig> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('当前不是交互式终端，无法输入配置。请先设置 ALPHA_URL、ALPHA_TOKEN、ALPHA_USERNAME、ALPHA_PASSWORD 后重试。');
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const url = await ask(rl, 'Alpha 服务地址（可省略 https://）', defaults?.url);
    const token = await ask(rl, 'Alpha Token（推荐；可回车跳过）', defaults?.token ?? '');
    const username = await ask(rl, 'Alpha 用户名（使用账密时必填）', defaults?.username ?? '');
    const password = await askPassword(rl, defaults?.password ? 'Alpha 密码（直接回车保留原密码）' : 'Alpha 密码（可回车跳过）');
    const timeoutStr = await ask(rl, '请求超时（毫秒）', String(defaults?.timeoutMs ?? 30000));
    const timeoutMs = Number(timeoutStr);
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error(`timeoutMs 必须是正整数，收到: ${timeoutStr}`);
    }

    return normalizeConfig({
      url,
      token: token || undefined,
      username: username || undefined,
      password: password || defaults?.password,
      timeoutMs,
    });
  } finally {
    rl.close();
  }
}

function ask(rl: readline.Interface, label: string, defaultValue = ''): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  return new Promise((resolve) => {
    rl.question(`${label}${suffix}: `, (answer) => resolve(answer.trim() || defaultValue));
  });
}

type MutableReadline = readline.Interface & { stdoutMuted?: boolean; _writeToOutput?: (value: string) => void };

function askPassword(rl: readline.Interface, label: string): Promise<string> {
  const mutableRl = rl as MutableReadline;
  return new Promise((resolve, reject) => {
    // _writeToOutput 是 Node readline 的内部钩子，跨版本可能不存在。
    // 不存在时无法实现静默输入，直接拒绝并提示用环境变量，避免明文回显密码。
    if (typeof mutableRl._writeToOutput !== 'function') {
      reject(new Error('当前 Node 版本不支持密码静默输入，请改用环境变量 ALPHA_PASSWORD 提供密码后重试。'));
      return;
    }

    const originalWrite = mutableRl._writeToOutput.bind(rl);
    mutableRl.stdoutMuted = true;
    mutableRl._writeToOutput = (value: string) => {
      originalWrite(mutableRl.stdoutMuted ? '*' : value);
    };

    mutableRl.question(`${label}: `, (answer) => {
      // finally 里还原钩子与静默标记
      mutableRl._writeToOutput = originalWrite;
      mutableRl.stdoutMuted = false;
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}
