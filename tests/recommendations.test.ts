import assert from 'node:assert/strict';
import test from 'node:test';

import type { CliCommandDefinition } from '../src/core/cli-registry.js';
import { resolveRecommendations } from '../src/core/recommendations.js';

function makeCommand(definition: Partial<CliCommandDefinition> & Pick<CliCommandDefinition, 'name'>): CliCommandDefinition {
  return {
    name: definition.name,
    schema: definition.schema ?? {},
    handler: definition.handler ?? (() => ({ content: [{ type: 'text', text: '{}' }] })),
    metadata: definition.metadata,
  };
}

test('未声明 recommendations 时回退到 nextBestTools', () => {
  const command = makeCommand({
    name: 'source',
    metadata: { nextBestTools: ['target'] },
  });
  const commands = [command, makeCommand({ name: 'target' })];

  const result = resolveRecommendations({ command, commands, input: {}, payload: {} });

  assert.deepEqual(result, [{ tool: 'target', reason: '建议继续查看 target', priority: 0 }]);
});

test('按 priority 倒序并保留同优先级声明顺序', () => {
  const command = makeCommand({
    name: 'source',
    metadata: {
      recommendations: [
        { tool: 'b', reason: 'second', priority: 0 },
        { tool: 'a', reason: 'first', priority: 2 },
        { tool: 'c', reason: 'third', priority: 0 },
      ],
    },
  });
  const commands = [command, makeCommand({ name: 'a' }), makeCommand({ name: 'b' }), makeCommand({ name: 'c' })];

  const result = resolveRecommendations({ command, commands, input: {}, payload: {} });

  assert.deepEqual(result.map((item) => item.tool), ['a', 'b', 'c']);
});

test('正确解析 input 和 payload 路径并生成 example', () => {
  const command = makeCommand({
    name: 'ciBuildFind',
    metadata: {
      recommendations: [
        {
          tool: 'ciBuildWait',
          reason: '继续等待构建完成',
          priority: 1,
          args: {
            repoId: { source: 'payload', path: 'repoId' },
            branch: { source: 'payload', path: 'branch' },
            buildId: { source: 'payload', path: 'build.id' },
          },
        },
        {
          tool: 'ciBuildList',
          reason: '查看列表',
          priority: 0,
          args: {
            body: {
              repoId: { source: 'payload', path: 'repoId' },
              branch: { source: 'input', path: 'branch' },
            },
          },
        },
      ],
    },
  });
  const commands = [command, makeCommand({ name: 'ciBuildWait' }), makeCommand({ name: 'ciBuildList' })];

  const result = resolveRecommendations({
    command,
    commands,
    input: { branch: 'main' },
    payload: { repoId: 42, branch: 'release', build: { id: 1001 } },
  });

  assert.deepEqual(result[0], {
    tool: 'ciBuildWait',
    reason: '继续等待构建完成',
    priority: 1,
    args: { repoId: 42, branch: 'release', buildId: 1001 },
    example: 'alpha ciBuildWait --repoId 42 --branch release --buildId 1001',
  });
  assert.deepEqual(result[1], {
    tool: 'ciBuildList',
    reason: '查看列表',
    priority: 0,
    args: { body: { repoId: 42, branch: 'main' } },
    example: 'alpha ciBuildList --body {"repoId":42,"branch":"main"}',
  });
});

test('路径解析失败时保留条目但省略 args 和 example', () => {
  const command = makeCommand({
    name: 'source',
    metadata: {
      recommendations: [
        {
          tool: 'target',
          reason: 'fallback',
          args: { id: { source: 'payload', path: 'missing.id' } },
        },
      ],
    },
  });
  const commands = [command, makeCommand({ name: 'target' })];

  const result = resolveRecommendations({ command, commands, input: {}, payload: {} });

  assert.deepEqual(result, [{ tool: 'target', reason: 'fallback', priority: 0 }]);
});

test('支持从 payload 动态解析 tool 名称', () => {
  const command = makeCommand({
    name: 'devopsScene',
    metadata: { group: 'scene' },
  });
  const commands = [command, makeCommand({ name: 'ciBuildList' })];

  const result = resolveRecommendations({
    command,
    commands,
    input: {},
    payload: { primaryCommand: 'ciBuildList', suggestedCommands: ['ciBuildList'] },
  });

  assert.equal(result[0]?.tool, 'ciBuildList');
  assert.equal(result[0]?.reason, '直接执行当前页面最匹配的主命令');
});

test('支持数组参数回填到 example', () => {
  const command = makeCommand({
    name: 'pushPkg',
    metadata: {
      recommendations: [
        {
          tool: 'opsPush',
          reason: '重推',
          args: {
            urls: { source: 'payload', path: 'downloadLinks' },
            pkgName: { source: 'payload', path: 'pkgName' },
            city: { source: 'payload', path: 'city' },
          },
        },
      ],
    },
  });
  const commands = [command, makeCommand({ name: 'opsPush' })];

  const result = resolveRecommendations({
    command,
    commands,
    input: {},
    payload: {
      downloadLinks: ['http://a.tar', 'http://b.tar'],
      pkgName: 'pkg.tar',
      city: 'hzcore',
    },
  });

  assert.deepEqual(result[0]?.args, {
    urls: ['http://a.tar', 'http://b.tar'],
    pkgName: 'pkg.tar',
    city: 'hzcore',
  });
  assert.equal(result[0]?.example, 'alpha opsPush --urls http://a.tar --urls http://b.tar --pkgName pkg.tar --city hzcore');
});

test('嵌套 body 路径能精确回填详情命令参数', () => {
  const command = makeCommand({
    name: 'iterVersionList',
    metadata: {
      recommendations: [
        {
          tool: 'iterVersionDetail',
          reason: '查看详情',
          args: { body: { id: { source: 'input', path: 'body.id' } } },
        },
        {
          tool: 'iterVersionTestVersionList',
          reason: '查看提测',
          args: { body: { versionId: { source: 'input', path: 'body.id' } } },
        },
      ],
    },
  });
  const commands = [command, makeCommand({ name: 'iterVersionDetail' }), makeCommand({ name: 'iterVersionTestVersionList' })];

  const result = resolveRecommendations({
    command,
    commands,
    input: { body: { id: 1001 } },
    payload: {},
  });

  assert.deepEqual(result[0], {
    tool: 'iterVersionDetail',
    reason: '查看详情',
    priority: 0,
    args: { body: { id: 1001 } },
    example: 'alpha iterVersionDetail --body "{\"id\":1001}"',
  });
  assert.deepEqual(result[1], {
    tool: 'iterVersionTestVersionList',
    reason: '查看提测',
    priority: 0,
    args: { body: { versionId: 1001 } },
    example: 'alpha iterVersionTestVersionList --body "{\"versionId\":1001}"',
  });
});

test('精确 ID 缺失时保留推荐但省略 args/example', () => {
  const command = makeCommand({
    name: 'deployMaterialPage',
    metadata: {
      recommendations: [
        {
          tool: 'deployMaterialDetail',
          reason: '查看物料详情',
          args: { body: { id: { source: 'input', path: 'body.id' } } },
        },
      ],
    },
  });
  const commands = [command, makeCommand({ name: 'deployMaterialDetail' })];

  const result = resolveRecommendations({
    command,
    commands,
    input: { body: { page: 1, count: 20 } },
    payload: {},
  });

  assert.deepEqual(result, [{ tool: 'deployMaterialDetail', reason: '查看物料详情', priority: 0 }]);
});

test('支持 path 数组回退并优先使用 payload 首条记录', () => {
  const command = makeCommand({
    name: 'iterVersionList',
    metadata: {
      recommendations: [
        {
          tool: 'iterVersionDetail',
          reason: '查看版本详情',
          args: { body: { id: { source: 'payload', path: ['list.0.id', 'data.0.id', 'id'] } } },
        },
      ],
    },
  });
  const commands = [command, makeCommand({ name: 'iterVersionDetail' })];

  const result = resolveRecommendations({
    command,
    commands,
    input: { body: { id: 9999 } },
    payload: { list: [{ id: 1001 }, { id: 1002 }] },
  });

  assert.deepEqual(result, [{
    tool: 'iterVersionDetail',
    reason: '查看版本详情',
    priority: 0,
    args: { body: { id: 1001 } },
    example: 'alpha iterVersionDetail --body "{\"id\":1001}"',
  }]);
});

test('支持 source 数组回退到 input', () => {
  const command = makeCommand({
    name: 'iterVersionList',
    metadata: {
      recommendations: [
        {
          tool: 'iterVersionDetail',
          reason: '查看版本详情',
          args: { body: { id: { source: ['payload', 'input'], path: ['list.0.id', 'body.id'] } } },
        },
      ],
    },
  });
  const commands = [command, makeCommand({ name: 'iterVersionDetail' })];

  const result = resolveRecommendations({
    command,
    commands,
    input: { body: { id: 2002 } },
    payload: { list: [] },
  });

  assert.deepEqual(result, [{
    tool: 'iterVersionDetail',
    reason: '查看版本详情',
    priority: 0,
    args: { body: { id: 2002 } },
    example: 'alpha iterVersionDetail --body "{\"id\":2002}"',
  }]);
});

test('写命令推荐支持 payload 优先再回退 input', () => {
  const command = makeCommand({
    name: 'iterHotfixSave',
    metadata: {
      recommendations: [
        {
          tool: 'iterHotfixDetail',
          reason: '查看详情',
          args: { body: { id: { source: ['payload', 'input'], path: ['id', 'hotfixId', 'body.id'] } } },
        },
        {
          tool: 'iterHotfixList',
          reason: '回列表',
          args: { body: { versionId: { source: ['payload', 'input'], path: ['versionId', 'body.versionId'] } } },
        },
      ],
    },
  });
  const commands = [command, makeCommand({ name: 'iterHotfixDetail' }), makeCommand({ name: 'iterHotfixList' })];

  const fromPayload = resolveRecommendations({
    command,
    commands,
    input: { body: { versionId: 1001 } },
    payload: { id: 3001, versionId: 1001 },
  });
  assert.deepEqual(fromPayload[0], {
    tool: 'iterHotfixDetail',
    reason: '查看详情',
    priority: 0,
    args: { body: { id: 3001 } },
    example: 'alpha iterHotfixDetail --body "{\"id\":3001}"',
  });

  const fromInput = resolveRecommendations({
    command,
    commands,
    input: { body: { id: 3002, versionId: 1002 } },
    payload: {},
  });
  assert.deepEqual(fromInput[0], {
    tool: 'iterHotfixDetail',
    reason: '查看详情',
    priority: 0,
    args: { body: { id: 3002 } },
    example: 'alpha iterHotfixDetail --body "{\"id\":3002}"',
  });
});

test('提测保存与推包继续推荐能生成闭环下一步', () => {
  const testSave = makeCommand({
    name: 'iterVersionTestVersionSave',
    metadata: {
      recommendations: [
        {
          tool: 'iterVersionTestVersionDetail',
          reason: '查看提测详情',
          args: { body: { id: { source: ['payload', 'input'], path: ['testVersionId', 'id', 'body.id'] } } },
        },
        {
          tool: 'iterVersionTestVersionList',
          reason: '回提测列表',
          args: { body: { versionId: { source: ['payload', 'input'], path: ['versionId', 'body.versionId'] } } },
        },
      ],
    },
  });
  const testCommands = [testSave, makeCommand({ name: 'iterVersionTestVersionDetail' }), makeCommand({ name: 'iterVersionTestVersionList' })];
  const testResult = resolveRecommendations({
    command: testSave,
    commands: testCommands,
    input: { body: { versionId: 1001 } },
    payload: { testVersionId: 2001, versionId: 1001 },
  });
  assert.deepEqual(testResult[0], {
    tool: 'iterVersionTestVersionDetail',
    reason: '查看提测详情',
    priority: 0,
    args: { body: { id: 2001 } },
    example: 'alpha iterVersionTestVersionDetail --body "{\"id\":2001}"',
  });

  const pushGoon = makeCommand({
    name: 'deployProjectPushGoon',
    metadata: {
      recommendations: [
        {
          tool: 'deployProjectPushPageExpand',
          reason: '查看推包详情',
          args: { body: { id: { source: ['payload', 'input'], path: ['pushId', 'id', 'body.id'] } } },
        },
      ],
    },
  });
  const pushCommands = [pushGoon, makeCommand({ name: 'deployProjectPushPageExpand' })];
  const pushResult = resolveRecommendations({
    command: pushGoon,
    commands: pushCommands,
    input: { body: { id: 9001 } },
    payload: {},
  });
  assert.deepEqual(pushResult[0], {
    tool: 'deployProjectPushPageExpand',
    reason: '查看推包详情',
    priority: 0,
    args: { body: { id: 9001 } },
    example: 'alpha deployProjectPushPageExpand --body "{\"id\":9001}"',
  });
});

test('过滤当前 role 不可见的推荐', () => {
  const command = makeCommand({
    name: 'source',
    metadata: {
      recommendations: [
        { tool: 'visible', reason: 'ok' },
        { tool: 'hidden', reason: 'skip' },
      ],
    },
  });
  const commands = [command, makeCommand({ name: 'visible' })];

  const result = resolveRecommendations({ command, commands, input: {}, payload: {} });

  assert.deepEqual(result, [{ tool: 'visible', reason: 'ok', priority: 0 }]);
});
