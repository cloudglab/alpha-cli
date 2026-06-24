import { InMemoryCliRegistry, parseCommandInput } from './core/cli-registry.js';
import { getBuiltinCommandHelp, printCommandHelp, printCommandList, printHelp } from './core/cli-output.js';
import { normalizeImplicitSceneInvocation } from './core/devops-scene.js';
import { runInstallCommand, runUpdateCommand } from './install.js';
import { registerTools } from './core/tool-registry.js';
import type { Role } from './types/common.js';
import { CLI_VERSION } from './version.js';
import { type OutputMode, setGlobalOutputMode } from './tools/shared.js';

const VALID_ROLES = new Set<Role>(['full', 'ci', 'deploy', 'iter', 'rbac', 'file', 'ops']);
const VALID_OUTPUT_MODES = new Set<OutputMode>(['compact', 'normal', 'verbose']);
const BUILTIN_COMMAND_NAMES = ['help', 'list', 'version', 'install', 'update', 'upgrade'];

export async function runCli(rawArgs: string[]): Promise<void> {
  const parsedArgs = parseCliArgs(rawArgs);
  const implicitScene = normalizeImplicitSceneInvocation(parsedArgs.commandName, parsedArgs.commandArgs);
  const { role, commandName, commandArgs, outputMode } = implicitScene
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

  if (commandName === 'update' || commandName === 'upgrade') {
    if (hasHelpFlag(commandArgs)) {
      process.stdout.write(`${getBuiltinCommandHelp('update')}\n`);
      return;
    }

    await runUpdateCommand(commandArgs);
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
  const text = result.content[0]?.text ?? '';
  process.stdout.write(`${text}\n`);
}

async function buildRegistry(role: Role, commandName?: string): Promise<InMemoryCliRegistry> {
  const registry = new InMemoryCliRegistry();
  await registerTools(registry, role, { commandName });
  return registry;
}

function parseCliArgs(rawArgs: string[]): { role: Role; commandName?: string; commandArgs: string[]; outputMode: OutputMode } {
  const args = [...rawArgs];
  let role: Role = 'full';
  let outputMode: OutputMode = 'compact';

  for (let index = 0; index < args.length;) {
    const arg = args[index];

    if (arg === '--role' || arg === '-r') {
      const roleValue = args[index + 1];
      if (!roleValue || !VALID_ROLES.has(roleValue as Role)) throw new Error(`无效 role: ${String(roleValue)}`);
      role = roleValue as Role;
      args.splice(index, 2);
      continue;
    }

    if (arg.startsWith('--role=') || arg.startsWith('-r=')) {
      const roleValue = arg.startsWith('--role=') ? arg.slice('--role='.length) : arg.slice('-r='.length);
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

    index += 1;
  }

  if (args[0] && VALID_ROLES.has(args[0] as Role)) {
    role = args.shift() as Role;
  }

  return { role, commandName: args.shift(), commandArgs: args, outputMode };
}

function parseListOptions(args: string[]): { raw: boolean } {
  const unexpectedArgs = args.filter((arg) => arg !== '--raw');
  if (unexpectedArgs.length > 0) {
    throw new Error(`list 不支持额外参数: ${unexpectedArgs.join(' ')}`);
  }

  return { raw: args.includes('--raw') };
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
