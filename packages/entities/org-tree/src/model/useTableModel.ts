import type { SerializedError } from '@reduxjs/toolkit';
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useOrgTree, useOrgTreeUpdates } from './hooks';
import type { OrgTreeParams, OrgTreeSortColumn, OrgTreeSortDirection } from './params';
import type { OrgTreeRootState } from './selectors';
import { selectTableRows, type OrgTableSortColumn, type TableRow } from './table';
import type { OrgTreeUpdatesState } from './updates';
import { applyStructuredFilter, isEmptyFilter, type StructuredFilter } from './structuredFilter';

/** Пауза ввода, после которой текст поля уходит в параметры запроса. */
export const TABLE_QUERY_DEBOUNCE_MS = 250;

export interface UseTableModelOptions {
  /** Параметры запроса таблицы. Источник правды снаружи (состояние страницы, затем URL). */
  params: OrgTreeParams;
  /**
   * Желаемые параметры. Хук их не хранит и не ждёт применения: применённые параметры
   * приходят обратно через `params`.
   */
  onParamsChange: (params: OrgTreeParams) => void;
  /**
   * Структурный фильтр из адресной строки. Применяется к строкам таблицы на клиенте,
   * не меняет ключ кэша и не уходит в запрос.
   */
  structuredFilter?: StructuredFilter;
}

export interface TableModel {
  /**
   * Строки текущего ключа или, при `isPlaceholder`, прежнего: его фильтр и его порядок.
   * Сгруппированы по иерархии, см. `selectTableRows`.
   */
  rows: readonly TableRow[];
  /**
   * Номера патчей, изменивших значения узлов, по id. Отдельно от строк: строки пересчитываются
   * от данных, а номера приходят своим экшеном.
   */
  updates: OrgTreeUpdatesState;
  sort: OrgTreeSortColumn;
  dir: OrgTreeSortDirection;
  /** Показать нечего, и ошибки нет: запрос идёт или вот-вот начнётся. */
  isLoading: boolean;
  /** Есть что показать (свои данные или прежнего ключа), и идёт запрос. */
  isValidating: boolean;
  /** Строки — от прежних параметров, по новым ответа ещё нет. */
  isPlaceholder: boolean;
  /** Данные есть (свои или прежнего ключа). */
  hasData: boolean;
  /** Сервер вернул пустой список: подразделений нет вообще, а не «не нашлось». */
  isEmpty: boolean;
  /** Ошибка последнего запроса ключа. Остаётся, пока идёт повтор. */
  error: SerializedError | undefined;
  /** Текст в поле фильтра. Обновляется сразу, в `params.q` уходит после паузы. */
  draftQuery: string;
  setDraftQuery: (query: string) => void;
  /** Очистить фильтр: поле и `q` — сразу, без паузы. */
  clearQuery: () => void;
  /**
   * Поле поиска заблокировано — активен структурный фильтр. Пользователь снимает его через
   * плашку, а не через поле.
   */
  filterDisabled: boolean;
  /** Та же колонка — обратное направление, другая — эта колонка по возрастанию. */
  toggleSort: (column: OrgTableSortColumn) => void;
  retry: () => void;
}

const useOrgTreeSelector = useSelector.withTypes<OrgTreeRootState>();

/**
 * Модель аналитической таблицы: строки и состояние запроса по `params`, черновик фильтра с
 * дебаунсом, переключение сортировки. Сортирует и фильтрует сервер, компонент таблицы только
 * рисует модель.
 */
export function useTableModel({
  params,
  onParamsChange,
  structuredFilter,
}: UseTableModelOptions): TableModel {
  const { status, error, hasData, isEmpty, isValidating, isPlaceholder, retry } =
    useOrgTree(params);
  const baseRows = useOrgTreeSelector((state) => selectTableRows(state, params));
  const updates = useOrgTreeUpdates();

  // Клиентская фильтрация поверх загруженных данных
  const rows = useMemo(() => {
    if (!structuredFilter || isEmptyFilter(structuredFilter)) {
      return baseRows;
    }
    return applyStructuredFilter(baseRows, structuredFilter);
  }, [baseRows, structuredFilter]);

  const [draftQuery, setDraftQuery] = useState(params.q);
  // q из прошлого рендера — чтобы заметить, что params.q изменился, — и q, отправленное хуком
  // и ещё не вернувшееся через params.
  const [seenQuery, setSeenQuery] = useState(params.q);
  const [sentQuery, setSentQuery] = useState<string | null>(null);
  if (params.q !== seenQuery) {
    setSeenQuery(params.q);
    setSentQuery(null);
    // Вернулось своё значение — поле не трогаем: если родитель применяет параметры не в том
    // же рендере (URL), пользователь мог набрать дальше. Чужое изменение (кнопка «назад») —
    // поле показывает его, а отложенная отправка старого текста снимается эффектом ниже.
    if (params.q !== sentQuery) {
      setDraftQuery(params.q);
    }
  }

  // Событие эффекта читает params и onParamsChange последнего рендера: смена сортировки или
  // новая функция у родителя не перезапускают паузу.
  const applyQuery = useEffectEvent((query: string) => {
    setSentQuery(query);
    onParamsChange({ ...params, q: query });
  });

  const isDraftPending = draftQuery !== params.q;
  useEffect(() => {
    if (!isDraftPending) {
      return;
    }
    const timer = setTimeout(() => applyQuery(draftQuery), TABLE_QUERY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftQuery, isDraftPending]);

  const clearQuery = useCallback(() => {
    setDraftQuery('');
    if (params.q !== '') {
      setSentQuery('');
      onParamsChange({ ...params, q: '' });
    }
  }, [params, onParamsChange]);

  const toggleSort = useCallback(
    (column: OrgTableSortColumn) => {
      const dir = column !== params.sort ? 'asc' : params.dir === 'asc' ? 'desc' : 'asc';
      onParamsChange({ ...params, sort: column, dir });
    },
    [params, onParamsChange],
  );

  return useMemo(
    () => ({
      rows,
      updates,
      sort: params.sort,
      dir: params.dir,
      isLoading: !hasData && status !== 'error',
      isValidating,
      isPlaceholder,
      hasData,
      isEmpty,
      error,
      draftQuery,
      setDraftQuery,
      clearQuery,
      filterDisabled: structuredFilter != null && !isEmptyFilter(structuredFilter),
      toggleSort,
      retry,
    }),
    [
      rows,
      updates,
      params.sort,
      params.dir,
      status,
      isValidating,
      isPlaceholder,
      hasData,
      isEmpty,
      error,
      draftQuery,
      clearQuery,
      structuredFilter,
      toggleSort,
      retry,
    ],
  );
}
