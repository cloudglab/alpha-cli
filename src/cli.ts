import { InMemoryCliRegistry, parseCommandInput } from './core/cli-registry.js';
import { registerTools } from './core/tool-registry.js';
import type { Role } from './types/common.js';

const VALID_ROLES = new Set<Role>(['full', 'ci', 'deploy', 'iter', 'rbac', 'file']);

export async function runCli(rawArgs: string[]): Promise<void> {
  const { role, commandName, commandArgs } = parseCliArgs(rawArgs);
  const registry = new InMemoryCliRegistry();
  registerTools(registry, role);
  const builtinCommandNames = ['help', 'list', 'version'];
  const commandNames = [...builtinCommandNames, ...registry.listCommands().map((item) => item.name)];

  if (!commandName || commandName === 'help' || commandName === '--help' || commandName === '-h') {
    printHelp(role, commandNames);
    return;
  }

  if (commandName === '--version' || commandName === '-v' || commandName === 'version') {
    process.stdout.write('0.1.0\n');
    return;
  }

  if (commandName === 'list') {
    for (const item of commandNames) process.stdout.write(`${item}\n`);
    return;
  }

  const command = registry.getCommand(commandName);
  if (!command) throw new Error(`未找到命令: ${commandName}`);

  const input = parseCommandInput(command.schema, commandArgs);
  const result = await command.handler(input);
  const text = result.content[0]?.text ?? '';
  process.stdout.write(`${text}\n`);
}

function parseCliArgs(rawArgs: string[]): { role: Role; commandName?: string; commandArgs: string[] } {
  const args = [...rawArgs];
  let role: Role = 'full';

  const roleIndex = args.findIndex((arg) => arg === '--role' || arg === '-r');
  if (roleIndex >= 0) {
    const roleValue = args[roleIndex + 1];
    if (!roleValue || !VALID_ROLES.has(roleValue as Role)) throw new Error(`无效 role: ${String(roleValue)}`);
    role = roleValue as Role;
    args.splice(roleIndex, 2);
  } else if (args[0] && VALID_ROLES.has(args[0] as Role)) {
    role = args.shift() as Role;
  }

  return { role, commandName: args.shift(), commandArgs: args };
}

function printHelp(role: Role, commands: string[]): void {
  process.stdout.write([
    'alpha CLI',
    '',
    `当前 role: ${role}`,
    '',
    '用法：',
    '  alpha [--role full|ci|deploy|iter|rbac|file] <command> [--body JSON] [--query JSON] [--file path]',
    '  alpha list',
    '  alpha help',
    '  alpha version',
    '',
    '示例：',
    '  alpha initAlpha --url https://host --token xxx --save true',
    '  alpha ciBuildList --body {"page":1,"size":20}',
    '  alpha fileMetadataDownload --query {"id":1}',
    '  alpha deployMaterialUpload --file ./a.zip --file ./b.zip',
    '',
    '环境变量：ALPHA_URL、ALPHA_TOKEN、ALPHA_USERNAME、ALPHA_PASSWORD、ALPHA_TIMEOUT_MS',
    '',
    '可用命令：',
    ...commands.map((item) => `  - ${item}`),
    '',
  ].join('\n'));
}
