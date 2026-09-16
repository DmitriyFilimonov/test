import { useCallback, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { orgTreeLive } from './live';

export type OrgTreeLiveRootState = Parameters<typeof orgTreeLive.selectors.selectState>[0];

const useLiveSelector = useSelector.withTypes<OrgTreeLiveRootState>();

/**
 * Подписка на поток изменений оргдерева на время жизни компонента. Соединение одно на все
 * подписки: его открывает первая и закрывает последняя.
 */
export function useOrgTreeLiveSubscription(): void {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(orgTreeLive.actions.subscribed());
    return () => {
      dispatch(orgTreeLive.actions.unsubscribed());
    };
  }, [dispatch]);
}

/**
 * Состояние соединения для индикатора. lastSeq не выбирается: иначе каждое событие потока
 * перерисовывало бы индикатор.
 */
export function useOrgTreeLiveStatus() {
  const dispatch = useDispatch();
  const status = useLiveSelector(orgTreeLive.selectors.selectStatus);
  const attempt = useLiveSelector(orgTreeLive.selectors.selectAttempt);
  const retryAt = useLiveSelector(orgTreeLive.selectors.selectRetryAt);
  const reconnect = useCallback(() => {
    dispatch(orgTreeLive.actions.reconnect());
  }, [dispatch]);
  return useMemo(
    () => ({ status, attempt, retryAt, reconnect }),
    [status, attempt, retryAt, reconnect],
  );
}

export type OrgTreeLiveStatus = ReturnType<typeof useOrgTreeLiveStatus>;
