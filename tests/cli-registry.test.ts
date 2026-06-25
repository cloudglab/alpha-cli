import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

import { parseCommandInput } from '../src/core/cli-registry.js';

test('parseCommandInput 用真实 zod schema 聚合重复 flag 为数组', () => {
  const schema = {
    tags: z.array(z.string()),
    name: z.string(),
  };

  const input = parseCommandInput(schema, ['--tags=a', '--tags=b', '--name=foo']);
  assert.deepEqual(input.tags, ['a', 'b']);
  assert.equal(input.name, 'foo');
});

test('parseCommandInput 单次 flag 也按数组返回给 ZodArray 字段', () => {
  const schema = { tags: z.array(z.string()) };

  const input = parseCommandInput(schema, ['--tags=only']);
  assert.deepEqual(input.tags, ['only']);
});

test('parseCommandInput 对非数组字段重复传值时取最后一个', () => {
  const schema = { name: z.string() };

  const input = parseCommandInput(schema, ['--name=a', '--name=b']);
  assert.equal(input.name, 'b');
});

test('parseCommandInput 对 ZodUnion 字段不依赖私有字段也能解析', () => {
  const schema = { val: z.union([z.number(), z.string()]) };

  // 数字形态：union 应能接受
  const numInput = parseCommandInput(schema, ['--val=5']);
  assert.ok(typeof numInput.val === 'number' || typeof numInput.val === 'string');

  // 字符串形态
  const strInput = parseCommandInput(schema, ['--val=abc']);
  assert.equal(strInput.val, 'abc');
});

test('parseCommandInput 对未知参数报错', () => {
  const schema = { name: z.string() };

  assert.throws(
    () => parseCommandInput(schema, ['--unknown=1']),
    /未知参数/,
  );
});
