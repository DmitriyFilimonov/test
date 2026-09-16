import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useQuerySubscription } from '@shared/query';
import type { OrgTreeParams } from './params';
import { orgTreeQuery } from './query';
import {
  selectChildrenIndex,
  selectDefaultExpandedIds,
  selectError,
  selectExpandableIds,
  selectFirstLevelIds,
  selectHasData,
  selectIsEmpty,
  selectIsLoading,
  selectIsPlaceholder,
  selectIsValidating,
  selectParentIndex,
  selectStatus,
  selectVisibleTree,
  type OrgTreeRootState,
} from './selectors';
import {
  selectOrgTreeUpdates,
  type OrgTreeUpdatesRootState,
  type OrgTreeUpdatesState,
} from './updates';

const useOrgTreeSelector = useSelector.withTypes<OrgTreeRootState>();

/**
 * Подписка на оргдерево с параметрами запроса и статус записи этого ключа. Решение о
 * запросе принимает сага @shared/query; переподписка — при смене ключа параметров.
 */
export function useOrgTree(params: OrgTreeParams) {
  useQuerySubscription(orgTreeQuery, params);
  const dispatch = useDispatch();

  const status = useOrgTreeSelector((state) => selectStatus(state, params));
  const error = useOrgTreeSelector((state) => selectError(state, params));
  const hasData = useOrgTreeSelector((state) => selectHasData(state, params));
  const isEmpty = useOrgTreeSelector((state) => selectIsEmpty(state, params));
  const isLoading = useOrgTreeSelector((state) => selectIsLoading(state, params));
  const isValidating = useOrgTreeSelector((state) => selectIsValidating(state, params));
  const isPlaceholder = useOrgTreeSelector((state) => selectIsPlaceholder(state, params));

  const retry = useCallback(() => {
    dispatch(orgTreeQuery.actions.requested(params, { force: true }));
  }, [dispatch, params]);

  return useMemo(
    () => ({ status, error, hasData, isEmpty, isLoading, isValidating, isPlaceholder, retry }),
    [status, error, hasData, isEmpty, isLoading, isValidating, isPlaceholder, retry],
  );
}

/** Структура для управления раскрытием: корни, раскрываемые узлы, индексы детей и родителей. */
export function useOrgTreeStructure(params: OrgTreeParams) {
  const firstLevelIds = useOrgTreeSelector((state) => selectFirstLevelIds(state, params));
  const expandableIds = useOrgTreeSelector((state) => selectExpandableIds(state, params));
  const childrenIndex = useOrgTreeSelector((state) => selectChildrenIndex(state, params));
  const parentIndex = useOrgTreeSelector((state) => selectParentIndex(state, params));
  return useMemo(
    () => ({ firstLevelIds, expandableIds, childrenIndex, parentIndex }),
    [firstLevelIds, expandableIds, childrenIndex, parentIndex],
  );
}

/** Раскрытие по умолчанию для данных этих параметров: узлы первого уровня. */
export function useDefaultExpandedIds(params: OrgTreeParams): ReadonlySet<string> {
  return useOrgTreeSelector((state) => selectDefaultExpandedIds(state, params));
}

/**
 * Номера патчей, изменивших значения узлов. Меняется только от патчей потока: подсветка
 * обновлённых значений, без таймеров и без состояния «подсвечено».
 */
export function useOrgTreeUpdates(): OrgTreeUpdatesState {
  return useSelector((state: OrgTreeUpdatesRootState) => selectOrgTreeUpdates(state));
}

/** Дерево видимых узлов при данном наборе раскрытых. */
export function useVisibleOrgTree(params: OrgTreeParams, expandedIds: ReadonlySet<string>) {
  return useOrgTreeSelector((state) => selectVisibleTree(state, params, expandedIds));
}
