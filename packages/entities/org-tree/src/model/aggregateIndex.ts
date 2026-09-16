import { aggregateSubtrees, type AggregateIndex } from './aggregate';
import type { OrgNode } from './schema';

/**
 * Индекс агрегатов по ссылке на массив данных. Индекс живёт, пока живы сами данные, и общий
 * для всех ключей кеша и всех сторов: у разных данных разные массивы. Это кеш чистой функции —
 * значение для массива всегда равно `aggregateSubtrees(nodes)`.
 */
const indexes = new WeakMap<readonly OrgNode[], AggregateIndex>();

/** Индекс для данных: готовый или полным расчётом. */
export function getAggregateIndex(nodes: readonly OrgNode[]): AggregateIndex {
  let index = indexes.get(nodes);
  if (!index) {
    index = aggregateSubtrees(nodes);
    indexes.set(nodes, index);
  }
  return index;
}

/**
 * Индекс, посчитанный для данных заранее — инкрементально, по патчу. Кладётся до того, как
 * данные попадут в стор: селектор находит готовый индекс и полного расчёта не запускает.
 */
export function setAggregateIndex(nodes: readonly OrgNode[], index: AggregateIndex): void {
  indexes.set(nodes, index);
}
