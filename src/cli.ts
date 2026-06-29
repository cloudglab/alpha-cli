import { InMemoryCliRegistry, parseCommandInput } from './core/cli-registry.js';
import { formatCommandOutput, getBuiltinCommandHelp, printCommandHelp, printCommandList, printHelp } from './core/cli-output.js';
import { normalizeImplicitSceneInvocation } from './core/devops-scene.js';
import { resolveRecommendations } from './core/recommendations.js';
import { runInstallCommand, runUninstallCommand, runUpdateCommand } from './install.js';
import { registerTools } from './core/tool-registry.js';
import { renderChangelog, type ChangelogOptions } from './core/changelog.js';
import type { Role } from './types/common.js';
import { CLI_VERSION } from './version.js';
import { type OutputMode, setGlobalOutputMode, withToolMeta } from './tools/shared.js';

const VALID_ROLES = new Set<Role>(['full', 'ci', 'deploy', 'iter', 'rbac', 'file', 'ops']);
const VALID_OUTPUT_MODES = new Set<OutputMode>(['compact', 'normal', 'verbose']);
const BUILTIN_COMMAND_NAMES = ['help', 'list', 'version', 'install', 'uninstall', 'remove', 'update', 'upgrade', 'changelog'];

export async function runCli(rawArgs: string[]): Promise<void> {
  const parsedArgs = parseCliArgs(rawArgs);
  const implicitScene = normalizeImplicitSceneInvocation(parsedArgs.commandName, parsedArgs.commandArgs);
  const { role, commandName, commandArgs, outputMode, recommend } = implicitScene
    ? { ...parsedArgs, ...implicitScene }
    : parsedArgs;
  setGlobalOutputMode(outputMode);

  if (!commandName || commandName === '--help' || commandName === '-h') {
    const registry = await buildRegistry(role);
    printHelp(role, registry.listCommands());
    return;
  }

  if (commandName === 'help') {
    const helpTargets = commandArgs.filter((arg) => arg !== '--help' && arg !== '-h');
    if (helpTargets.length === 0) {
      const registry = await buildRegistry(role);
      printHelp(role, registry.listCommands());
      return;
    }

    const targetCommandName = helpTargets[0];
    const remainingTargetArgs = helpTargets.slice(1);
    if (remainingTargetArgs.length > 0) {
      throw new Error(`help 只支持一个命令目标，检测到多余参数: ${remainingTargetArgs.join(' ')}`);
    }

    const builtinHelp = getBuiltinCommandHelp(targetCommandName);
    if (builtinHelp) {
      process.stdout.write(`${builtinHelp}\n`);
      return;
    }

    const targetRegistry = await buildRegistry(role, targetCommandName);
    const targetCommand = targetRegistry.getCommand(targetCommandName);
    if (!targetCommand) throw new Error(`未找到命令: ${targetCommandName}`);
    printCommandHelp(targetCommand.name, targetCommand.schema, targetCommand.metadata);
    return;
  }

  if (commandName === '--version' || commandName === '-v' || commandName === 'version') {
    if (hasHelpFlag(commandArgs)) {
      process.stdout.write(`${getBuiltinCommandHelp('version')}\n`);
      return;
    }

    ensureNoUnexpectedBuiltinArgs('version', commandArgs);
    process.stdout.write(`${CLI_VERSION}\n`);
    return;
  }

  if (commandName === 'list') {
    if (hasHelpFlag(commandArgs)) {
      process.stdout.write(`${getBuiltinCommandHelp('list')}\n`);
      return;
    }

    const options = parseListOptions(commandArgs);
    const registry = await buildRegistry(role);
    const commands = registry.listCommands();
    const commandNames = [...BUILTIN_COMMAND_NAMES, ...commands.map((item) => item.name)].sort((left, right) => left.localeCompare(right));

    if (options.raw) {
      for (const item of commandNames) process.stdout.write(`${item}\n`);
      return;
    }

    printCommandList(role, commands, BUILTIN_COMMAND_NAMES);
    return;
  }

  if (commandName === 'install') {
    if (hasHelpFlag(commandArgs)) {
      process.stdout.write(`${getBuiltinCommandHelp('install')}\n`);
      return;
    }

    await runInstallCommand(commandArgs);
    return;
  }

  if (commandName === 'uninstall' || commandName === 'remove') {
    if (hasHelpFlag(commandArgs)) {
      process.stdout.write(`${getBuiltinCommandHelp('uninstall')}\n`);
      return;
    }

    await runUninstallCommand(commandArgs);
    return;
  }

  if (commandName === 'update' || commandName === 'upgrade') {
    if (hasHelpFlag(commandArgs)) {
      process.stdout.write(`${getBuiltinCommandHelp('update')}\n`);
      return;
    }

    await runUpdateCommand(commandArgs);
    return;
  }

  if (commandName === 'changelog') {
    if (hasHelpFlag(commandArgs)) {
      process.stdout.write(`${getBuiltinCommandHelp('changelog')}\n`);
      return;
    }

    const options = parseChangelogOptions(commandArgs);
    process.stdout.write(`${await renderChangelog(options)}\n`);
    return;
  }

  const registry = await buildRegistry(role, commandName);
  const command = registry.getCommand(commandName);
  if (!command) throw new Error(`未找到命令: ${commandName}`);

  if (hasHelpFlag(commandArgs)) {
    printCommandHelp(command.name, command.schema, command.metadata);
    return;
  }

  const input = parseCommandInput(command.schema, commandArgs);
  const result = await command.handler(input);
  const rawText = result.content[0]?.text ?? '';
  const decoratedText = recommend ? injectRecommendations(rawText, { registry, commandName, input }) : rawText;
  // 仅在 compact 模式 + 交互式终端（TTY）下启用人类可读格式化；
  // 管道/脚本/AI（非 TTY）以及 normal/verbose 模式保持原始 JSON，避免破坏 JSON 消费者。
  const text = outputMode === 'compact' && process.stdout.isTTY
    ? formatCommandOutput(command.name, decoratedText)
    : decoratedText;
  process.stdout.write(`${text}\n`);
}

async function buildRegistry(role: Role, commandName?: string): Promise<InMemoryCliRegistry> {
  const registry = new InMemoryCliRegistry();
  await registerTools(registry, role, { commandName });
  return registry;
}

function parseCliArgs(rawArgs: string[]): { role: Role; commandName?: string; commandArgs: string[]; outputMode: OutputMode; recommend: boolean } {
  const args = [...rawArgs];
  let role: Role = 'full';
  let outputMode: OutputMode = 'compact';
  let recommend = false;

  for (let index = 0; index < args.length;) {
    const arg = args[index];

    // 统一用 --role / --role= / -r <value> 三种形式；不再支持 -r=value，避免重复分支。
    if (arg === '--role' || arg === '-r') {
      const roleValue = args[index + 1];
      if (!roleValue || !VALID_ROLES.has(roleValue as Role)) throw new Error(`无效 role: ${String(roleValue)}`);
      role = roleValue as Role;
      args.splice(index, 2);
      continue;
    }

    if (arg.startsWith('--role=')) {
      const roleValue = arg.slice('--role='.length);
      if (!roleValue || !VALID_ROLES.has(roleValue as Role)) throw new Error(`无效 role: ${String(roleValue)}`);
      role = roleValue as Role;
      args.splice(index, 1);
      continue;
    }

    if (arg === '--output') {
      const mode = args[index + 1];
      assertOutputMode(mode);
      outputMode = mode;
      args.splice(index, 2);
      continue;
    }

    if (arg.startsWith('--output=')) {
      const mode = arg.slice('--output='.length);
      assertOutputMode(mode);
      outputMode = mode;
      args.splice(index, 1);
      continue;
    }

    if (arg === '--recommend') {
      const next = args[index + 1];
      if (next === 'false') {
        recommend = false;
        args.splice(index, 2);
        continue;
      }
      recommend = true;
      args.splice(index, 1);
      continue;
    }

    if (arg.startsWith('--recommend=')) {
      const value = arg.slice('--recommend='.length).trim().toLowerCase();
      recommend = !['false', '0', 'no', 'off'].includes(value);
      args.splice(index, 1);
      continue;
    }

    index += 1;
  }

  if (args[0] && VALID_ROLES.has(args[0] as Role)) {
    role = args.shift() as Role;
  }

  return { role, commandName: args.shift(), commandArgs: args, outputMode, recommend };
}

function injectRecommendations(
  rawText: string,
  options: { registry: InMemoryCliRegistry; commandName: string; input: Record<string, unknown> },
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return rawText;
  }

  const command = options.registry.getCommand(options.commandName);
  if (!command) return rawText;

  const next = resolveRecommendations({
    command,
    commands: options.registry.listCommands(),
    input: options.input,
    payload: parsed,
  });
  if (next.length === 0) return rawText;

  return JSON.stringify(withToolMeta(parsed, { next }));
}

function parseListOptions(args: string[]): { raw: boolean } {
  const unexpectedArgs = args.filter((arg) => arg !== '--raw');
  if (unexpectedArgs.length > 0) {
    throw new Error(`list 不支持额外参数: ${unexpectedArgs.join(' ')}`);
  }

  return { raw: args.includes('--raw') };
}

function parseChangelogOptions(args: string[]): ChangelogOptions {
  const options: ChangelogOptions = { limit: 5, raw: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--raw') {
      options.raw = true;
      continue;
    }

    if (arg === '--limit' || arg.startsWith('--limit=')) {
      const value = arg.startsWith('--limit=') ? arg.slice('--limit='.length) : args[++index];
      if (value === undefined) {
        throw new Error('changelog --limit 需要一个值');
      }
      if (value === 'all') {
        options.limit = 'all';
        continue;
      }
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`changelog --limit 必须是正整数或 all，收到: ${value}`);
      }
      options.limit = parsed;
      continue;
    }

    if (arg === '--version' || arg.startsWith('--version=')) {
      const value = arg.startsWith('--version=') ? arg.slice('--version='.length) : args[++index];
      if (!value) {
        throw new Error('changelog --version 需要一个值');
      }
      options.version = value;
      continue;
    }

    if (arg === '--since' || arg.startsWith('--since=')) {
      const value = arg.startsWith('--since=') ? arg.slice('--since='.length) : args[++index];
      if (!value) {
        throw new Error('changelog --since 需要一个值');
      }
      options.since = value;
      continue;
    }

    throw new Error(`changelog 不支持参数: ${arg}`);
  }

  return options;
}

function hasHelpFlag(args: string[]): boolean {
  return args.includes('--help') || args.includes('-h');
}

function ensureNoUnexpectedBuiltinArgs(commandName: string, args: string[]): void {
  if (args.length === 0) return;
  throw new Error(`${commandName} 不支持额外参数: ${args.join(' ')}`);
}

function assertOutputMode(value: string | undefined): asserts value is OutputMode {
  if (!value || !VALID_OUTPUT_MODES.has(value as OutputMode)) {
    throw new Error(`无效 output: ${String(value)}`);
  }
}
