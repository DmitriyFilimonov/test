import { createSelector } from '@reduxjs/toolkit';
import type { OrgTreeSortColumn } from './params';
import type { OrgNode } from './schema';
import { selectNodeLevels, selectOrgNodes, selectSubtreeAggregates } from './selectors';

/** Колонки таблицы по порядку. */
export const ORG_TABLE_COLUMNS = [
  'name',
  'level',
  'totalHeadcount',
  'totalBudget',
  'totalPerformance',
] as const satisfies readonly OrgTreeSortColumn[];

/**
 * Колонки, по которым таблица сортирует. Уровня среди них нет: сортируются соседи внутри
 * одного родителя, а у соседей уровень один — сортировка по нему ничего бы не меняла.
 */
export const ORG_TABLE_SORT_COLUMNS = [
  'name',
  'totalHeadcount',
  'totalBudget',
  'totalPerformance',
] as const satisfies readonly OrgTreeSortColumn[];

export type OrgTableColumn = (typeof ORG_TABLE_COLUMNS)[number];
export type OrgTableSortColumn = (typeof ORG_TABLE_SORT_COLUMNS)[number];

/** Строка аналитической таблицы: узел оргдерева с итогами по всему подразделению. */
export interface TableRow {
  id: string;
  /** ID родителя, null для корневых. Нужно для достраивания предков при клиентской фильтрации. */
  parentId: string | null;
  name: string;
  /** Уровень в дереве, 1-based: дивизион — 1. */
  level: number;
  /** Собственные сотрудники узла и всех потомков. */
  totalHeadcount: number;
  /** Бюджет узла и всех потомков. */
  totalBudget: number;
  /** Эффективность, взвешенная по собственным сотрудникам каждого узла; null — людей нет. */
  totalPerformance: number | null;
  /** Совпал ли узел с q. false — строка контекста: предок совпавшего узла. */
  matches: boolean;
}

/**
 * Строки таблицы, сгруппированные по иерархии: потомки идут сразу под родителем, соседи — в
 * порядке `order` из ответа сервера. Серверная сортировка сквозная и стабильная, поэтому
 * порядок соседей в ней и есть их сортировка между собой: клиент строки не сравнивает.
 *
 * Фильтр согласован с группировкой: в таблице совпавшие узлы и их предки (строки контекста,
 * `matches: false`), чтобы было видно, где совпадение. Несовпавшие потомки совпавшего узла не
 * показываются: они уже входят в его итог.
 *
 * Итоги — проекция `selectSubtreeAggregates` (тот же расчёт и та же мемоизация, что у
 * дерева) по полному дереву: фильтр отбирает строки, но не меняет итоги. От раскрытия дерева
 * не зависит.
 */
export const selectTableRows = createSelector(
  [selectOrgNodes, selectSubtreeAggregates, selectNodeLevels],
  (nodes, aggregates, levels): TableRow[] => {
    // order — перестановка 0..n-1 (проверяет схема): обход узлов по order раскладывает детей
    // каждого родителя сразу в нужном порядке, без сравнений.
    const byOrder = new Array<OrgNode>(nodes.length);
    for (const node of nodes) {
      byOrder[node.order] = node;
    }
    const nodeById = new Map<string, OrgNode>();
    const childrenByParent = new Map<string | null, OrgNode[]>();
    for (const node of byOrder) {
      nodeById.set(node.id, node);
      const siblings = childrenByParent.get(node.parentId);
      if (siblings) {
        siblings.push(node);
      } else {
        childrenByParent.set(node.parentId, [node]);
      }
    }

    // Узел в таблице, если совпал сам или совпал кто-то из потомков. Подъём от совпавшего
    // останавливается на уже отмеченном предке: каждый узел отмечается один раз.
    const shown = new Set<string>();
    for (const node of nodes) {
      let current = node.matches ? node : undefined;
      while (current && !shown.has(current.id)) {
        shown.add(current.id);
        current = current.parentId === null ? undefined : nodeById.get(current.parentId);
      }
    }

    // Обход в глубину: стек, дети кладутся в обратном порядке, чтобы первым вышел первый.
    // Неотмеченный узел пропускается вместе с поддеревом: совпавших в нём нет.
    const stack: OrgNode[] = [];
    const pushChildren = (parentId: string | null) => {
      const children = childrenByParent.get(parentId) ?? [];
      for (let i = children.length - 1; i >= 0; i--) {
        if (shown.has(children[i].id)) {
          stack.push(children[i]);
        }
      }
    };

    const rows: TableRow[] = [];
    pushChildren(null);
    while (stack.length > 0) {
      const node = stack.pop()!;
      // Данные прошли схему (нет битых parentId и циклов): агрегат и уровень есть у каждого узла.
      const total = aggregates.get(node.id)!;
      rows.push({
        id: node.id,
        parentId: node.parentId,
        name: node.name,
        level: levels.get(node.id)!,
        totalHeadcount: total.headcount,
        totalBudget: total.budget,
        totalPerformance: total.performance,
        matches: node.matches,
      });
      pushChildren(node.id);
    }
    return rows;
  },
);
