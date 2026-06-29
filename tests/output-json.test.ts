import assert from 'node:assert/strict';
import test from 'node:test';

import { jsonResult, setGlobalOutputMode } from '../src/tools/shared.js';
import { InMemoryCliRegistry } from '../src/core/cli-registry.js';
import { registerTools } from '../src/core/tool-registry.js';
import { resolveRecommendations } from '../src/core/recommendations.js';

test('compact 输出保留字符串化 JSON 字段完整内容', () => {
  setGlobalOutputMode('compact');
  const longJson = JSON.stringify({
    items: Array.from({ length: 120 }, (_, index) => ({
      id: index + 1,
      name: `perm-${index + 1}`,
    })),
  });

  const result = jsonResult({
    body: longJson,
    message: 'x'.repeat(700),
  });
  const parsed = JSON.parse(result.content[0].text) as { body: string; message: string };

  assert.equal(parsed.body, longJson);
  assert.doesNotThrow(() => JSON.parse(parsed.body));
  assert.equal(parsed.message.length, 700);
});

test('ciBuildFind 推荐能生成结构化 meta.next', async () => {
  const registry = new InMemoryCliRegistry();
  await registerTools(registry, 'ci', { commandName: 'ciBuildFind' });
  await registerTools(registry, 'ci', { commandName: 'ciBuildWait' });
  await registerTools(registry, 'ci', { commandName: 'ciBuildList' });
  await registerTools(registry, 'ci', { commandName: 'ciBuildGetSelfBuild' });

  const command = registry.getCommand('ciBuildFind');
  assert.ok(command);

  const next = resolveRecommendations({
    command,
    commands: registry.listCommands(),
    input: { app: 'demo:1.0.0-1' },
    payload: { repoId: 42, branch: 'main', build: { id: 1001 } },
  });

  assert.equal(next[0]?.tool, 'ciBuildWait');
  assert.deepEqual(next[0]?.args, { repoId: 42, branch: 'main', buildId: 1001 });
  assert.equal(next[0]?.example, 'alpha ciBuildWait --repoId 42 --branch main --buildId 1001');
});
