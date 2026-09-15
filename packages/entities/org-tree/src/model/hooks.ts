import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useQuerySubscription } from '@shared/query';
import { orgTreeQuery } from './query';
import {
  selectChildrenIndex,
  selectError,
  selectExpandableIds,
  selectFirstLevelIds,
  selectHasData,
  selectIsEmpty,
  selectIsLoading,
  selectIsValidating,
  selectStatus,
  selectVisibleTree,
  type OrgTreeRootState,
} from './selectors';

const useOrgTreeSelector = useSelector.withTypes<OrgTreeRootState>();

/** Подписка на оргдерево и его статус. Решение о запросе принимает сага @shared/query. */
export function useOrgTree() {
  useQuerySubscription(orgTreeQuery.actions);
  const dispatch = useDispatch();

  const status = useOrgTreeSelector(selectStatus);
  const error = useOrgTreeSelector(selectError);
  const hasData = useOrgTreeSelector(selectHasData);
  const isEmpty = useOrgTreeSelector(selectIsEmpty);
  const isLoading = useOrgTreeSelector(selectIsLoading);
  const isValidating = useOrgTreeSelector(selectIsValidating);

  const retry = useCallback(() => {
    dispatch(orgTreeQuery.actions.requested({ force: true }));
  }, [dispatch]);

  return useMemo(
    () => ({ status, error, hasData, isEmpty, isLoading, isValidating, retry }),
    [status, error, hasData, isEmpty, isLoading, isValidating, retry],
  );
}

/** Структура для управления раскрытием: корни, раскрываемые узлы, индекс детей. */
export function useOrgTreeStructure() {
  const firstLevelIds = useOrgTreeSelector(selectFirstLevelIds);
  const expandableIds = useOrgTreeSelector(selectExpandableIds);
  const childrenIndex = useOrgTreeSelector(selectChildrenIndex);
  return useMemo(
    () => ({ firstLevelIds, expandableIds, childrenIndex }),
    [firstLevelIds, expandableIds, childrenIndex],
  );
}

/** Дерево видимых узлов при данном наборе раскрытых. */
export function useVisibleOrgTree(expandedIds: ReadonlySet<string>) {
  return useOrgTreeSelector((state) => selectVisibleTree(state, expandedIds));
}
