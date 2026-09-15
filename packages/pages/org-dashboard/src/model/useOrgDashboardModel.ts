import {
  useDefaultExpandedIds,
  useExpansion,
  useOrgTreeStructure,
  type RevealRequest,
} from '@entities/org-tree';
import { useCallback, useState } from 'react';
import { ORG_DASHBOARD_VIEWS, resolveView, type OrgDashboardView } from './searchParams';
import { useOrgDashboardParams } from './useOrgDashboardParams';
import { useSplitAvailable } from './useSplitAvailable';

const NARROW_VIEWS: readonly OrgDashboardView[] = ['tree', 'table'];

/**
 * Выделение — локальное состояние страницы. Запросы «показать узел» несут nonce: повторный
 * выбор того же узла — новый запрос, и дерево снова доводит холст до узла.
 */
interface SelectionState {
  selectedId: string | null;
  nonce: number;
  /** Выбор пришёл из таблицы: холст дерева доводится до узла. */
  treeReveal: RevealRequest | null;
  /** Выбор пришёл из дерева: таблица прокручивается к строке. */
  tableReveal: RevealRequest | null;
}

const NO_SELECTION: SelectionState = {
  selectedId: null,
  nonce: 0,
  treeReveal: null,
  tableReveal: null,
};

/**
 * Координация дерева и таблицы на странице: параметры и режим из адреса, раскрытие и
 * выделение в состоянии страницы. Страница только рисует модель.
 */
export function useOrgDashboardModel() {
  const { params, view, setParams, setView } = useOrgDashboardParams();
  const splitAvailable = useSplitAvailable();
  const effectiveView = resolveView(view, splitAvailable);

  // Раскрытие на странице: таблице нужно раскрывать предков выбранного узла.
  const structure = useOrgTreeStructure(params);
  const initialExpandedIds = useDefaultExpandedIds(params);
  const expansion = useExpansion({ initialExpandedIds, structure });
  const { expandAncestors } = expansion;

  const [selection, setSelection] = useState<SelectionState>(NO_SELECTION);

  // Операция, а не эффект на selectedId: повторный клик по той же строке после ручного
  // сворачивания снова раскрывает ветку. Раскрытие предков и выбор — два setState в одном
  // обработчике: один рендер.
  const selectFromTable = useCallback(
    (id: string) => {
      setSelection((current) => {
        const nonce = current.nonce + 1;
        return { ...current, selectedId: id, nonce, treeReveal: { id, nonce } };
      });
      expandAncestors(id);
    },
    [expandAncestors],
  );

  const selectFromTree = useCallback((id: string) => {
    setSelection((current) => {
      const nonce = current.nonce + 1;
      return { ...current, selectedId: id, nonce, tableReveal: { id, nonce } };
    });
  }, []);

  return {
    params,
    setParams,
    /** Режим на экране. */
    view: effectiveView,
    setView,
    /** Режимы в переключателе: split — только когда помещается. */
    views: splitAvailable ? ORG_DASHBOARD_VIEWS : NARROW_VIEWS,
    showTree: effectiveView !== 'table',
    showTable: effectiveView !== 'tree',
    /** Приглушение несовпавших узлов — только когда таблица с фильтром на экране. */
    dimUnmatched: effectiveView !== 'tree',
    expansion,
    selectedId: selection.selectedId,
    treeReveal: selection.treeReveal,
    tableReveal: selection.tableReveal,
    selectFromTable,
    selectFromTree,
  };
}
