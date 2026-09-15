export const ORG_TREE_SORT_COLUMNS = [
  'name',
  'level',
  'totalHeadcount',
  'totalBudget',
  'totalPerformance',
] as const;

export type OrgTreeSortColumn = (typeof ORG_TREE_SORT_COLUMNS)[number];
export type OrgTreeSortDirection = 'asc' | 'desc';

/**
 * Параметры GET /api/org-tree. Сервер всегда отдаёт все узлы; q и sort влияют только на
 * `matches` и `order`. Параметры входят в ключ кеша: разным параметрам — разные записи.
 */
export interface OrgTreeParams {
  q: string;
  sort: OrgTreeSortColumn;
  dir: OrgTreeSortDirection;
}

/** Максимальная длина q по контракту эндпоинта: длиннее — 400. */
export const ORG_TREE_MAX_QUERY_LENGTH = 200;

export const DEFAULT_ORG_TREE_PARAMS: OrgTreeParams = { q: '', sort: 'name', dir: 'asc' };
