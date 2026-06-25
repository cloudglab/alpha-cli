import assert from 'node:assert/strict';
import test from 'node:test';

import { loadOpsEnvConfig, mergeOpsConfig, normalizeConfig } from '../src/core/config.js';

test('normalizeConfig 保留 ops 段并归一化 url', () => {
  const config = normalizeConfig({
    url: 'alpha.example.com',
    ops: { bastionHost: '1.1.1.1', downloadDir: '/data/x' },
  });

  assert.equal(config.url, 'https://alpha.example.com');
  assert.equal(config.ops?.bastionHost, '1.1.1.1');
  assert.equal(config.ops?.downloadDir, '/data/x');
});

test('normalizeConfig 对空 ops 返回 undefined', () => {
  const config = normalizeConfig({ url: 'https://alpha.example.com' });
  assert.equal(config.ops, undefined);
});

test('loadOpsEnvConfig 解析 ALPHA_OPS_* 环境变量', () => {
  const ops = loadOpsEnvConfig({
    ALPHA_OPS_BASTION: '192.168.60.101',
    ALPHA_OPS_TARGET: '192.168.8.45',
    ALPHA_OPS_SYSTEM_USER_ID: '1',
    ALPHA_OPS_CITIES: 'hzcore,bjcore,',
  });

  assert.equal(ops?.bastionHost, '192.168.60.101');
  assert.equal(ops?.targetServer, '192.168.8.45');
  assert.equal(ops?.systemUserId, '1');
  assert.deepEqual(ops?.cities, ['hzcore', 'bjcore']);
});

test('loadOpsEnvConfig 对空环境返回 undefined', () => {
  assert.equal(loadOpsEnvConfig({}), undefined);
});

test('mergeOpsConfig 把 base 与 override 做深合并（override 覆盖、base 保留）', () => {
  const merged = mergeOpsConfig(
    { bastionHost: 'from-base', downloadDir: '/data/base', targetServer: 'base-target' },
    { targetServer: 'env-target', rsyncScript: '/x/rsync.sh' },
  );

  // override 覆盖
  assert.equal(merged?.targetServer, 'env-target');
  // base 未被覆盖的字段保留
  assert.equal(merged?.bastionHost, 'from-base');
  assert.equal(merged?.downloadDir, '/data/base');
  // override 新增的字段生效
  assert.equal(merged?.rsyncScript, '/x/rsync.sh');
});

test('mergeOpsConfig 对非对象入参兜底为空对象', () => {
  const merged = mergeOpsConfig(null, { bastionHost: 'x' });
  assert.equal(merged?.bastionHost, 'x');

  const merged2 = mergeOpsConfig({ bastionHost: 'y' }, undefined);
  assert.equal(merged2?.bastionHost, 'y');
});

test('mergeOpsConfig 两边都为空时返回 undefined', () => {
  assert.equal(mergeOpsConfig({}, {}), undefined);
  assert.equal(mergeOpsConfig(null, undefined), undefined);
});

test('env 覆盖 config.json ops 的端到端语义：base.ops + env.ops 合并后字段齐全', () => {
  // 模拟 loadConfig 中 raw.ops（来自 config.json）与 envConfig.ops（来自 ALPHA_OPS_*）的合并
  const fileOps = { bastionHost: '192.168.60.101', downloadDir: '/data/pkg_release/fz_downloads' };
  const envOps = loadOpsEnvConfig({ ALPHA_OPS_TARGET: '192.168.8.45' });
  const merged = mergeOpsConfig(fileOps, envOps);

  assert.equal(merged?.bastionHost, '192.168.60.101', 'config.json 的 bastionHost 应保留');
  assert.equal(merged?.downloadDir, '/data/pkg_release/fz_downloads', 'config.json 的 downloadDir 应保留');
  assert.equal(merged?.targetServer, '192.168.8.45', 'env 覆盖的 targetServer 应生效');
});
