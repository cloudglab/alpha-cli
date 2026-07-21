import { z } from 'zod';
import type { JsonContentResult } from '../types/common.js';
import { addMarkdownForAi } from '../utils/html-markdown.js';

export type OutputMode = 'compact' | 'normal' | 'verbose';

let currentOutputMode: OutputMode = 'compact';

export const optionalTrimmedText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
);

export function jsonResult(value: unknown, mode?: OutputMode): JsonContentResult {
  // compact 与 verbose 数据等价，仅影响 meta 字段聚合；compact 不会裁剪数据量。
  // 这里的 normal/compact 分层只决定是否把散落的 meta 字段收拢到 meta 对象。
  const effectiveMode = mode ?? currentOutputMode;
  const aiReadyValue = addMarkdownForAi(value);
  const payload = effectiveMode === 'verbose'
    ? aiReadyValue
    : effectiveMode === 'normal'
      ? normalizeNormalPayload(aiReadyValue)
      : normalizeCompactPayload(aiReadyValue);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload),
      },
    ],
  };
}

export function setGlobalOutputMode(mode: OutputMode): void {
  currentOutputMode = mode;
}

export function getGlobalOutputMode(): OutputMode {
  return currentOutputMode;
}

/**
 * 解包 Alpha API 的 {errno, data} envelope。
 * 手写工具（ci-orchestrated / push）直接调 getApi().request()，
 * 返回的是整个响应体 {errno, data, cost, ...}，不是 data 本身。
 * 此 helper 安全提取 .data；非 envelope 响应原样返回。
 */
export function unwrapAlphaResponse<T = unknown>(response: unknown): T {
  if (
    response !== null &&
    typeof response === 'object' &&
    'errno' in response &&
    'data' in (response as Record<string, unknown>)
  ) {
    return (response as unknown as { data: T }).data;
  }
  return response as T;
}

export function withToolMeta(value: unknown, meta: Record<string, unknown>): unknown {
  if (!isPlainObject(value)) return value;

  return {
    ...value,
    meta: {
      ...(isPlainObject(value.meta) ? value.meta : {}),
      ...meta,
    },
  };
}

export interface WriteGuardInput {
  action: string;
  payload?: unknown;
  confirm?: boolean;
}

export interface WritePreview {
  ok: false;
  preview: true;
  reason: string;
  action: string;
  payload?: unknown;
  meta?: Record<string, unknown>;
}

export interface UnsupportedWriteDiagnostic {
  ok: false;
  supported: false;
  error: string;
  diagnostic: string;
  action: string;
  payload?: unknown;
}

/**
 * 是否允许写操作。默认返回 true（允许）；
 * 仅当环境变量 ALPHA_DISABLE_WRITE 严格等于字符串 'true' 时返回 false。
 * 注意：这里语义是「写是否启用」，与变量名 DISABLE 方向相反，调用方需注意不要反转。
 */
export function isWriteEnabled(): boolean {
  const flag = process.env.ALPHA_DISABLE_WRITE;
  return flag !== 'true';
}

export function assertWriteAllowed(input: WriteGuardInput): void {
  if (!isWriteEnabled()) {
    throw new Error(`写操作已禁用：action=${input.action}。请清除 ALPHA_DISABLE_WRITE 后重试。`);
  }

  if (input.confirm !== true) {
    throw new Error(`写操作缺少确认：action=${input.action}。需要传入 --confirm true。`);
  }
}

export function previewOrAssertWriteAllowed(input: WriteGuardInput):
  | { ok: true }
  | WritePreview
  | UnsupportedWriteDiagnostic {
  if (input.confirm === true && isWriteEnabled()) {
    return { ok: true };
  }

  if (!isWriteEnabled()) {
    return {
      ok: false,
      supported: false,
      error: '写操作已禁用',
      diagnostic: '当前设置了 ALPHA_DISABLE_WRITE=true，命令默认只返回 preview，不会真正执行。',
      action: input.action,
      payload: input.payload,
    };
  }

  return {
    ok: false,
    preview: true,
    reason: '缺少 --confirm true。当前命令默认返回 preview，仅在确认后真正执行。',
    action: input.action,
    payload: input.payload,
    meta: {
      confirmationRequired: true,
      confirmFlag: 'confirm=true',
    },
  };
}

export async function runWithPreview<T>(
  action: string,
  payload: unknown,
  confirm: boolean | undefined,
  runner: () => Promise<T>,
  options: { nowriteEnv?: string; context?: Record<string, unknown> } = {},
): Promise<T | WritePreview | UnsupportedWriteDiagnostic> {
  const guard = previewOrAssertWriteAllowed({ action, payload, confirm });
  if (guard.ok !== true) return guard;

  return runner();
}

/**
 * compact 模式不做裁剪，与 verbose 数据等价；仅 normal 模式会聚合 meta 字段。
 * 保留本函数是为了与 normal 分层对称、便于后续扩展真正的紧凑形态而不破坏现有消费者。
 */
function normalizeCompactPayload(value: unknown): unknown {
  if (!isPlainObject(value)) return value;

  const meta = isPlainObject(value.meta) ? value.meta : undefined;
  if (meta?.processed !== true) return value;

  const summary = 'summary' in value ? value.summary : meta.summary;
  if (summary === undefined || 'summary' in value) return value;

  return {
    summary,
    ...value,
  };
}

function normalizeNormalPayload(value: unknown): unknown {
  if (Array.isArray(value) || !isPlainObject(value)) return value;

  const meta = extractMeta(value);
  if (!meta) return value;
  return { ...value, meta };
}

const META_FIELDS = [
  'source',
  'partial',
  'page',
  'limit',
  'total',
  'scanned',
  'durationMs',
  'requestCount',
  'cacheHit',
  'fallbackUsed',
  'command',
  'method',
  'path',
  'mode',
  'group',
] as const;

function extractMeta(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {};
  for (const key of META_FIELDS) {
    if (key in record) meta[key] = record[key];
  }
  return Object.keys(meta).length > 0 ? meta : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
