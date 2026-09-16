import type { OrgNode } from './schema';

export interface SubtreeAggregate {
  /** Сумма headcount узла и всех потомков. */
  headcount: number;
  /** Сумма budget узла и всех потомков. */
  budget: number;
  /**
   * Средний performance, взвешенный по headcount. null, если суммарный headcount
   * поддерева равен нулю: взвешивать не по чему.
   */
  performance: number | null;
}

const WEIGHTED = Symbol('weighted');

interface AggregateEntryInternal extends SubtreeAggregate {
  [WEIGHTED]: number;
}

export type AggregateIndex = ReadonlyMap<string, AggregateEntryInternal>;

export interface AggregateChanges {
  updated: string[];
  added: OrgNode[];
  removed: string[];
}

function getWeighted(entry: AggregateEntryInternal): number {
  return entry[WEIGHTED];
}

/**
 * Агрегаты для поддерева каждого узла за O(n). Порядок массива не важен. Узлы, до
 * которых нельзя дойти от корня (битый parentId, цикл), в результат не попадают —
 * валидная схема таких данных не пропускает.
 */
export function aggregateSubtrees(nodes: readonly OrgNode[]): AggregateIndex {
  const childrenById = new Map<string, OrgNode[]>();
  const roots: OrgNode[] = [];
  const ids = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    if (node.parentId === null || !ids.has(node.parentId)) {
      roots.push(node);
    } else {
      const siblings = childrenById.get(node.parentId);
      if (siblings) {
        siblings.push(node);
      } else {
        childrenById.set(node.parentId, [node]);
      }
    }
  }

  // Прямой обход без рекурсии, затем агрегация в обратном порядке: дети раньше родителя.
  const order: OrgNode[] = [];
  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    order.push(node);
    stack.push(...(childrenById.get(node.id) ?? []));
  }

  const result = new Map<string, AggregateEntryInternal>();
  for (let i = order.length - 1; i >= 0; i--) {
    const node = order[i];
    let weighted = node.performance * node.headcount;
    const entry: AggregateEntryInternal = {
      headcount: node.headcount,
      budget: node.budget,
      performance: null,
    } as AggregateEntryInternal;
    Object.defineProperty(entry, WEIGHTED, { value: 0, enumerable: false, writable: true });
    for (const child of childrenById.get(node.id) ?? []) {
      const childEntry = result.get(child.id)!;
      entry.headcount += childEntry.headcount;
      entry.budget += childEntry.budget;
      weighted += getWeighted(childEntry);
    }
    (entry as unknown as Record<symbol, number>)[WEIGHTED] = weighted;
    entry.performance = entry.headcount > 0 ? weighted / entry.headcount : null;
    result.set(node.id, entry);
  }

  return result;
}

/**
 * Инкрементальный пересчёт агрегатов: только затронутые узлы и их предки. Узлы вне
 * затронутых цепочек сохраняют те же ссылки на записи — это проверяемое свойство
 * локальности.
 *
 * Добавление и удаление меняют структуру дерева (индекс детей, цепочки предков),
 * поэтому для них выполняется полный пересчёт.
 */
export function applyAggregatePatch(
  index: AggregateIndex,
  previousNodes: readonly OrgNode[],
  currentNodes: readonly OrgNode[],
  changes: AggregateChanges,
): AggregateIndex {
  if (changes.added.length > 0 || changes.removed.length > 0) {
    return aggregateSubtrees(currentNodes);
  }

  const prevById = new Map(previousNodes.map((n) => [n.id, n]));
  const currById = new Map(currentNodes.map((n) => [n.id, n]));
  const parentById = new Map(currentNodes.map((n) => [n.id, n.parentId]));

  const patched = new Map<string, AggregateEntryInternal>();

  for (const id of changes.updated) {
    const prev = prevById.get(id);
    const curr = currById.get(id);
    if (!prev || !curr) continue;

    const hcDiff = curr.headcount - prev.headcount;
    const bDiff = curr.budget - prev.budget;
    const wDiff = curr.performance * curr.headcount - prev.performance * prev.headcount;

    if (hcDiff === 0 && bDiff === 0 && wDiff === 0) continue;

    let current: string | null = id;
    while (current !== null) {
      const base = patched.get(current) ?? index.get(current);
      if (!base) break;
      const newHeadcount = base.headcount + hcDiff;
      const newWeighted = getWeighted(base) + wDiff;
      const next: AggregateEntryInternal = {
        headcount: newHeadcount,
        budget: base.budget + bDiff,
        performance: newHeadcount > 0 ? newWeighted / newHeadcount : null,
      } as AggregateEntryInternal;
      Object.defineProperty(next, WEIGHTED, {
        value: newWeighted,
        enumerable: false,
        writable: true,
      });
      patched.set(current, next);
      current = parentById.get(current) ?? null;
    }
  }

  if (patched.size === 0) return index;

  const result = new Map<string, AggregateEntryInternal>(index);
  for (const [id, entry] of patched) {
    result.set(id, entry);
  }
  return result;
}
