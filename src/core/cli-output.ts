import { z, type ZodRawShape, type ZodTypeAny } from 'zod';
import type { Role } from '../types/common.js';
import { CLI_VERSION } from '../version.js';
import type { CliCommandDefinition, CliCommandMetadata } from './cli-registry.js';

const GROUP_TITLES: Record<string, string> = {
  builtin: '内置命令',
  init: '初始化',
  scene: '场景识别',
  root: '基础接口',
  ci: '持续集成',
  deploy: '发布部署',
  file: '文件服务',
  iter: '迭代管理',
  rbac: '权限控制',
};

export function printHelp(role: Role, commands: CliCommandDefinition[]): void {
  const recommended = getRecommendedCommands(commands);

  process.stdout.write([
    `alpha CLI ${CLI_VERSION}`,
    '',
    `当前 role: ${role}`,
    '运行要求：Node.js >= 16',
    '',
    '用法：',
    '  alpha [--role full|ci|deploy|iter|rbac|file] [--output compact|normal|verbose] [--recommend] <command> [options]',
    '  alpha [--role=full|ci|deploy|iter|rbac|file] [--output=compact|normal|verbose] [--recommend=true|false] <command> [options]',
    '',
    '快速开始：',
    '  alpha initAlpha --url https://host --token xxx --save true',
    '  alpha whoami                                 校验当前 Alpha 账号',
    '  alpha devopsScene --input https://host/main/devops/iteration/list',
    '  alpha list                                    查看当前 role 可用命令（按场景分组）',
    '  alpha help <command>                          查看命令参数和示例',
    '  alpha --output verbose <command>              获取完整原始响应',
    '  alpha install / alpha update                  安装/更新全局 CLI，打印 ASCII Banner',
    '',
    'AI 友好提示：',
    '  - compact / normal / verbose 都不会裁剪数据；三者数据等价，仅影响 meta 字段聚合与人类可读格式化',
    '  - 传 --recommend 后，会在 JSON 的 meta.next 注入结构化下一步推荐，适合 Agent / 脚本串联',
    '  - 交互式终端 + compact 模式下，healthHealthPing / whoami / userinfo / getAlphaConfig / iterGetTree 会输出人类可读摘要；管道/脚本/AI 与 normal/verbose 返回原始 JSON',
    '  - 写命令（deploy*、ciBuildCancel、iterHotfixMerge 等）会通过 meta 给出 confirm 提示',
    '  - 场景识别支持 devops URL / 路由 / 页面路径，先输出 matchedServer、routeKind、params 再决定后续命令',
    '  - 未知参数会直接报错并列出所有支持参数，避免 AI 试错',
    '',
    '常用命令：',
    ...recommended.map((item) => `  - ${item.name.padEnd(24)} ${item.description}`),
    '',
    '输出模式：',
    '  compact  默认模式，数据与 verbose 等价；交互式终端下少数命令输出人类可读摘要',
    '  normal   JSON + 常用 meta 字段（command、method、path、group、total 等）',
    '  verbose  返回完整原始 JSON',
    '',
    '更多帮助：',
    '  alpha list --raw           仅输出命令名，适合脚本处理',
    '  alpha help <command>       查看单个命令的参数和示例',
    '',
  ].join('\n'));
}

export function printCommandList(
  role: Role,
  commands: CliCommandDefinition[],
  builtinCommandNames: string[],
): void {
  const lines = [
    'alpha 可用命令',
    '',
    `当前 role: ${role}`,
    `命令数量：${builtinCommandNames.length + commands.length}`,
    '',
  ];

  const groups = buildCommandGroups(commands, builtinCommandNames);
  for (const group of groups) {
    if (group.commands.length === 0) continue;
    lines.push(`${group.title}：`);
    for (const command of group.commands) {
      lines.push(`  - ${command.name.padEnd(28)} ${command.description}`);
    }
    lines.push('');
  }

  lines.push(
    '下一步：',
    '  - 查看参数：alpha help <command>，例如 alpha help ciBuildList',
    '  - 查看原始命令名：alpha list --raw',
    '  - 切换角色命令集：alpha --role ci list',
    '',
  );

  process.stdout.write(lines.join('\n'));
}

export function printCommandHelp(commandName: string, schema: ZodRawShape, metadata?: CliCommandMetadata): void {
  const entries = Object.entries(schema);
  const lines = [
    `alpha ${commandName}`,
    '',
  ];

  if (metadata?.description) {
    lines.push('说明：', `  ${metadata.description}`, '');
  }

  lines.push(
    '用法：',
    `  alpha ${commandName}${entries.length > 0 ? ' [--key value ...]' : ''}`,
  );

  if (entries.length > 0) {
    lines.push(`  alpha ${commandName} [--key=value ...]`);
  }

  lines.push(`  alpha help ${commandName}`, '');

  if (entries.length > 0) {
    lines.push('参数：', ...entries.map(formatParameterHelp), '');
  } else {
    lines.push('参数：', '  此命令无参数。', '');
  }

  if (metadata?.examples?.length) {
    lines.push('示例：', ...metadata.examples.map((example) => `  ${example}`), '');
  }

  if (metadata?.costHint || metadata?.nextBestTools?.length) {
    lines.push('提示：');
    if (metadata.costHint) lines.push(`  预估成本：${metadata.costHint}`);
    if (metadata.nextBestTools?.length) lines.push(`  下一步：${metadata.nextBestTools.join('、')}`);
    lines.push('');
  }

  process.stdout.write(lines.join('\n'));
}

export function getBuiltinCommandHelp(commandName: string): string | undefined {
  const normalized = commandName === '--version' || commandName === '-v' ? 'version' : commandName;
  const builtins: Record<string, string> = {
    help: [
      'alpha help',
      '',
      '用法：',
      '  alpha help [command]',
      '',
      '说明：',
      '  不传 command 时输出总帮助；传入命令名时输出该命令的参数帮助。',
      '',
    ].join('\n'),
    list: [
      'alpha list',
      '',
      '用法：',
      '  alpha list',
      '  alpha list --raw',
      '',
      '说明：',
      '  默认按功能分组列出当前 role 可用命令。',
      '  需要脚本处理时使用 --raw，仅输出命令名。',
      '',
    ].join('\n'),
    version: [
      'alpha version',
      '',
      '用法：',
      '  alpha version',
      '  alpha --version',
      '  alpha -v',
      '',
      '说明：',
      '  输出当前 CLI 版本号。',
      '',
    ].join('\n'),
    install: [
      'alpha install',
      '',
      '用法：',
      '  alpha install',
      '  alpha install --skip-config-check',
      '  alpha install --skill-source git',
      '  alpha install --cli-only true',
      '',
      '说明：',
      '  通过 npm 全局安装最新 alpha-cli，并安装 alpha skill。',
      '  --skip-config-check  仅安装，跳过配置校验',
      '  --skill-source local|git|npm  skill 来源',
      '  --cli-only / --skill-only  只装 CLI 或只装 skill',
      '',
    ].join('\n'),
    uninstall: [
      'alpha uninstall',
      '',
      '用法：',
      '  alpha uninstall',
      '  alpha uninstall --confirm true',
      '  alpha uninstall --confirm true --keep-config true',
      '  alpha remove --confirm true --cli-only true',
      '',
      '说明：',
      '  卸载 alpha skill（项目级 + 全局级）、全局 CLI 和 ~/.alpha/config.json。',
      '  不传 --confirm 时输出预览；真实执行需要 --confirm true。',
      '  --keep-config  保留配置',
      '  --cli-only     只卸载 CLI',
      '  --skill-only   只卸载 skill',
      '',
    ].join('\n'),
    remove: [
      'alpha uninstall',
      '',
      '说明：',
      '  uninstall 的别名。',
      '',
    ].join('\n'),
    update: [
      'alpha update',
      '',
      '用法：',
      '  alpha update',
      '  alpha upgrade',
      '  alpha update --skip-config-check',
      '',
      '说明：',
      '  更新全局 alpha-cli 和 alpha skill 到最新版本，并在成功后打印 ASCII Banner。',
      '',
    ].join('\n'),
    upgrade: [
      'alpha update',
      '',
      '用法：',
      '  alpha update',
      '  alpha upgrade',
      '',
      '说明：',
      '  update 的别名。',
      '',
    ].join('\n'),
    changelog: [
      'alpha changelog',
      '',
      '用法：',
      '  alpha changelog',
      '  alpha changelog --limit 10',
      '  alpha changelog --limit all',
      '  alpha changelog --version 0.1.0',
      '  alpha changelog --since 2026-06-01',
      '  alpha changelog --raw',
      '',
      '说明：',
      '  从 CHANGELOG.md 读取变更日志。',
      '  --limit     显示最近 N 个版本，默认 5',
      '  --version   只显示指定版本',
      '  --since     只显示 >= 指定日期 (YYYY-MM-DD) 的版本',
      '  --raw       直接输出原始 CHANGELOG 内容',
      '',
    ].join('\n'),
  };

  return builtins[normalized];
}

function buildCommandGroups(
  commands: CliCommandDefinition[],
  builtinCommandNames: string[],
): Array<{ title: string; commands: Array<{ name: string; description: string }> }> {
  const scenarioMap = buildScenarioGroups(commands);
  const groups: Array<{ title: string; commands: Array<{ name: string; description: string }> }> = [];

  groups.push({
    title: '开始使用',
    commands: builtinCommandNames.map((name) => ({ name, description: describeBuiltin(name) })),
  });

  for (const scenario of SCENARIO_ORDER) {
    const items = scenarioMap.get(scenario.key) ?? [];
    if (items.length === 0) continue;
    groups.push({ title: scenario.title, commands: items });
  }

  const accounted = new Set<string>();
  for (const scenario of SCENARIO_ORDER) {
    for (const item of scenarioMap.get(scenario.key) ?? []) accounted.add(item.name);
  }

  const ungrouped = commands
    .filter((command) => !accounted.has(command.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((command) => ({ name: command.name, description: describeCommand(command) }));

  if (ungrouped.length > 0) {
    groups.push({ title: '其他', commands: ungrouped });
  }

  return groups;
}

interface ScenarioDef {
  key: string;
  title: string;
  match: (command: CliCommandDefinition) => boolean;
}

const SCENARIO_ORDER: ScenarioDef[] = [
  { key: 'connect', title: '服务连通与初始化', match: (command) => command.metadata?.group === 'root' || command.metadata?.group === 'init' },
  { key: 'scene', title: '场景识别', match: (command) => command.metadata?.group === 'scene' },
  { key: 'ci', title: '构建与流水线（CI）', match: (command) => command.metadata?.group === 'ci' },
  { key: 'deploy', title: '发布与部署', match: (command) => command.metadata?.group === 'deploy' },
  { key: 'file', title: '文件与制品', match: (command) => command.metadata?.group === 'file' },
  { key: 'iter', title: '迭代与版本', match: (command) => command.metadata?.group === 'iter' },
  { key: 'rbac', title: '权限与角色', match: (command) => command.metadata?.group === 'rbac' },
];

function buildScenarioGroups(commands: CliCommandDefinition[]): Map<string, Array<{ name: string; description: string }>> {
  const grouped = new Map<string, Array<{ name: string; description: string }>>();
  for (const scenario of SCENARIO_ORDER) {
    grouped.set(scenario.key, []);
  }

  for (const command of commands) {
    for (const scenario of SCENARIO_ORDER) {
      if (scenario.match(command)) {
        grouped.get(scenario.key)?.push({ name: command.name, description: describeCommand(command) });
        break;
      }
    }
  }

  for (const [, items] of grouped) {
    items.sort((left, right) => left.name.localeCompare(right.name));
  }

  return grouped;
}

function getRecommendedCommands(commands: CliCommandDefinition[]): Array<{ name: string; description: string }> {
  const names = new Set(commands.map((command) => command.name));
  const candidates = [
    { name: 'whoami', description: '校验当前 Alpha 账号' },
    { name: 'devopsScene', description: '识别 devops 浏览器上下文并给出命令建议' },
    { name: 'initAlpha', description: '初始化 Alpha 连接配置' },
    { name: 'getAlphaConfig', description: '查看当前 Alpha 配置' },
    { name: 'healthHealthPing', description: '检查服务存活' },
    { name: 'ciBuildList', description: '查看构建列表' },
    { name: 'deployAppsPage', description: '查看部署应用分页' },
    { name: 'fileMetadataDownload', description: '下载文件资源' },
  ];

  return candidates.filter((item) => names.has(item.name));
}

export function formatCommandOutput(commandName: string, text: string): string {
  switch (commandName) {
    case 'healthHealthPing':
    case 'userinfo':
    case 'whoami':
    case 'who-am-i':
      return formatUserInfo(text);
    case 'getAlphaConfig':
      return formatAlphaConfig(text);
    case 'iterGetTree':
      return formatIterTree(text);
    default:
      return text;
  }
}

function formatHealthPing(text: string): string {
  const data = tryParseJson(text);
  if (!data) return text;

  if (typeof data === 'object' && data !== null) {
    const status = (data as { status?: string }).status ?? 'unknown';
    const uptime = (data as { uptime?: number }).uptime;
    const uptimeHint = typeof uptime === 'number' ? `运行 ${uptime}s` : '';
    return [
      '服务存活：',
      `  状态：${status}`,
      uptimeHint ? `  ${uptimeHint}` : '',
      '下一步：',
      '  - 校验账号：alpha whoami',
      '  - 查看配置：alpha getAlphaConfig',
    ].filter(Boolean).join('\n');
  }

  return text;
}

function formatUserInfo(text: string): string {
  const data = tryParseJson(text) as Record<string, unknown> | null;
  if (!data) return text;

  const name = data.name ?? data.username ?? data.account ?? '未知';
  const role = data.role ?? data.roles ?? '未知';
  const email = data.email ?? data.mail;

  return [
    '当前账号：',
    `  姓名：${String(name)}`,
    `  角色：${typeof role === 'string' ? role : JSON.stringify(role)}`,
    email ? `  邮箱：${String(email)}` : '',
    '下一步：',
    '  - 查看我能做什么：alpha --role <role> list',
    '  - 切换角色：alpha --role full list',
  ].filter(Boolean).join('\n');
}

function formatAlphaConfig(text: string): string {
  const data = tryParseJson(text);
  if (!data) return text;

  return [
    '当前 Alpha 配置：',
    `  url：${(data as { url?: string }).url ?? '(未配置)'}`,
    `  token：${(data as { token?: string }).token ?? '(未配置)'}`,
    `  username：${(data as { username?: string }).username ?? '(未配置)'}`,
    `  timeoutMs：${(data as { timeoutMs?: number }).timeoutMs ?? 30000}`,
    '下一步：',
    '  - 重新初始化：alpha initAlpha --url https://host --token xxx --save true',
    '  - 使用环境变量：export ALPHA_URL / ALPHA_TOKEN',
  ].join('\n');
}

function formatIterTree(text: string): string {
  const data = tryParseJson(text);
  if (!Array.isArray(data)) return text;

  const top = data.slice(0, 10);
  return [
    `迭代树节点数：${data.length}`,
    ...top.map((item) => {
      if (typeof item !== 'object' || item === null) return `  - ${String(item)}`;
      const record = item as Record<string, unknown>;
      const name = record.name ?? record.title ?? '(未命名)';
      const id = record.id ?? record.key;
      return `  - ${name}${id ? ` (#${id})` : ''}`;
    }),
    data.length > top.length ? `  ... 其余 ${data.length - top.length} 项省略（--output verbose 查看全部）` : '',
    '下一步：',
    '  - 查看版本列表：alpha iterVersionList',
    '  - 查看热门版本：alpha iterVersionTagList',
  ].filter(Boolean).join('\n');
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function describeBuiltin(commandName: string): string {
  const descriptions: Record<string, string> = {
    help: '查看总帮助或命令参数',
    list: '列出当前 role 可用命令',
    version: '查看 CLI 版本',
    install: '安装全局 CLI 和 skill',
    uninstall: '卸载 CLI 和 skill',
    remove: 'uninstall 的别名',
    update: '更新全局 CLI 和 skill',
    upgrade: 'update 的别名',
    changelog: '查看 CHANGELOG 变更日志',
  };

  return descriptions[commandName] ?? '内置命令';
}

function describeCommand(command: CliCommandDefinition): string {
  return command.metadata?.description ?? `查看参数：alpha help ${command.name}`;
}

function formatParameterHelp([key, fieldSchema]: [string, ZodTypeAny]): string {
  const description = fieldSchema.description ? `：${fieldSchema.description}` : '';
  return `  --${key} <${describeSchema(fieldSchema)}>${isOptionalSchema(fieldSchema) ? ' （可选）' : ' （必填）'}${description}`;
}

function describeSchema(schema: ZodTypeAny): string {
  const unwrapped = unwrapSchema(schema);
  if (unwrapped instanceof z.ZodNumber) return 'number';
  if (unwrapped instanceof z.ZodBoolean) return 'boolean';
  if (unwrapped instanceof z.ZodArray) return 'array';
  if (unwrapped instanceof z.ZodEnum) return unwrapped.options.join('|');
  if (unwrapped instanceof z.ZodObject || unwrapped instanceof z.ZodRecord) return 'json';
  return 'string';
}

function isOptionalSchema(schema: ZodTypeAny): boolean {
  return schema instanceof z.ZodOptional || schema instanceof z.ZodDefault || schema instanceof z.ZodNullable;
}

function unwrapSchema(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return unwrapSchema(schema.unwrap());
  if (schema instanceof z.ZodDefault) return unwrapSchema((schema._def as { innerType: ZodTypeAny }).innerType);
  if (schema instanceof z.ZodEffects) return unwrapSchema(schema.innerType());
  return schema;
}
