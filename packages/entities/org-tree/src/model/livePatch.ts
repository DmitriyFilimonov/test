import { getNodeMetrics } from '../lib/nodeMetrics';
import { applyAggregatePatch, type AggregateIndex, type SubtreeAggregate } from './aggregate';
import type { OrgTreePatch } from './live';
import type { OrgNode } from './schema';
import { UPDATABLE_METRICS, type OrgNodeUpdates, type UpdatableMetric } from './updates';

export interface OrgTreePatchResult {
  nodes: OrgNode[];
  /** Индекс агрегатов для `nodes`, посчитанный от индекса прежних данных. */
  index: AggregateIndex;
  /** Узлы, у которых изменилось показанное значение: какое и в каком патче. */
  updates: Record<string, OrgNodeUpdates>;
  /** Удалённые узлы, которые были в данных. */
  removed: string[];
}

/** Значения так, как их видит пользователь: эффективность — округлённой, как в таблице и карточке. */
function shownValues(
  node: OrgNode,
  subtree: SubtreeAggregate,
): Record<UpdatableMetric, number | null> {
  const metrics = getNodeMetrics({ node, subtree });
  return {
    ownHeadcount: metrics.ownHeadcount,
    ownPerformance: metrics.ownPerformance,
    totalHeadcount: metrics.totalHeadcount,
    totalBudget: subtree.budget,
    totalPerformance: metrics.totalPerformance,
  };
}

/**
 * Патч потока к данным одного ключа кеша.
 *
 * order и matches считает сервер под параметры запроса, и патч их не пересчитывает: изменённый
 * узел остаётся на своём месте, даже если по новому значению сортировка поставила бы его
 * иначе, — иначе строки прыгали бы под курсором. Удаление сдвигает order следующих узлов
 * (order — перестановка 0..n-1, на это опирается таблица), добавленный узел встаёт последним
 * среди соседей. matches добавленного — true при пустом q, как у всех узлов; при непустом —
 * false до ответа сервера: совпадение с q клиент не вычисляет.
 */
export function applyOrgTreePatch(
  nodes: readonly OrgNode[],
  index: AggregateIndex,
  patch: OrgTreePatch,
  q: string,
): OrgTreePatchResult {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const changes = new Map(patch.nodes.map((change) => [change.id, change]));
  const removed = new Set(patch.removed.filter((id) => byId.has(id)));
  const removedOrders = nodes.filter((node) => removed.has(node.id)).map((node) => node.order);

  const next: OrgNode[] = [];
  for (const node of nodes) {
    if (removed.has(node.id)) {
      continue;
    }
    const change = changes.get(node.id);
    const order =
      node.order - removedOrders.filter((removedOrder) => removedOrder < node.order).length;
    if (change) {
      next.push({
        ...node,
        headcount: change.headcount ?? node.headcount,
        budget: change.budget ?? node.budget,
        performance: change.performance ?? node.performance,
        updatedAt: change.updatedAt,
        order,
      });
    } else {
      // Нетронутый узел — та же ссылка, если его order не сдвинулся.
      next.push(order === node.order ? node : { ...node, order });
    }
  }

  // Узел, который уже есть, не добавляется: ответ на запрос мог прийти раньше патча и уже
  // содержать его. Изменения метрик задают значения, а не приращения, — их повтор безвреден.
  const added: OrgNode[] = [];
  for (const node of patch.added) {
    if (!byId.has(node.id)) {
      added.push({ ...node, matches: q === '', order: next.length + added.length });
    }
  }
  next.push(...added);

  const updated = patch.nodes
    .map((change) => change.id)
    .filter((id) => byId.has(id) && !removed.has(id));
  const nextIndex = applyAggregatePatch(index, nodes, next, {
    updated,
    added,
    removed: [...removed],
  });

  // Показанные значения меняются у изменённых узлов и их предков, итоги — у предков
  // добавленных и удалённых. Подъём останавливается на уже проверенном узле: выше он проверил всё.
  const nextById = new Map(next.map((node) => [node.id, node]));
  const starts = [
    ...updated,
    ...added.map((node) => node.parentId),
    ...[...removed].map((id) => byId.get(id)!.parentId),
  ];
  const updates: Record<string, OrgNodeUpdates> = {};
  const visited = new Set<string>();
  for (const start of starts) {
    let id = start;
    while (id !== null && !visited.has(id)) {
      visited.add(id);
      const before = byId.get(id);
      const after = nextById.get(id);
      if (!before || !after) {
        break;
      }
      const was = shownValues(before, index.get(id)!);
      const now = shownValues(after, nextIndex.get(id)!);
      for (const metric of UPDATABLE_METRICS) {
        if (was[metric] !== now[metric]) {
          (updates[id] ??= {})[metric] = patch.seq;
        }
      }
      id = after.parentId;
    }
  }

  return { nodes: next, index: nextIndex, updates, removed: [...removed] };
}
