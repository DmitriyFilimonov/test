import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import type { QueryActions } from './createQuery';

/**
 * Объявляет подписку на время жизни компонента. Свежесть не считает и запросы
 * не запускает: это решает сага по счётчику подписчиков и fetchedAt.
 */
export function useQuerySubscription({
  subscribed,
  unsubscribed,
}: Pick<QueryActions, 'subscribed' | 'unsubscribed'>): void {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(subscribed());
    return () => {
      dispatch(unsubscribed());
    };
  }, [dispatch, subscribed, unsubscribed]);
}
