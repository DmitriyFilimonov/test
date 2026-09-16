import {
  useDefaultExpandedIds,
  useExpansion,
  useOrgTreeLiveSubscription,
  useOrgTreeStructure,
  useSearchParse,
  type ParseResult,
  type RevealRequest,
  type StructuredFilter,
} from '@entities/org-tree';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ORG_DASHBOARD_VIEWS,
  isEmptyStructuredFilter,
  resolveView,
  type OrgDashboardView,
  type StructuredFilterUrl,
} from './searchParams';
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

/** Преобразовать StructuredFilter (из parse) в StructuredFilterUrl (для URL). */
function filterToUrl(filter: StructuredFilter): StructuredFilterUrl {
  return {
    levels: filter.levels ?? [],
    minHeadcount: filter.minHeadcount,
    maxHeadcount: filter.maxHeadcount,
    minBudget: filter.minBudget,
    maxBudget: filter.maxBudget,
    minPerformance: filter.minPerformance,
    maxPerformance: filter.maxPerformance,
  };
}

/** Преобразовать StructuredFilterUrl в StructuredFilter. */
function filterFromUrl(filter: StructuredFilterUrl): StructuredFilter {
  return {
    levels: filter.levels.length > 0 ? filter.levels : undefined,
    minHeadcount: filter.minHeadcount,
    maxHeadcount: filter.maxHeadcount,
    minBudget: filter.minBudget,
    maxBudget: filter.maxBudget,
    minPerformance: filter.minPerformance,
    maxPerformance: filter.maxPerformance,
  };
}

/**
 * Координация дерева и таблицы на странице: параметры и режим из адреса, раскрытие и
 * выделение в состоянии страницы. Страница только рисует модель.
 */
export function useOrgDashboardModel() {
  // Поток изменений открыт, пока страница на экране. Состояние соединения читает индикатор:
  // смена статуса перерисовывает его, а не страницу.
  useOrgTreeLiveSubscription();
  const {
    params,
    view,
    setParams,
    setView,
    structuredFilter,
    setStructuredFilter,
    clearStructuredFilter,
    searchByText,
  } = useOrgDashboardParams();
  const splitAvailable = useSplitAvailable();
  const effectiveView = resolveView(view, splitAvailable);

  // Раскрытие на странице: таблице нужно раскрывать предков выбранного узла.
  const structure = useOrgTreeStructure(params);
  const initialExpandedIds = useDefaultExpandedIds(params);
  const expansion = useExpansion({ initialExpandedIds, structure });
  const { expandAncestors } = expansion;

  const [selection, setSelection] = useState<SelectionState>(NO_SELECTION);

  // Отслеживаем последний разобранный query — для подавления повторного разбора.
  const [lastParsedQuery, setLastParsedQuery] = useState<string | null>(null);

  // Был ли текущий query уже разобран
  const hasParsedQuery = useMemo(() => {
    // Если в URL уже есть структурный фильтр — значит разбор уже был
    if (!isEmptyStructuredFilter(structuredFilter)) {
      return true;
    }
    // Если текущий params.q совпадает с последним разобранным — не разбираем снова
    if (lastParsedQuery !== null && params.q === lastParsedQuery) {
      return true;
    }
    return false;
  }, [structuredFilter, params.q, lastParsedQuery]);

  const handleParseResult = useCallback(
    (result: ParseResult) => {
      setLastParsedQuery(result.query);
      if (result.mode === 'structured') {
        setStructuredFilter(filterToUrl(result.filter));
      }
    },
    [setStructuredFilter],
  );

  const searchParse = useSearchParse({
    query: params.q,
    hasParsedQuery,
    onParseResult: handleParseResult,
  });

  // Очищаем q при появлении структурного фильтра — сервер должен вернуть все узлы.
  useEffect(() => {
    if (!isEmptyStructuredFilter(structuredFilter) && params.q !== '') {
      setParams({ ...params, q: '' });
    }
  }, [structuredFilter, params, setParams]);

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

  // «Искать по тексту»: q к этому моменту уже очищен, фраза осталась в lastParsedQuery. Она же
  // подавляет повторный разбор. Страница открыта по ссылке с фильтром — фразы нет, поле пустое.
  const handleSearchByText = useCallback(() => {
    searchByText(lastParsedQuery ?? '');
  }, [lastParsedQuery, searchByText]);

  // Снятие одного условия — обновить фильтр в URL. Парные min/max снимаются вместе.
  const removeFilterCondition = useCallback(
    (key: keyof StructuredFilter) => {
      const next: StructuredFilterUrl = { ...structuredFilter };
      if (key === 'levels') {
        next.levels = [];
      } else if (key === 'minHeadcount' || key === 'maxHeadcount') {
        next.minHeadcount = undefined;
        next.maxHeadcount = undefined;
      } else if (key === 'minBudget' || key === 'maxBudget') {
        next.minBudget = undefined;
        next.maxBudget = undefined;
      } else if (key === 'minPerformance' || key === 'maxPerformance') {
        next.minPerformance = undefined;
        next.maxPerformance = undefined;
      }
      setStructuredFilter(next);
    },
    [structuredFilter, setStructuredFilter],
  );

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
    /** Структурный фильтр для таблицы. */
    structuredFilter: filterFromUrl(structuredFilter),
    /** Идёт ли разбор фразы. */
    isParsing: searchParse.isParsing,
    /** Плашка видна когда есть структурный фильтр. */
    hasStructuredFilter: !isEmptyStructuredFilter(structuredFilter),
    /** Объяснение для плашки — собираем из filter на клиенте. */
    filterExplanation: buildExplanation(filterFromUrl(structuredFilter)),
    /** Снять структурный фильтр целиком. */
    clearStructuredFilter,
    /** «Искать по тексту» — вернуть к q и не разбирать снова. */
    searchByText: handleSearchByText,
    /** Снять одно условие из фильтра. */
    removeFilterCondition,
  };
}

/** Собрать объяснение из структурного фильтра (клиентская версия). */
function buildExplanation(filter: StructuredFilter): string {
  const parts: string[] = [];

  if (filter.levels) {
    const levelNames: Record<number, string> = { 1: 'дивизионы', 2: 'отделы', 3: 'команды' };
    const names = filter.levels.map((l) => levelNames[l]).join(', ');
    parts.push(names);
  }

  if (filter.minHeadcount !== undefined && filter.maxHeadcount !== undefined) {
    parts.push(`численность ${filter.minHeadcount}–${filter.maxHeadcount}`);
  } else if (filter.minHeadcount !== undefined) {
    parts.push(`численность от ${filter.minHeadcount}`);
  } else if (filter.maxHeadcount !== undefined) {
    parts.push(`численность до ${filter.maxHeadcount}`);
  }

  if (filter.minBudget !== undefined && filter.maxBudget !== undefined) {
    parts.push(`бюджет ${filter.minBudget}–${filter.maxBudget}`);
  } else if (filter.minBudget !== undefined) {
    parts.push(`бюджет от ${filter.minBudget}`);
  } else if (filter.maxBudget !== undefined) {
    parts.push(`бюджет до ${filter.maxBudget}`);
  }

  if (filter.minPerformance !== undefined && filter.maxPerformance !== undefined) {
    parts.push(`эффективность ${filter.minPerformance}–${filter.maxPerformance}%`);
  } else if (filter.minPerformance !== undefined) {
    parts.push(`эффективность от ${filter.minPerformance}%`);
  } else if (filter.maxPerformance !== undefined) {
    parts.push(`эффективность до ${filter.maxPerformance}%`);
  }

  return parts.length > 0 ? parts.join(', ') : 'все подразделения';
}
