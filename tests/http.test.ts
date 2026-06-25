import assert from 'node:assert/strict';
import test from 'node:test';
import type { AxiosError } from 'axios';

import {
  attachCacheMeta,
  buildAlphaHttpError,
  describeResponseData,
} from '../src/core/http.js';
import type { AlphaConfig } from '../src/types/common.js';

const baseConfig: AlphaConfig = {
  url: 'https://alpha.example.com',
  timeoutMs: 30_000,
};

function makeAxiosError(overrides: {
  status?: number;
  data?: unknown;
  url?: string;
  message?: string;
  code?: string;
}): AxiosError {
  return {
    message: overrides.message ?? 'boom',
    code: overrides.code,
    config: { url: overrides.url ?? '/alpha/x' },
    response: {
      status: overrides.status,
      data: overrides.data,
      headers: {},
      config: {} as never,
      statusText: '',
    },
  } as unknown as AxiosError;
}

test('buildAlphaHttpError 不把响应体拼进 message（防敏感信息泄露）', () => {
  const error = makeAxiosError({
    status: 500,
    data: { secret: 'super-secret-token' },
    message: 'Internal Server Error',
  });

  const result = buildAlphaHttpError(error, baseConfig);

  assert.equal(result.statusCode, 500);
  assert.equal(result.code, 'server-error');
  // responseBody 仍挂在 error 对象上供程序消费
  assert.deepEqual(result.responseBody, { secret: 'super-secret-token' });
  // 但 message 里不能出现敏感内容
  assert.ok(!result.message.includes('super-secret-token'));
  assert.ok(result.message.includes('HTTP 500'));
});

test('buildAlphaHttpError 支持通过 override 覆盖 hint（token 过期场景）', () => {
  const error = makeAxiosError({ status: 401, message: 'Unauthorized' });

  const result = buildAlphaHttpError(error, baseConfig, {
    hint: 'Token 已过期，请重置。',
  });

  assert.equal(result.code, 'unauthorized');
  assert.equal(result.hint, 'Token 已过期，请重置。');
  assert.ok(result.message.includes('Token 已过期'));
});

test('describeResponseData 对字符串返回截断预览', () => {
  const long = 'x'.repeat(2000);
  const preview = describeResponseData(long, 'fallback');
  assert.ok(preview.length <= 1000);
  assert.equal(preview, 'x'.repeat(1000));
});

test('describeResponseData 对 null/undefined 返回 fallback', () => {
  assert.equal(describeResponseData(null, 'fb'), 'fb');
  assert.equal(describeResponseData(undefined, 'fb'), 'fb');
});

test('attachCacheMeta 返回浅拷贝并把 cacheHit 放进 meta，不污染原对象', () => {
  const original = { foo: 'bar', meta: { command: 'x' } };
  const decorated = attachCacheMeta(original) as { foo: string; meta: Record<string, unknown> };

  // 原对象未被修改
  assert.deepEqual(original, { foo: 'bar', meta: { command: 'x' } });
  // 返回的是新对象
  assert.notEqual(decorated, original);
  assert.equal(decorated.foo, 'bar');
  assert.equal(decorated.meta.cacheHit, true);
  assert.equal(decorated.meta.command, 'x');
});

test('attachCacheMeta 对数组保持原样（无法原地加 meta）', () => {
  const arr = [1, 2, 3];
  const decorated = attachCacheMeta(arr);
  assert.equal(decorated, arr);
  assert.ok(!Array.isArray((arr as unknown as { meta?: unknown }).meta));
});

test('attachCacheMeta 对原始值保持原样', () => {
  assert.equal(attachCacheMeta(null), null);
  assert.equal(attachCacheMeta(undefined), undefined);
  assert.equal(attachCacheMeta('str'), 'str');
});
