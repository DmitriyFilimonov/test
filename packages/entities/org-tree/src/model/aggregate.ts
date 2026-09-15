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

/**
 * Агрегаты для поддерева каждого узла за O(n). Порядок массива не важен. Узлы, до
 * которых нельзя дойти от корня (битый parentId, цикл), в результат не попадают —
 * валидная схема таких данных не пропускает.
 */
export function aggregateSubtrees(
  nodes: readonly OrgNode[],
): ReadonlyMap<string, SubtreeAggregate> {
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

  const totals = new Map<string, { headcount: number; budget: number; weighted: number }>();
  for (let i = order.length - 1; i >= 0; i--) {
    const node = order[i];
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

  const result = new Map<string, SubtreeAggregate>();
  for (const [id, total] of totals) {
    result.set(id, {
      headcount: total.headcount,
      budget: total.budget,
      performance: total.headcount > 0 ? total.weighted / total.headcount : null,
    });
  }
  return result;
}
