import { z } from 'zod';
import type { JsonContentResult } from '../types/common.js';

export type OutputMode = 'compact' | 'normal' | 'verbose';

let currentOutputMode: OutputMode = 'compact';

export const optionalTrimmedText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
);

export function jsonResult(value: unknown, mode?: OutputMode): JsonContentResult {
  const effectiveMode = mode ?? currentOutputMode;
  const payload = effectiveMode === 'verbose'
    ? value
    : effectiveMode === 'normal'
      ? normalizeNormalPayload(value)
      : normalizeCompactPayload(value);

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

function normalizeCompactPayload(value: unknown): unknown {
  return value;
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
