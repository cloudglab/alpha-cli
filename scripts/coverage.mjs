#!/usr/bin/env node
// Zero-dependency coverage checker: alpha-cli CLI tools vs javams-glab-alpha HTTP controllers
// Usage:
//   node scripts/coverage.mjs               # human-readable report
//   node scripts/coverage.mjs --json       # JSON to stdout
//   node scripts/coverage.mjs --json path   # JSON to file
//   node scripts/coverage.mjs --missing     # print all missing entries
//   node scripts/coverage.mjs --missing <module>  # print one module's missing entries

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');

// ---------- CLI args ----------
const argv = process.argv.slice(2);
const JSON_IDX = argv.indexOf('--json');
const MISSING_IDX = argv.indexOf('--missing');
const wantJson = JSON_IDX !== -1;
const jsonOutPath = wantJson && argv[JSON_IDX + 1] && !argv[JSON_IDX + 1].startsWith('-')
  ? argv[JSON_IDX + 1]
  : null;
const wantMissing = MISSING_IDX !== -1;
const missingModule = wantMissing && argv[MISSING_IDX + 1] && !argv[MISSING_IDX + 1].startsWith('-')
  ? argv[MISSING_IDX + 1]
  : null;

// ---------- Module list ----------
const MODULES = ['root', 'ci', 'deploy', 'file', 'iter', 'rbac'];

// ---------- Entries (HTTP endpoint path → path tail, hand-verified from javams-glab-alpha controllers) ----------
// 每个 entry 是 path 的最后一段；alias 是 CLI 命令名。CLI 命令名直接由 endpoints.ts 自动生成，
// 只要 endpoint 出现在 ENDPOINTS 数组里，就算覆盖。
const ENTRIES = {
  root: ['login', 'userinfo', 'uid', 'logout', 'test-api', 'health/health/ping'],
  ci: [
    'app/sync', 'branch/list', 'branch/search',
    'build/getBuild', 'build/manualProcess', 'build/freedomBuild', 'build/freedomTags',
    'build/paramsBuild', 'build/list', 'build/popularList', 'build/getLatest', 'build/getSelfBuild',
    'build/cancel',
    'info/changeInfo', 'info/getServerTime', 'info/jenkins-output', 'info/getRelCommit',
    'manage/getPipelines', 'manage/getTemplateList', 'manage/setConfig', 'manage/getConfig',
    'manage/updateConfig', 'manage/clearCache', 'manage/resetVersion', 'manage/sync-ci-config',
    'repo/list', 'repo/page', 'repo/info', 'repo/add', 'repo/config-detail',
  ],
  deploy: [
    'apps/sync', 'apps/page', 'apps/version-list', 'apps/ns-list',
    'apps/install', 'apps/azDeploy', 'apps/upgrade', 'apps/uninstall', 'apps/rollback',
    'apps/recent-list', 'apps/view-k8s', 'apps/detail-k8s', 'apps/refresh-resource',
    'apps/log-url', 'apps/bash-url', 'apps/view-history', 'apps/image-version',
    'charts/page', 'charts/detail', 'charts/version', 'charts/values', 'charts/deploy-status',
    'cluster/add', 'cluster/edit', 'cluster/page', 'cluster/list', 'cluster/detail',
    'cluster/type-list', 'cluster/destinations',
    'material/add', 'material/edit', 'material/upload', 'material/page', 'material/list',
    'material/detail', 'material/sync',
    'project/azProList', 'project/azUserList', 'project/azProjectAdd',
    'project/azDeploy', 'project/retry-azDeploy', 'project/deploy', 'project/retry-deploy',
    'project/deploy-page', 'project/deploy-page-expand',
    'project/push', 'project/file-push', 'project/push-goon',
    'project/push-list', 'project/push-page', 'project/push-page-expand',
    'pushenv/add', 'pushenv/page', 'pushenv/list', 'pushenv/edit', 'pushenv/detail',
  ],
  file: ['metadata/page', 'metadata/types', 'metadata/download', 'metadata/preview', 'metadata/add'],
  iter: [
    'hotfix/save', 'hotfix/list', 'hotfix/detail', 'hotfix/merge',
    'prod/add', 'prod/getList', 'project/add', 'project/getList', 'project/delete',
    'getTree',
    'version/add', 'version/switchAz2resourceUrl', 'version/switchGflow2resourceUrl',
    'version/switchEnvInit2resourceUrl', 'version/switchUdf2resourceUrl',
    'version/disable', 'version/edit', 'version/detail', 'version/merge-his',
    'version/list', 'version/tag-list', 'version/delete',
    'version/testVersionSave', 'version/testVersionList', 'version/testVersionDetail',
    'version/testVersionSubmit', 'version/testVersionCount',
    'version/getTree', 'version/getRecentTestSubmitted',
  ],
  rbac: ['privilege/current-list', 'privilege/list', 'privilege/assign-privileges', 'role/current-list', 'role/assign-roles'],
};

// ---------- Alias map: entry -> CLI tool name(s) ----------
// CLI 工具名 = camelCase(endpoint.path 的最后一段)，与 endpoints.ts 的命名规则保持一致。
function toCamel(entry) {
  return entry
    .split('/')
    .map((seg) => seg.replace(/[-_]/g, ' ').split(' ').map((w, i) => i === 0 ? w : w[0].toUpperCase() + w.slice(1)).join(''))
    .map((seg, i) => i === 0 ? seg[0].toUpperCase() + seg.slice(1) : seg[0].toUpperCase() + seg.slice(1))
    .join('');
}

function buildAlias() {
  const alias = {};
  for (const mod of MODULES) {
    for (const entry of ENTRIES[mod]) {
      const key = `${mod}|${entry}`;
      // 第一个分段作为 group prefix：apps -> deployApps, branch -> ciBranch, ...
      const firstSeg = entry.split('/')[0];
      const camel = toCamel(entry);
      // entry 转出来的 camelCase 自身就是 deployAppsSync / ciBranchList / iterVersionAdd 等
      // 修正 root/login 这种多段（health/health/ping -> HealthHealthPing）
      // 这里直接以生成的 camelCase 命名。
      alias[key] = [camel];
    }
  }
  return alias;
}

const ALIAS = buildAlias();

// ---------- Helpers ----------
function getCliToolNames(repo) {
  const toolsDir = join(repo, 'src', 'tools');
  if (!existsSync(toolsDir)) return new Set();
  const files = readdirSync(toolsDir).filter((f) => f.endsWith('.ts'));
  if (files.length === 0) return new Set();

  let combined = '';
  for (const f of files) {
    combined += readFileSync(join(toolsDir, f), 'utf8') + '\n';
  }

  const names = new Set();
  const callRe = /server\.tool\s*\(/g;
  const stringRe = /(['"`])([a-zA-Z][a-zA-Z0-9_]*)\1/g;
  let m;
  while (true) {
    m = callRe.exec(combined);
    if (m === null) break;
    let i = m.index + m[0].length;
    let depth = 1;
    let inStr = null;
    while (i < combined.length && depth > 0) {
      const ch = combined[i];
      if (inStr) {
        if (ch === '\\') { i += 2; continue; }
        if (ch === inStr) inStr = null;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; i++; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (depth === 0) break;
      i++;
    }
    const block = combined.slice(m.index, i + 1);
    stringRe.lastIndex = 0;
    const sm = stringRe.exec(block);
    if (sm) names.add(sm[2]);
  }
  return names;
}

function computeCoverage(cliSet) {
  const perModule = {};
  let totalCovered = 0;
  let totalEntries = 0;
  const allMissing = {};
  for (const mod of MODULES) {
    const entries = ENTRIES[mod] || [];
    let covered = 0;
    const missing = [];
    for (const e of entries) {
      const key = `${mod}|${e}`;
      const aliases = ALIAS[key] || [];
      const hit = aliases.some((name) => cliSet.has(name));
      if (hit) covered += 1;
      else missing.push(e);
    }
    perModule[mod] = {
      covered,
      total: entries.length,
      ratio: entries.length === 0 ? 0 : covered / entries.length,
      missing,
      entries,
    };
    totalCovered += covered;
    totalEntries += entries.length;
    allMissing[mod] = missing;
  }
  return {
    perModule,
    totalCovered,
    totalEntries,
    totalRatio: totalEntries === 0 ? 0 : totalCovered / totalEntries,
    allMissing,
  };
}

// ---------- Main ----------
function main() {
  const cliSet = getCliToolNames(REPO);
  const result = computeCoverage(cliSet);

  const payload = {
    total: cliSet.size,
    covered: result.totalCovered,
    entries: result.totalEntries,
    ratio: result.totalRatio,
    perModule: Object.fromEntries(
      Object.entries(result.perModule).map(([k, v]) => [k, {
        covered: v.covered,
        total: v.total,
        ratio: v.ratio,
        missing: v.missing,
      }])
    ),
    cliToolNames: [...cliSet].sort(),
    generatedAt: new Date().toISOString(),
  };

  if (wantJson) {
    const text = JSON.stringify(payload, null, 2);
    if (jsonOutPath) {
      writeFileSync(jsonOutPath, text);
    } else {
      process.stdout.write(text + '\n');
    }
    if (payload.ratio < 1) process.exitCode = 1;
    return;
  }

  if (wantMissing) {
    if (missingModule) {
      const m = result.perModule[missingModule];
      if (!m) {
        process.stderr.write(`Unknown module: ${missingModule}\n`);
        process.exit(2);
      }
      process.stdout.write(`${missingModule}: ${m.missing.join(', ')}\n`);
    } else {
      for (const mod of MODULES) {
        const m = result.perModule[mod];
        if (m.missing.length) {
          process.stdout.write(`${mod}: ${m.missing.join(', ')}\n`);
        }
      }
    }
    if (payload.ratio < 1) process.exitCode = 1;
    return;
  }

  // Default: human-readable summary.
  const lines = [];
  lines.push('=== alpha-cli vs javams-glab-alpha 控制器入口覆盖率 ===');
  lines.push(`CLI 工具总数: ${cliSet.size}`);
  lines.push('');
  lines.push('模块         覆盖  总数  比例');
  for (const mod of MODULES) {
    const m = result.perModule[mod];
    const pct = (m.ratio * 100).toFixed(0) + '%';
    lines.push(
      `${mod.padEnd(12)} ${String(m.covered).padStart(4)}  ${String(m.total).padStart(4)}  ${pct.padStart(4)}`
    );
  }
  lines.push(
    `${'合计'.padEnd(12)} ${String(result.totalCovered).padStart(4)}  ${String(result.totalEntries).padStart(4)}  ${(result.totalRatio * 100).toFixed(1)}%`
  );
  lines.push('');
  lines.push('=== 各模块缺失入口 ===');
  for (const mod of MODULES) {
    const m = result.perModule[mod];
    if (m.missing.length) {
      lines.push(`${mod}: ${m.missing.join(', ')}`);
    }
  }
  process.stdout.write(lines.join('\n') + '\n');

  if (payload.ratio < 1) process.exitCode = 1;
}

main();
