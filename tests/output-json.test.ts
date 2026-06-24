import assert from 'node:assert/strict';
import test from 'node:test';

import { jsonResult, setGlobalOutputMode } from '../src/tools/shared.js';

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
