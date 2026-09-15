import { createSelector } from '@reduxjs/toolkit';
import { aggregateSubtrees, type SubtreeAggregate } from './aggregate';
import type { OrgTreeParams } from './params';
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
  /**
   * Совпал ли узел с q запроса (`node.matches`): чтобы UI мог приглушать несовпавшие.
   * При пустом q — true у всех.
   */
  matches: boolean;
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

const {
  selectData,
  selectStatus,
  selectError,
  selectIsLoading,
  selectIsPlaceholder,
  selectIsValidating,
} = orgTreeQuery.selectors;

// Все селекторы принимают параметры запроса: состояние и данные — у записи этого ключа
// (или данные-заглушка предыдущего ключа, см. isPlaceholder).
export { selectError, selectIsLoading, selectIsPlaceholder, selectIsValidating, selectStatus };

export const selectOrgNodes = (
  state: OrgTreeRootState,
  params: OrgTreeParams,
): readonly OrgNode[] => selectData(state, params) ?? EMPTY_NODES;

export const selectHasData = (state: OrgTreeRootState, params: OrgTreeParams): boolean =>
  selectData(state, params) !== undefined;

export const selectIsEmpty = (state: OrgTreeRootState, params: OrgTreeParams): boolean =>
  selectData(state, params)?.length === 0;

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

/**
 * Уровень узла в дереве, 1-based: корни (дивизионы) — 1, их дети — 2. Считается обходом
 * индекса детей от корней, то есть по той же структуре, что строит дерево.
 */
export const selectNodeLevels = createSelector(
  [selectChildrenIndex],
  (index): ReadonlyMap<string, number> => {
    const levels = new Map<string, number>();
    const stack = (index.get(null) ?? EMPTY_NODES).map((node) => ({ node, level: 1 }));
    while (stack.length > 0) {
      const { node, level } = stack.pop()!;
      levels.set(node.id, level);
      for (const child of index.get(node.id) ?? EMPTY_NODES) {
        stack.push({ node: child, level: level + 1 });
      }
    }
    return levels;
  },
);

/** Идентификаторы узлов первого уровня (корней). */
export const selectFirstLevelIds = createSelector([selectRootNodes], (roots) =>
  roots.map((node) => node.id),
);

/**
 * Раскрытие по умолчанию — узлы первого уровня: видны дивизионы и отделы, команды скрыты.
 * Один набор на данные: смена раскрытия и ревалидация с равными данными его не пересоздают.
 */
export const selectDefaultExpandedIds = createSelector(
  [selectFirstLevelIds],
  (ids): ReadonlySet<string> => new Set(ids),
);

/** id узла → id родителя: для раскрытия предков. */
export const selectParentIndex = createSelector(
  [selectOrgNodes],
  (nodes): ReadonlyMap<string, string | null> =>
    new Map(nodes.map((node) => [node.id, node.parentId])),
);

/** Идентификаторы всех узлов, у которых есть дети: для «Развернуть всё». */
export const selectExpandableIds = createSelector([selectChildrenIndex], (index) =>
  [...index.keys()].filter((id): id is string => id !== null),
);

/**
 * Итоги по поддереву для каждого узла — единственный расчёт итогов, общий для дерева и
 * таблицы. Зависит только от данных: пересчитывается при смене ссылки на data, но не при
 * смене раскрытия и не при ревалидации с равными данными (isEqual сохраняет ссылку).
 */
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
    (_state: OrgTreeRootState, _params: OrgTreeParams, expandedIds: ReadonlySet<string>) =>
      expandedIds,
  ],
  (index, roots, aggregates, expandedIds): VisibleOrgTreeNode[] => {
    const build = (node: OrgNode): VisibleOrgTreeNode => {
      const children = index.get(node.id) ?? EMPTY_NODES;
      return {
        id: node.id,
        // Узлы строятся от корней, поэтому агрегат есть у каждого.
        data: {
          node,
          childCount: children.length,
          subtree: aggregates.get(node.id)!,
          matches: node.matches,
        },
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
