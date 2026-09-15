import type { OrgNode } from './org-tree-data';

export const SORT_COLUMNS = [
  'name',
  'level',
  'totalHeadcount',
  'totalBudget',
  'totalPerformance',
] as const;
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export const MAX_QUERY_LENGTH = 200;

export type SortColumn = (typeof SORT_COLUMNS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export interface OrgTreeParams {
  q: string;
  sort: SortColumn;
  dir: SortDirection;
}

export interface OrgTreeResponseNode extends OrgNode {
  /** Совпал ли собственный name узла с q. При пустом q — true. */
  matches: boolean;
  /** 0-based позиция узла в серверной сортировке, сквозная по всем узлам. */
  order: number;
}

export interface ParamIssue {
  param: string;
  message: string;
}

export type ParseResult = { ok: true; params: OrgTreeParams } | { ok: false; issues: ParamIssue[] };

const DEFAULTS: OrgTreeParams = { q: '', sort: 'name', dir: 'asc' };

function readSingle(
  query: Record<string, unknown>,
  param: string,
  issues: ParamIssue[],
): string | undefined {
  const value = query[param];
  if (value === undefined || typeof value === 'string') {
    return value;
  }
  issues.push({ param, message: 'must be passed at most once' });
  return undefined;
}

function readEnum<T extends string>(
  query: Record<string, unknown>,
  param: string,
  allowed: readonly T[],
  issues: ParamIssue[],
): T | undefined {
  const value = readSingle(query, param, issues);
  if (value === undefined || (allowed as readonly string[]).includes(value)) {
    return value as T | undefined;
  }
  issues.push({
    param,
    message: `expected one of ${allowed.join(', ')}; received ${JSON.stringify(value)}`,
  });
  return undefined;
}

/**
 * Разбор q, sort, dir из query-строки. Невалидное значение — ошибка с перечнем проблем,
 * а не молчаливый откат к умолчаниям; отсутствующий параметр — умолчание.
 */
export function parseOrgTreeParams(query: Record<string, unknown>): ParseResult {
  const issues: ParamIssue[] = [];
  const q = readSingle(query, 'q', issues);
  if (q !== undefined && q.length > MAX_QUERY_LENGTH) {
    issues.push({ param: 'q', message: `must be at most ${MAX_QUERY_LENGTH} characters` });
  }
  const sort = readEnum(query, 'sort', SORT_COLUMNS, issues);
  const dir = readEnum(query, 'dir', SORT_DIRECTIONS, issues);

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    params: { q: q ?? DEFAULTS.q, sort: sort ?? DEFAULTS.sort, dir: dir ?? DEFAULTS.dir },
  };
}

interface Row {
  node: OrgNode;
  /** 1-based глубина от корня: дивизион — 1. */
  level: number;
  totalHeadcount: number;
  totalBudget: number;
  /** Взвешена по собственному headcount каждого узла поддерева; null — людей нет. */
  totalPerformance: number | null;
}

/**
 * Итоги по поддереву с теми же определениями, что у клиента (`aggregateSubtrees` в
 * @entities/org-tree): численность и бюджет — суммы собственных значений узла и потомков,
 * эффективность — Σ(performance × headcount) / общая численность.
 */
function buildRows(nodes: readonly OrgNode[]): Row[] {
  const childrenById = new Map<string | null, OrgNode[]>();
  for (const node of nodes) {
    const siblings = childrenById.get(node.parentId);
    if (siblings) {
      siblings.push(node);
    } else {
      childrenById.set(node.parentId, [node]);
    }
  }

  const levelById = new Map<string, number>();
  const visit: OrgNode[] = [];
  const stack = (childrenById.get(null) ?? []).map((node) => ({ node, level: 1 }));
  while (stack.length > 0) {
    const { node, level } = stack.pop()!;
    levelById.set(node.id, level);
    visit.push(node);
    for (const child of childrenById.get(node.id) ?? []) {
      stack.push({ node: child, level: level + 1 });
    }
  }

  const totals = new Map<string, { headcount: number; budget: number; weighted: number }>();
  for (let i = visit.length - 1; i >= 0; i--) {
    const node = visit[i];
    const total = {
      headcount: node.headcount,
      budget: node.budget,
      weighted: node.performance * node.headcount,
    };
    for (const child of childrenById.get(node.id) ?? []) {
      const childTotal = totals.get(child.id)!;
      total.headcount += childTotal.headcount;
      total.budget += childTotal.budget;
      total.weighted += childTotal.weighted;
    }
    totals.set(node.id, total);
  }

  return nodes.map((node) => {
    const total = totals.get(node.id)!;
    return {
      node,
      level: levelById.get(node.id)!,
      totalHeadcount: total.headcount,
      totalBudget: total.budget,
      totalPerformance: total.headcount > 0 ? total.weighted / total.headcount : null,
    };
  });
}

/** Локале-зависимое сравнение: «ё» между «е» и «ж», а не после «я», как у кодов символов. */
const collator = new Intl.Collator('ru');

const applyDirection = (result: number, dir: SortDirection) => (dir === 'asc' ? result : -result);

function compareRows(a: Row, b: Row, { sort, dir }: OrgTreeParams): number {
  switch (sort) {
    case 'name':
      return applyDirection(collator.compare(a.node.name, b.node.name), dir);
    case 'level':
      return applyDirection(a.level - b.level, dir);
    case 'totalHeadcount':
      return applyDirection(a.totalHeadcount - b.totalHeadcount, dir);
    case 'totalBudget':
      return applyDirection(a.totalBudget - b.totalBudget, dir);
    case 'totalPerformance': {
      const x = a.totalPerformance;
      const y = b.totalPerformance;
      // Нет значения — в конце при любом направлении: оно не «меньше» и не «больше».
      if (x === null || y === null) {
        return x === y ? 0 : x === null ? 1 : -1;
      }
      return applyDirection(x - y, dir);
    }
  }
}

const normalize = (text: string) => text.toLocaleLowerCase('ru');

/**
 * Ответ эндпоинта: все узлы независимо от q, в исходном порядке, с matches и order.
 * Сортировка стабильная (Array.prototype.sort): равные узлы сохраняют исходный порядок
 * при обоих направлениях — desc не разворачивает asc.
 */
export function buildOrgTreeResponse(
  nodes: readonly OrgNode[],
  params: OrgTreeParams,
): OrgTreeResponseNode[] {
  const rows = buildRows(nodes);
  const sorted = rows.toSorted((a, b) => compareRows(a, b, params));
  const orderById = new Map<string, number>();
  sorted.forEach((row, position) => {
    orderById.set(row.node.id, position);
  });

  const query = normalize(params.q);
  return nodes.map((node) => ({
    ...node,
    // Только собственное имя: совпадение предка потомка совпавшим не делает.
    matches: normalize(node.name).includes(query),
    order: orderById.get(node.id)!,
  }));
}
