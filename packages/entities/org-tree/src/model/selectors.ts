import { createSelector } from '@reduxjs/toolkit';
import { aggregateSubtrees, type SubtreeAggregate } from './aggregate';
import { orgTreeQuery } from './query';
import type { OrgNode } from './schema';

/** Та часть корневого стейта, которую знает пакет. RootState приложения не импортируется. */
export type OrgTreeRootState = Parameters<typeof orgTreeQuery.selectors.selectState>[0];

export interface OrgTreeItem {
  /** Узел как пришёл из API: headcount и budget — собственные значения подразделения. */
  node: OrgNode;
  /** Число прямых детей в данных, а не среди видимых: нужно для шеврона и aria-expanded. */
  childCount: number;
  /**
   * Итоги по всему подразделению (узел и все потомки, видимые и скрытые): сумма headcount,
   * сумма budget, performance, взвешенный по собственному headcount каждого узла.
   */
  subtree: SubtreeAggregate;
}

/**
 * Видимый узел. Форма совместима с LayoutInput из @shared/tidy-tree, кроме size:
 * размеры задаёт виджет.
 */
export interface VisibleOrgTreeNode {
  id: string;
  data: OrgTreeItem;
  children: VisibleOrgTreeNode[];
}

export type ChildrenIndex = ReadonlyMap<string | null, readonly OrgNode[]>;

const EMPTY_NODES: readonly OrgNode[] = [];

const { selectData, selectStatus, selectError, selectIsLoading, selectIsValidating } =
  orgTreeQuery.selectors;

export { selectError, selectIsLoading, selectIsValidating, selectStatus };

export const selectOrgNodes = (state: OrgTreeRootState): readonly OrgNode[] =>
  selectData(state) ?? EMPTY_NODES;

export const selectHasData = (state: OrgTreeRootState): boolean => selectData(state) !== undefined;

export const selectIsEmpty = (state: OrgTreeRootState): boolean => selectData(state)?.length === 0;

/**
 * parentId → дети (корни — под ключом null). Дети отсортированы по имени: сервер не
 * гарантирует порядок, а раскладка и навигация должны быть стабильными.
 */
export const selectChildrenIndex = createSelector([selectOrgNodes], (nodes): ChildrenIndex => {
  const index = new Map<string | null, OrgNode[]>();
  for (const node of nodes) {
    const siblings = index.get(node.parentId);
    if (siblings) {
      siblings.push(node);
    } else {
      index.set(node.parentId, [node]);
    }
  }
  // Сравнение строк, а не Intl.Collator: инициализация ICU-коллатора занимала ~40 мс
  // первой загрузки при CPU 4x. Для кириллицы порядок кодов совпадает с алфавитом, кроме «ё».
  for (const siblings of index.values()) {
    siblings.sort((a, b) =>
      a.name !== b.name ? (a.name < b.name ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
  }
  return index;
});

export const selectRootNodes = createSelector(
  [selectChildrenIndex],
  (index): readonly OrgNode[] => index.get(null) ?? EMPTY_NODES,
);

/** Идентификаторы узлов первого уровня (корней). */
export const selectFirstLevelIds = createSelector([selectRootNodes], (roots) =>
  roots.map((node) => node.id),
);

/** Идентификаторы всех узлов, у которых есть дети: для «Развернуть всё». */
export const selectExpandableIds = createSelector([selectChildrenIndex], (index) =>
  [...index.keys()].filter((id): id is string => id !== null),
);

/** Итоги по поддереву для каждого узла; пересчитываются только при изменении данных. */
export const selectSubtreeAggregates = createSelector([selectOrgNodes], (nodes) =>
  aggregateSubtrees(nodes),
);

/**
 * Дерево видимых узлов: ребёнок попадает в него, только если раскрыты все его предки.
 * Корни видимы всегда.
 */
export const selectVisibleTree = createSelector(
  [
    selectChildrenIndex,
    selectRootNodes,
    selectSubtreeAggregates,
    (_state: OrgTreeRootState, expandedIds: ReadonlySet<string>) => expandedIds,
  ],
  (index, roots, aggregates, expandedIds): VisibleOrgTreeNode[] => {
    const build = (node: OrgNode): VisibleOrgTreeNode => {
      const children = index.get(node.id) ?? EMPTY_NODES;
      return {
        id: node.id,
        // Узлы строятся от корней, поэтому агрегат есть у каждого.
        data: { node, childCount: children.length, subtree: aggregates.get(node.id)! },
        children: expandedIds.has(node.id) ? children.map(build) : [],
      };
    };
    return roots.map(build);
  },
);

/** Идентификаторы потомков узла (и его самого), у которых есть дети: для Alt+клика. */
export function collectExpandableSubtreeIds(index: ChildrenIndex, rootId: string): string[] {
  const result: string[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const children = index.get(id);
    if (children && children.length > 0) {
      result.push(id);
      for (const child of children) {
        stack.push(child.id);
      }
    }
  }
  return result;
}
