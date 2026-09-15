import { useCallback, useMemo, useReducer } from 'react';
import { expansionActions, expansionReducer, type ExpansionStructure } from './expansion';

export interface UseExpansionOptions {
  /**
   * Раскрытые узлы, пока пользователь ничего не менял. Могут меняться (пришли данные) — до
   * первого действия раскрытие следует за ними.
   */
  initialExpandedIds: ReadonlySet<string>;
  /** Структура данных для групповых операций (`useOrgTreeStructure`). */
  structure: ExpansionStructure;
}

export interface Expansion {
  expandedIds: ReadonlySet<string>;
  /** Только сам узел: раскрытия потомков сохраняются. */
  toggle: (id: string) => void;
  /** Раскрыт — свернуть узел со всем поддеревом; свёрнут — раскрыть поддерево целиком. */
  toggleRecursive: (id: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  /** Раскрыть всех предков узла одним обновлением: узел становится видимым. */
  expandAncestors: (id: string) => void;
}

/**
 * Состояние раскрытия дерева. Живёт там, где вызван хук (в состоянии React), в Redux не
 * попадает. Операции — действия чистых `expansionActions` и `expansionReducer`.
 */
export function useExpansion({ initialExpandedIds, structure }: UseExpansionOptions): Expansion {
  const [state, dispatch] = useReducer(expansionReducer, null);
  const expandedIds = state ?? initialExpandedIds;

  const toggle = useCallback(
    (id: string) => dispatch(expansionActions.toggle(expandedIds, id)),
    [expandedIds],
  );
  const toggleRecursive = useCallback(
    (id: string) => dispatch(expansionActions.toggleRecursive(expandedIds, structure, id)),
    [expandedIds, structure],
  );
  const expandAll = useCallback(() => dispatch(expansionActions.expandAll(structure)), [structure]);
  const collapseAll = useCallback(() => dispatch(expansionActions.collapseAll()), []);
  const expandAncestors = useCallback(
    (id: string) => dispatch(expansionActions.expandAncestors(expandedIds, structure, id)),
    [expandedIds, structure],
  );

  return useMemo(
    () => ({ expandedIds, toggle, toggleRecursive, expandAll, collapseAll, expandAncestors }),
    [expandedIds, toggle, toggleRecursive, expandAll, collapseAll, expandAncestors],
  );
}
