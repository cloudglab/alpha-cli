import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryCliRegistry } from '../src/core/cli-registry.js';
import { normalizeImplicitSceneInvocation, parseDevopsScene } from '../src/core/devops-scene.js';
import { registerTools } from '../src/core/tool-registry.js';

test('parseDevopsScene recognizes iteration test create route', () => {
  const result = parseDevopsScene('https://devops.example.com/main/devops/iteration/test/123/create?versionStatus=1');

  assert.equal(result.matchedServer, 'devops');
  assert.equal(result.routeKind, 'iteration.test.create');
  assert.equal(result.params.versionId, '123');
  assert.equal(result.params.versionStatus, '1');
  assert.equal(result.primaryCommand, 'iterVersionTestVersionSave');
  assert.deepEqual(result.suggestedCommands, ['iterVersionTestVersionSave', 'iterVersionTestVersionSubmit', 'iterVersionTestVersionList']);
});

test('parseDevopsScene recognizes build list manual action from url and button text', () => {
  const result = parseDevopsScene(
    'https://devops.example.com/main/devops/integration/build/list/42?branchName=main 手动构建',
  );

  assert.equal(result.routeKind, 'integration.build.list.manual');
  assert.equal(result.params.repoId, '42');
  assert.equal(result.params.branchName, 'main');
  assert.equal(result.primaryCommand, 'ciBuildManualProcess');
  assert.deepEqual(result.suggestedCommands, ['ciBuildManualProcess', 'ciBuildList', 'ciBuildCancel']);
});

test('parseDevopsScene recognizes build list submit-test action', () => {
  const result = parseDevopsScene('/integration/build/list/42 提测');

  assert.equal(result.routeKind, 'integration.build.list.submit-test');
  assert.equal(result.params.repoId, '42');
  assert.equal(result.primaryCommand, 'iterVersionTestVersionSave');
  assert.deepEqual(result.suggestedCommands, ['iterVersionTestVersionSave', 'iterVersionTestVersionSubmit']);
});

test('parseDevopsScene recognizes iteration list disable action', () => {
  const result = parseDevopsScene('/iteration 封板');

  assert.equal(result.routeKind, 'iteration.list.disable');
  assert.equal(result.primaryCommand, 'iterVersionDisable');
  assert.deepEqual(result.suggestedCommands, ['iterVersionDisable', 'iterVersionDelete']);
});

test('parseDevopsScene recognizes repo list branch action', () => {
  const result = parseDevopsScene('/integration/repo/list 查看分支');

  assert.equal(result.routeKind, 'integration.repo.list.branches');
  assert.equal(result.primaryCommand, 'ciBranchList');
  assert.deepEqual(result.suggestedCommands, ['ciBranchList', 'ciRepoList']);
});

test('parseDevopsScene recognizes cloud app upgrade action', () => {
  const result = parseDevopsScene('/arrange/cloudapp 升级');

  assert.equal(result.routeKind, 'arrange.cloudapp.list.upgrade');
  assert.equal(result.primaryCommand, 'deployAppsUpgrade');
  assert.deepEqual(result.suggestedCommands, ['deployAppsUpgrade', 'deployAppsPage']);
});

test('parseDevopsScene recognizes cloud app rollback action', () => {
  const result = parseDevopsScene('/arrange/cloudapp/cloudAppDetail 回滚到当前版本');

  assert.equal(result.routeKind, 'arrange.cloudapp.detail.rollback');
  assert.equal(result.primaryCommand, 'deployAppsRollback');
  assert.deepEqual(result.suggestedCommands, ['deployAppsRollback', 'deployAppsViewHistory']);
});

test('parseDevopsScene recognizes ambient continue-push action', () => {
  const result = parseDevopsScene('/arrange/ambient?deployEnvType=3 继续推包');

  assert.equal(result.routeKind, 'arrange.ambient.list.push-goon');
  assert.equal(result.params.deployEnvType, '3');
  assert.equal(result.primaryCommand, 'deployProjectPushGoon');
  assert.deepEqual(result.suggestedCommands, ['deployProjectPushGoon', 'deployProjectPushPageExpand']);
});

test('parseDevopsScene recognizes repo config pipeline-template action', () => {
  const result = parseDevopsScene('/integration/build/repoConfig/42 导入流水线模板');

  assert.equal(result.routeKind, 'integration.build.repoConfig.pipeline-template');
  assert.equal(result.params.repoId, '42');
  assert.equal(result.primaryCommand, 'ciManageGetPipelines');
  assert.deepEqual(result.suggestedCommands, ['ciManageGetPipelines', 'ciManageSetConfig', 'ciManageUpdateConfig']);
});

test('parseDevopsScene recognizes pipeline list page', () => {
  const result = parseDevopsScene('/integration/waterLine/list');

  assert.equal(result.routeKind, 'integration.waterLine.list');
  assert.equal(result.primaryCommand, 'ciManageGetPipelines');
  assert.deepEqual(result.suggestedCommands, ['ciManageGetPipelines']);
});

test('normalizeImplicitSceneInvocation rewrites route-like input', () => {
  const normalized = normalizeImplicitSceneInvocation('/integration/build/list/42', []);

  assert.deepEqual(normalized, {
    commandName: 'devopsScene',
    commandArgs: ['--input', '/integration/build/list/42'],
  });
});

test('normalizeImplicitSceneInvocation keeps action text with route-like input', () => {
  const normalized = normalizeImplicitSceneInvocation(
    'https://devops.example.com/main/devops/integration/build/list/42',
    ['手动构建'],
  );

  assert.deepEqual(normalized, {
    commandName: 'devopsScene',
    commandArgs: [
      '--input',
      'https://devops.example.com/main/devops/integration/build/list/42 手动构建',
    ],
  });
});

test('registerTools exposes devopsScene command in scene group', async () => {
  const registry = new InMemoryCliRegistry();
  await registerTools(registry, 'full', { commandName: 'devopsScene' });

  const command = registry.getCommand('devopsScene');
  assert.ok(command);
  assert.equal(command?.metadata?.group, 'scene');
});
