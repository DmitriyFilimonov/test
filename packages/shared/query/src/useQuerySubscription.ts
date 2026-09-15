import type { UnknownAction } from '@reduxjs/toolkit';
import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';

export interface SubscribableQuery<TParams> {
  actions: {
    subscribed: (params: TParams) => UnknownAction;
    unsubscribed: (params: TParams) => UnknownAction;
  };
  getKey: (params: TParams) => string;
}

/**
 * Объявляет подписку на ключ `getKey(params)` на время жизни компонента. Свежесть не
 * считает и запросы не запускает: это решает сага по счётчикам подписчиков и fetchedAt.
 *
 * Переподписка — только при смене ключа, а не ссылки на объект параметров: параметры
 * запоминаются в состоянии и заменяются, когда меняется их сериализация.
 */
export function useQuerySubscription<TParams>(
  { actions: { subscribed, unsubscribed }, getKey }: SubscribableQuery<TParams>,
  params: TParams,
): void {
  const dispatch = useDispatch();
  const key = getKey(params);
  const [subscription, setSubscription] = useState({ key, params });
  if (subscription.key !== key) {
    setSubscription({ key, params });
  }

  useEffect(() => {
    dispatch(subscribed(subscription.params));
    return () => {
      dispatch(unsubscribed(subscription.params));
    };
  }, [dispatch, subscribed, unsubscribed, subscription]);
}
