import { z, type ZodRawShape, type ZodTypeAny } from 'zod';
import type { JsonContentResult } from '../types/common.js';

export type CliHandler<TInput extends Record<string, unknown> = Record<string, unknown>> =
  (input: TInput) => Promise<JsonContentResult> | JsonContentResult;

export interface CliCommandMetadata {
  group?: string;
  description?: string;
  examples?: string[];
  costHint?: 'low' | 'medium' | 'high';
  nextBestTools?: string[];
  recommendations?: CliRecommendation[];
}

export interface CliRecommendationArgRef {
  source: 'input' | 'payload' | Array<'input' | 'payload'>;
  path: string | string[];
}

export interface CliRecommendation {
  tool: string | CliRecommendationArgRef;
  reason: string;
  priority?: number;
  args?: Record<string, unknown | CliRecommendationArgRef>;
}

export interface CliCommandDefinition {
  name: string;
  schema: ZodRawShape;
  handler: CliHandler;
  metadata?: CliCommandMetadata;
}

export interface CliRegistry {
  tool<TShape extends ZodRawShape>(
    name: string,
    schema: TShape,
    handler: CliHandler<z.infer<z.ZodObject<TShape>>>,
    metadata?: CliCommandMetadata,
  ): void;
  listCommands(): CliCommandDefinition[];
}

export class InMemoryCliRegistry implements CliRegistry {
  private readonly commands = new Map<string, CliCommandDefinition>();

  tool<TShape extends ZodRawShape>(
    name: string,
    schema: TShape,
    handler: CliHandler<z.infer<z.ZodObject<TShape>>>,
    metadata?: CliCommandMetadata,
  ): void {
    this.commands.set(name, { name, schema, handler: handler as CliHandler, metadata });
  }

  getCommand(name: string): CliCommandDefinition | undefined {
    return this.commands.get(name);
  }

  listCommands(): CliCommandDefinition[] {
    return Array.from(this.commands.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
}

export function parseCommandInput(schema: ZodRawShape, args: string[]): Record<string, unknown> {
  const raw = parseArgv(args);
  const unknownKeys = Object.keys(raw).filter((key) => !(key in schema));
  if (unknownKeys.length > 0) {
    throw new Error(`未知参数: ${unknownKeys.map((key) => `--${key}`).join(', ')}`);
  }

  const converted: Record<string, unknown> = {};

  for (const [key, fieldSchema] of Object.entries(schema)) {
    if (!(key in raw)) continue;
    converted[key] = coerceValue(selectValueForSchema(raw[key], fieldSchema), fieldSchema);
  }

  return z.object(schema).strict().parse(converted) as Record<string, unknown>;
}

function parseArgv(args: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) throw new Error(`无法识别的位置参数: ${token}`);

    const [rawKey, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    if (!rawKey) throw new Error('检测到空参数名。');

    const next = args[index + 1];
    const hasExplicitValue = inlineValue !== undefined || (typeof next === 'string' && !next.startsWith('--'));
    const value = inlineValue !== undefined ? inlineValue : hasExplicitValue ? next : true;

    if (inlineValue === undefined && hasExplicitValue) index += 1;
    appendArg(result, rawKey, value);
  }

  return result;
}

function appendArg(target: Record<string, unknown>, key: string, value: unknown): void {
  const current = target[key];
  if (current === undefined) {
    target[key] = value;
    return;
  }
  if (Array.isArray(current)) {
    current.push(value);
    return;
  }
  target[key] = [current, value];
}

function selectValueForSchema(value: unknown, schema: ZodTypeAny): unknown {
  if (!Array.isArray(value)) return value;
  const unwrapped = unwrapSchema(schema);
  return unwrapped instanceof z.ZodArray ? value : value[value.length - 1];
}

function coerceValue(value: unknown, schema: ZodTypeAny): unknown {
  const unwrapped = unwrapSchema(schema);
  if (unwrapped instanceof z.ZodBoolean) return toBoolean(value);
  if (unwrapped instanceof z.ZodNumber) return toNumber(value);
  if (unwrapped instanceof z.ZodArray) {
    const items: unknown[] = Array.isArray(value)
      ? value
      : typeof value === 'string' && value.trim().startsWith('[')
        ? parseJsonValue(value, '数组参数') as unknown[]
        : typeof value === 'string'
          ? value.split(',').map((item) => item.trim()).filter(Boolean)
          : [value];
    return items.map((item) => coerceValue(item, unwrapped.element));
  }
  if (unwrapped instanceof z.ZodObject || unwrapped instanceof z.ZodRecord) {
    if (typeof value !== 'string') return value;
    return parseJsonValue(value, '对象参数');
  }
  if (unwrapped instanceof z.ZodUnion) {
    // 不依赖私有字段 _def.options：对常见标量候选值逐个用 union 自身 safeParse 判定，
    // 任一通过即采用其 parse 结果；全部失败则保留原值交由最终 z.object().parse() 抛错。
    const candidates: unknown[] = [value];
    if (typeof value === 'string') {
      const asNumber = tryToNumber(value);
      if (asNumber !== undefined) candidates.push(asNumber);
      const asBool = tryToBoolean(value);
      if (asBool !== undefined) candidates.push(asBool);
    }
    for (const candidate of candidates) {
      const parsed = unwrapped.safeParse(candidate);
      if (parsed.success) return parsed.data;
    }
    return value;
  }
  return value;
}

function tryToNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function tryToBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
}

function parseJsonValue(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法解析${label}: ${value}（${message}）`);
  }
}

function unwrapSchema(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return unwrapSchema(schema.unwrap());
  if (schema instanceof z.ZodDefault) return unwrapSchema((schema._def as { innerType: ZodTypeAny }).innerType);
  if (schema instanceof z.ZodEffects) return unwrapSchema(schema.innerType());
  return schema;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  throw new Error(`无法解析布尔值: ${String(value)}`);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`无法解析数字: ${String(value)}`);
}
