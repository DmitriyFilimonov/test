import type { TableRow } from './table';

/** Структурный фильтр: поля из parse-результата, без q. */
export interface StructuredFilter {
  levels?: readonly (1 | 2 | 3)[];
  minHeadcount?: number;
  maxHeadcount?: number;
  minBudget?: number;
  maxBudget?: number;
  minPerformance?: number;
  maxPerformance?: number;
}

/** Пустой ли фильтр — все поля не заданы. */
export function isEmptyFilter(filter: StructuredFilter): boolean {
  return (
    filter.levels == null &&
    filter.minHeadcount == null &&
    filter.maxHeadcount == null &&
    filter.minBudget == null &&
    filter.maxBudget == null &&
    filter.minPerformance == null &&
    filter.maxPerformance == null
  );
}

/** Проходит ли строка через одно условие. */
function matchesRow(row: TableRow, filter: StructuredFilter): boolean {
  if (filter.levels != null && !filter.levels.includes(row.level as 1 | 2 | 3)) {
    return false;
  }
  if (filter.minHeadcount != null && row.totalHeadcount < filter.minHeadcount) {
    return false;
  }
  if (filter.maxHeadcount != null && row.totalHeadcount > filter.maxHeadcount) {
    return false;
  }
  if (filter.minBudget != null && row.totalBudget < filter.minBudget) {
    return false;
  }
  if (filter.maxBudget != null && row.totalBudget > filter.maxBudget) {
    return false;
  }
  // Узел без людей (totalPerformance null) не проходит ни min, ни max.
  if (filter.minPerformance != null) {
    if (row.totalPerformance == null || row.totalPerformance < filter.minPerformance) {
      return false;
    }
  }
  if (filter.maxPerformance != null) {
    if (row.totalPerformance == null || row.totalPerformance > filter.maxPerformance) {
      return false;
    }
  }
  return true;
}

/**
 * Применить структурный фильтр к строкам таблицы. Условия по И, незаданное не ограничивает.
 * Предки проходящих строк достраиваются для контекста и помечаются как `matches: false`.
 * Пустой фильтр возвращает ту же ссылку.
 */
export function applyStructuredFilter(
  rows: readonly TableRow[],
  filter: StructuredFilter,
): TableRow[] {
  if (isEmptyFilter(filter)) {
    return rows as TableRow[];
  }

  const nodeById = new Map<string, TableRow>();
  for (const row of rows) {
    nodeById.set(row.id, row);
  }

  // Пометить проходящие
  const matching = new Set<string>();
  for (const row of rows) {
    if (matchesRow(row, filter)) {
      matching.add(row.id);
    }
  }

  // Достроить предков для контекста
  const shown = new Set<string>();
  for (const id of matching) {
    let current = nodeById.get(id);
    while (current && !shown.has(current.id)) {
      shown.add(current.id);
      current = current.parentId == null ? undefined : nodeById.get(current.parentId);
    }
  }

  // Собрать результат в порядке оригинальных строк
  const result: TableRow[] = [];
  for (const row of rows) {
    if (shown.has(row.id)) {
      const isMatch = matching.has(row.id);
      result.push({ ...row, matches: isMatch });
    }
  }

  return result;
}
