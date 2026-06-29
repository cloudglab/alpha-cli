import type { CliCommandDefinition, CliCommandMetadata, CliRecommendation, CliRecommendationArgRef } from './cli-registry.js';

export interface ResolvedCliRecommendation {
  tool: string;
  reason: string;
  priority: number;
  args?: Record<string, unknown>;
  example?: string;
}

export interface ResolveRecommendationsOptions {
  command: CliCommandDefinition;
  commands: CliCommandDefinition[];
  input: Record<string, unknown>;
  payload: unknown;
}

export function resolveRecommendations(options: ResolveRecommendationsOptions): ResolvedCliRecommendation[] {
  const recommendations = getRecommendations(options.command.metadata);
  if (recommendations.length === 0) return [];

  const visibleCommands = new Set(options.commands.map((item) => item.name));
  return recommendations
    .map((item, index) => ({
      item,
      index,
      tool: resolveTool(item.tool, options.input, options.payload),
    }))
    .filter((item): item is { item: CliRecommendation; index: number; tool: string } => typeof item.tool === 'string' && item.tool.length > 0)
    .filter((item) => visibleCommands.has(item.tool))
    .sort((left, right) => {
      const priorityDelta = (right.item.priority ?? 0) - (left.item.priority ?? 0);
      return priorityDelta !== 0 ? priorityDelta : left.index - right.index;
    })
    .map(({ item, tool }) => buildResolvedRecommendation(item, tool, options.input, options.payload))
    .filter((item): item is ResolvedCliRecommendation => item !== undefined);
}

function getRecommendations(metadata?: CliCommandMetadata): CliRecommendation[] {
  const dynamicRecommendations = getDynamicRecommendations(metadata);
  if (dynamicRecommendations.length > 0) return dynamicRecommendations;
  if (metadata?.recommendations?.length) return metadata.recommendations;
  if (!metadata?.nextBestTools?.length) return [];
  return metadata.nextBestTools.map((tool) => ({
    tool,
    reason: `建议继续查看 ${tool}`,
    priority: 0,
  }));
}

function getDynamicRecommendations(metadata?: CliCommandMetadata): CliRecommendation[] {
  if (metadata?.group !== 'scene') return [];

  return [
    {
      tool: { source: 'payload', path: 'primaryCommand' },
      reason: '直接执行当前页面最匹配的主命令',
      priority: 2,
    },
    {
      tool: { source: 'payload', path: 'suggestedCommands.0' },
      reason: '先尝试候选命令列表中的第一条',
      priority: 1,
    },
    ...(metadata?.recommendations ?? []),
  ];
}

function buildResolvedRecommendation(
  recommendation: CliRecommendation,
  tool: string,
  input: Record<string, unknown>,
  payload: unknown,
): ResolvedCliRecommendation | undefined {
  const base: ResolvedCliRecommendation = {
    tool,
    reason: recommendation.reason,
    priority: recommendation.priority ?? 0,
  };

  const resolvedArgs = resolveArgs(recommendation.args, input, payload);
  if (!resolvedArgs) return base;
  base.args = resolvedArgs;

  const example = buildExample(tool, resolvedArgs);
  if (example) base.example = example;
  return base;
}

function resolveTool(
  tool: string | CliRecommendationArgRef,
  input: Record<string, unknown>,
  payload: unknown,
): string | undefined {
  const resolved = resolveValue(tool, input, payload);
  return typeof resolved === 'string' ? resolved : undefined;
}

function resolveArgs(
  args: Record<string, unknown | CliRecommendationArgRef> | undefined,
  input: Record<string, unknown>,
  payload: unknown,
): Record<string, unknown> | undefined {
  if (!args) return undefined;
  const resolved = resolveValue(args, input, payload);
  return isPlainObject(resolved) ? resolved : undefined;
}

function buildExample(tool: string, args: Record<string, unknown>): string | undefined {
  const parts = ['alpha', tool];

  for (const [key, value] of Object.entries(args)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const renderedItem = renderArgValue(item);
        if (renderedItem === undefined) return undefined;
        parts.push(`--${key}`);
        parts.push(renderedItem);
      }
      continue;
    }

    const rendered = renderArgValue(value);
    if (rendered === undefined) return undefined;
    parts.push(`--${key}`);
    parts.push(rendered);
  }

  return parts.join(' ');
}

function renderArgValue(value: unknown): string | undefined {
  if (typeof value === 'string') return quoteIfNeeded(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value) || isPlainObject(value)) return quoteIfNeeded(JSON.stringify(value));
  return undefined;
}

function quoteIfNeeded(value: string): string {
  return /\s/.test(value) || value.includes('"') || value.includes("'")
    ? JSON.stringify(value)
    : value;
}

function getByPath(source: unknown, path: string): unknown {
  if (!path) return source;
  const segments = path.split('.').filter(Boolean);
  let current: unknown = source;

  for (const segment of segments) {
    if (!isPlainObject(current) && !Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
    if (current === undefined) return undefined;
  }

  return current;
}

function getByPaths(source: unknown, path: string | string[]): unknown {
  if (Array.isArray(path)) {
    for (const candidate of path) {
      const value = getByPath(source, candidate);
      if (value !== undefined) return value;
    }
    return undefined;
  }

  return getByPath(source, path);
}

function resolveValue(value: unknown, input: Record<string, unknown>, payload: unknown): unknown {
  if (isArgRef(value)) {
    const sources = Array.isArray(value.source) ? value.source : [value.source];
    for (const source of sources) {
      const sourceValue = source === 'input' ? input : payload;
      const resolvedValue = getByPaths(sourceValue, value.path);
      if (resolvedValue !== undefined) return resolvedValue;
    }
    return undefined;
  }

  if (Array.isArray(value)) {
    const resolvedItems = value.map((item) => resolveValue(item, input, payload));
    return resolvedItems.some((item) => item === undefined) ? undefined : resolvedItems;
  }

  if (isPlainObject(value)) {
    const resolvedObject: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      const resolvedNestedValue = resolveValue(nestedValue, input, payload);
      if (resolvedNestedValue === undefined) return undefined;
      resolvedObject[key] = resolvedNestedValue;
    }
    return resolvedObject;
  }

  return value;
}

function isArgRef(value: unknown): value is CliRecommendationArgRef {
  return isPlainObject(value)
    && (
      value.source === 'input'
      || value.source === 'payload'
      || (Array.isArray(value.source) && value.source.every((item) => item === 'input' || item === 'payload'))
    )
    && (typeof value.path === 'string' || (Array.isArray(value.path) && value.path.every((item) => typeof item === 'string')));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
