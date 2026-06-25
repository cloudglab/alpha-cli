#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = resolve(rootDir, 'dist/bin/alpha.js');
const dryRun = process.argv.includes('--dry-run');
const continueOnError = process.argv.includes('--continue-on-error');

const env = (name, fallback = undefined) => process.env[name] || fallback;
const value = (name, fallback = undefined) => env(`ALPHA_SMOKE_${name}`, fallback);

const vars = {
  account: value('ACCOUNT', process.env.ALPHA_USERNAME || 'smoke'),
  city: value('CITY', 'hzcore'),
  productId: value('PRODUCT_ID'),
  versionId: value('VERSION_ID'),
  appName: value('APP_NAME'),
  version: value('VERSION'),
  repoId: value('REPO_ID'),
  branch: value('BRANCH', 'main'),
  buildId: value('BUILD_ID'),
  fileId: value('FILE_ID'),
  clusterId: value('CLUSTER_ID'),
  materialId: value('MATERIAL_ID'),
  projectId: value('PROJECT_ID'),
  userId: value('USER_ID'),
  roleId: value('ROLE_ID'),
};

// 重要：只读命令与未传 ID 的命令会跳过；写命令默认不在 smoke 范围。
const schemaChecks = [
  'healthHealthPing', 'userinfo', 'uid', 'testApi',
  'ciBuildList', 'ciBuildGetLatest', 'ciBuildGetSelfBuild',
  'ciBranchList', 'ciInfoGetServerTime', 'ciManageGetPipelines',
  'ciManageGetTemplateList', 'ciRepoList',
  'deployAppsPage', 'deployClusterList', 'deployChartsPage',
  'deployMaterialPage', 'deployPushenvList',
  'fileMetadataPage', 'fileMetadataTypes',
  'iterGetTree', 'iterVersionList', 'iterVersionTagList', 'iterHotfixList',
  'rbacPrivilegeCurrentList', 'rbacRoleCurrentList',
].map((name) => ({
  label: `help:${name}`,
  args: ['help', name],
  kind: 'text',
  validate: (text) => {
    if (!text.includes(name)) throw new Error(`help 输出未包含命令名 ${name}`);
    if (!text.includes('用法：')) throw new Error(`help 输出未包含用法区块 ${name}`);
  },
}));

const liveQueries = [
  textCmd('list', ['list'], (text) => expectIncludes(text, ['healthHealthPing', 'initAlpha'])),
  textCmd('list:raw', ['list', '--raw'], (text) => {
    const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
    if (lines.length === 0) throw new Error('list --raw 输出为空');
  }),
  textCmd('help:version', ['help', 'version'], (text) => expectIncludes(text, ['alpha version', '用法：'])),
  textCmd('help:install', ['help', 'install'], (text) => expectIncludes(text, ['alpha install'])),
  textCmd('help:uninstall', ['help', 'uninstall'], (text) => expectIncludes(text, ['alpha uninstall', '--confirm'])),
  textCmd('help:changelog', ['help', 'changelog'], (text) => expectIncludes(text, ['alpha changelog', '--limit'])),
  textCmd('version', ['version'], (text) => {
    if (!/^\d+\.\d+\.\d+/.test(text)) throw new Error(`version 输出格式错误: ${text}`);
  }),
  jsonCmd('healthHealthPing', ['healthHealthPing'], (data) => expectObject(data, 'healthHealthPing')),
  jsonCmd('userinfo', ['userinfo'], (data) => {
    expectObject(data, 'userinfo');
    if (!readAny(data, ['account', 'username', 'name'])) throw new Error('userinfo 缺少 account/username/name');
  }),
  jsonCmd('testApi', ['testApi'], () => undefined),
  jsonCmd('ciBuildGetSelfBuild', ['ciBuildGetSelfBuild'], (data) => expectArrayish(data, 'ciBuildGetSelfBuild')),
  jsonCmd('ciInfoGetServerTime', ['ciInfoGetServerTime'], (data) => expectObject(data, 'ciInfoGetServerTime')),
  jsonCmd('ciManageGetPipelines', ['ciManageGetPipelines'], (data) => expectArrayish(data, 'ciManageGetPipelines')),
  jsonCmd('ciManageGetTemplateList', ['ciManageGetTemplateList'], (data) => expectArrayish(data, 'ciManageGetTemplateList')),
  jsonCmd('ciRepoList', ['ciRepoList'], (data) => expectArrayish(data, 'ciRepoList')),
  jsonCmd('deployClusterList', ['deployClusterList'], (data) => expectArrayish(data, 'deployClusterList')),
  jsonCmd('deployClusterTypeList', ['deployClusterTypeList'], (data) => expectArrayish(data, 'deployClusterTypeList')),
  jsonCmd('deployPushenvList', ['deployPushenvList'], (data) => expectArrayish(data, 'deployPushenvList')),
  jsonCmd('deployMaterialList', ['deployMaterialList'], (data) => expectArrayish(data, 'deployMaterialList')),
  jsonCmd('fileMetadataTypes', ['fileMetadataTypes'], (data) => expectArrayish(data, 'fileMetadataTypes')),
  jsonCmd('iterVersionTagList', ['iterVersionTagList'], (data) => expectArrayish(data, 'iterVersionTagList')),
  jsonCmd('iterGetTree', ['iterGetTree'], (data) => expectArray(data, 'iterGetTree')),
  jsonCmd('rbacPrivilegeCurrentList', ['rbacPrivilegeCurrentList'], (data) => expectArrayish(data, 'rbacPrivilegeCurrentList')),
  jsonCmd('rbacRoleCurrentList', ['rbacRoleCurrentList'], (data) => expectArrayish(data, 'rbacRoleCurrentList')),
  jsonCmd('initAlpha:dryRun', ['initAlpha', '--url', 'https://alpha.example.com', '--token', 'dry-run-token'], (data) => {
    expectObject(data, 'initAlpha');
    if (data.saved !== false) throw new Error('initAlpha 不带 --save 时不应落盘');
  }),
  jsonCmd('devopsScene', ['devopsScene', '--input', 'https://host/main/devops/iteration/list'], (data) => {
    expectObject(data, 'devopsScene');
    if (!data.routeKind) throw new Error('devopsScene 输出缺少 routeKind');
  }),
  deferredJsonCmd('ciBuildGetBuild', (state) => state.buildId ? ['ciBuildGetBuild', '--body', JSON.stringify({ id: Number(state.buildId) })] : null, (data) => expectObject(data, 'ciBuildGetBuild')),
  deferredJsonCmd('ciBuildList:repo', (state) => state.repoId ? ['ciBuildList', '--body', JSON.stringify({ repoId: Number(state.repoId), branch: state.branch, page: 1, count: 5 })] : null, (data) => expectItems(data, 'ciBuildList')),
  deferredJsonCmd('deployMaterialDetail', (state) => state.materialId ? ['deployMaterialDetail', '--body', JSON.stringify({ id: Number(state.materialId) })] : null, (data) => expectObject(data, 'deployMaterialDetail')),
  deferredJsonCmd('deployClusterDetail', (state) => state.clusterId ? ['deployClusterDetail', '--body', JSON.stringify({ id: Number(state.clusterId) })] : null, (data) => expectObject(data, 'deployClusterDetail')),
  deferredJsonCmd('iterVersionDetail', (state) => state.versionId ? ['iterVersionDetail', '--body', JSON.stringify({ id: Number(state.versionId) })] : null, (data) => expectObject(data, 'iterVersionDetail')),
  deferredJsonCmd('ciBuildFind', (state) => state.appName && state.version ? ['ciBuildFind', '--app', `${state.appName}:${state.version}`] : null, (data) => {
    expectObject(data, 'ciBuildFind');
    if (data.found !== true) throw new Error('ciBuildFind 未返回 found=true');
  }),
];

const commands = [...schemaChecks, ...liveQueries];

if (!dryRun && !existsSync(cliPath)) {
  console.error('缺少 dist/bin/alpha.js，请先运行 pnpm build。');
  process.exit(1);
}

let passed = 0;
let skipped = 0;
let failed = 0;
const state = { ...vars };

for (const item of commands) {
  const resolved = resolveCommand(item, state);
  if (resolved.skip) {
    skipped += 1;
    console.log(`SKIP ${item.label}: ${resolved.reason}`);
    continue;
  }

  const printable = ['alpha', ...resolved.args].join(' ');
  if (dryRun) {
    passed += 1;
    console.log(`DRY  ${printable}`);
    continue;
  }

  console.log(`RUN  ${printable}`);
  const result = spawnSync(process.execPath, [cliPath, ...resolved.args], {
    cwd: rootDir,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.status !== 0) {
    failed += 1;
    console.error(`FAIL ${item.label}`);
    if (result.stdout) console.error(result.stdout.trim());
    if (result.stderr) console.error(result.stderr.trim());
    if (!continueOnError) break;
    continue;
  }

  try {
    validateOutput(item, result.stdout, state);
    passed += 1;
    console.log(`OK   ${item.label}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${item.label}`);
    console.error(error instanceof Error ? error.message : String(error));
    if (result.stdout) console.error(result.stdout.trim());
    if (!continueOnError) break;
  }
}

console.log(`\nSummary: passed=${passed}, skipped=${skipped}, failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);

function jsonCmd(label, args, validate) {
  return { label, args, kind: 'json', validate };
}

function deferredJsonCmd(label, getArgs, validate) {
  return { label, getArgs, kind: 'json', validate };
}

function textCmd(label, args, validate) {
  return { label, args, kind: 'text', validate };
}

function resolveCommand(item, state) {
  if (item.getArgs) {
    const args = item.getArgs(state);
    if (!args) return { skip: true, reason: '缺少前置环境变量' };
    return { skip: false, args };
  }
  if (item.args.some((arg) => arg === undefined || arg === '')) {
    return { skip: true, reason: '缺少必需环境变量' };
  }
  return { skip: false, args: item.args };
}

function validateOutput(item, stdout, state) {
  const text = stdout.trim();
  if (item.kind === 'text') {
    item.validate(text, state);
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${item.label} 输出不是合法 JSON`);
  }
  item.validate(parsed, state);
}

function expectItems(data, label) {
  expectObject(data, label);
  const items = readAny(data, ['items', 'list', 'rows', 'data']);
  if (!Array.isArray(items)) throw new Error(`${label} 未返回可识别列表字段`);
  return items;
}

function expectArrayish(data, label) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return data;
  throw new Error(`${label} 返回既不是对象也不是数组`);
}

function expectObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 返回不是对象`);
  return value;
}

function expectArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} 不是数组`);
}

function expectIncludes(text, parts) {
  for (const part of parts) {
    if (!text.includes(part)) throw new Error(`文本未包含: ${part}`);
  }
}

function readAny(root, paths) {
  for (const path of paths) {
    const value = readPath(root, path);
    if (value !== undefined) return value;
  }
  return undefined;
}

function readPath(root, path) {
  const segments = path.split('.');
  let current = root;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}
