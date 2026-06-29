export interface ListSummaryItem {
  id: number | string;
  name?: string;
  sortKey?: string;
  status?: string;
}

export interface ListSummary {
  total: number;
  byStatus: Record<string, number>;
  top: ListSummaryItem[];
  highlight: string;
  byGroup?: Record<string, number>;
  groupKey?: string;
}

export function summarizeList<
  T extends {
    id: number | string;
    name?: string;
    status?: string;
    deadline?: string;
    updatedAt?: string;
    createdAt?: string;
    productName?: string | number;
    projectName?: string | number;
    product?: string | number;
    project?: string | number;
  },
>(items: T[], options: { sortKey?: 'deadline' | 'updatedAt' | 'createdAt'; groupKey?: string; topN?: number } = {}): ListSummary {
  const sortKey = options.sortKey ?? 'deadline';
  const topN = options.topN ?? 3;
  const groupKey = options.groupKey;
  const byStatus: Record<string, number> = {};
  const byGroup: Record<string, number> = {};

  for (const item of items) {
    const status = item.status ?? 'unknown';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (groupKey) {
      const value = (item as Record<string, unknown>)[groupKey];
      const normalized = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
      if (normalized) byGroup[normalized] = (byGroup[normalized] ?? 0) + 1;
    }
  }

  const sortCandidates = items
    .map((item) => ({ item, sortValue: (item as Record<string, unknown>)[sortKey] as string | undefined }))
    .filter((entry) => typeof entry.sortValue === 'string' && entry.sortValue !== '')
    .sort((left, right) => left.sortValue!.localeCompare(right.sortValue!));

  const top: ListSummaryItem[] = sortCandidates.slice(0, topN).map(({ item, sortValue }) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    sortKey: sortValue,
  }));

  const highlight = items.length === 0
    ? '当前无数据，可继续按其它命令补充上下文。'
    : `共 ${items.length} 条${groupKey ? `（按 ${groupKey} 分布）` : ''}。`;

  const summary: ListSummary = { total: items.length, byStatus, top, highlight };
  if (groupKey && Object.keys(byGroup).length > 0) {
    summary.byGroup = byGroup;
    summary.groupKey = groupKey;
  }
  return summary;
}
