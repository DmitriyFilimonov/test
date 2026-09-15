import {
  combineSlices,
  configureStore,
  type Middleware,
  type UnknownAction,
} from '@reduxjs/toolkit';
import { render, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import createSagaMiddleware from 'redux-saga';
import { describe, expect, it, vi } from 'vitest';
import { createQuery } from './createQuery';
import { useQuerySubscription } from './useQuerySubscription';

interface Params {
  q: string;
  page?: number;
}

/** Реальный стор с сагой запроса; фетчер не отвечает и, как fetch, отклоняется при abort(). */
function setup() {
  const signals: AbortSignal[] = [];
  const fetcher = vi.fn(
    (_params: Params, signal: AbortSignal) =>
      new Promise<unknown>((_resolve, reject) => {
        signals.push(signal);
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('The operation was aborted.', 'AbortError')),
          { once: true },
        );
      }),
  );
  const query = createQuery({
    name: 'items',
    fetcher,
    parse: (raw: unknown) => raw as string[],
    isEqual: () => false,
  });

  const actions: UnknownAction[] = [];
  const recordActions: Middleware = () => (next) => (action) => {
    actions.push(action as UnknownAction);
    return next(action);
  };
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: combineSlices(query),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(recordActions, sagaMiddleware),
  });
  sagaMiddleware.run(query.saga);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  /** Подписки и отписки в порядке диспатча: `+ключ` и `-ключ`. */
  const subscriptions = () =>
    actions.flatMap((action) =>
      query.actions.subscribed.match(action)
        ? [`+${action.payload.key}`]
        : query.actions.unsubscribed.match(action)
          ? [`-${action.payload.key}`]
          : [],
    );

  return { query, fetcher, signals, actions, store, wrapper, subscriptions };
}

function Subscriber({
  query,
  params,
}: {
  query: ReturnType<typeof setup>['query'];
  params: Params;
}) {
  useQuerySubscription(query, params);
  return null;
}

describe('useQuerySubscription', () => {
  it('монтирование диспатчит subscribed с параметрами, размонтирование — unsubscribed', () => {
    const { query, actions, wrapper, subscriptions } = setup();
    const params = { q: 'a' };
    const key = query.getKey(params);

    const { unmount } = renderHook(() => useQuerySubscription(query, params), { wrapper });
    expect(subscriptions()).toEqual([`+${key}`]);
    expect(actions.find(query.actions.subscribed.match)?.payload.params).toEqual(params);

    unmount();
    expect(subscriptions()).toEqual([`+${key}`, `-${key}`]);
    expect(actions.find(query.actions.unsubscribed.match)?.payload.params).toEqual(params);
  });

  it('новый объект параметров с тем же ключом не переподписывает', () => {
    const { query, wrapper, subscriptions } = setup();
    const { rerender } = renderHook<void, Params>((params) => useQuerySubscription(query, params), {
      wrapper,
      initialProps: { q: 'a' },
    });

    rerender({ q: 'a' });
    // Порядок полей и undefined не меняют ключ.
    rerender({ page: undefined, q: 'a' });
    expect(subscriptions()).toEqual([`+${query.getKey({ q: 'a' })}`]);
  });

  it('смена ключа: отписка от старого ключа с его параметрами, подписка на новый', () => {
    const { query, actions, wrapper, subscriptions } = setup();
    const { rerender } = renderHook<void, Params>((params) => useQuerySubscription(query, params), {
      wrapper,
      initialProps: { q: 'a' },
    });

    rerender({ q: 'b' });
    const a = query.getKey({ q: 'a' });
    const b = query.getKey({ q: 'b' });
    expect(subscriptions()).toEqual([`+${a}`, `-${a}`, `+${b}`]);
    expect(actions.find(query.actions.unsubscribed.match)?.payload.params).toEqual({ q: 'a' });
  });

  it('подписка → отписка → подписка (StrictMode): итоговый счётчик 1, запрос жив до размонтирования', () => {
    const { query, fetcher, signals, store, subscriptions } = setup();
    const key = query.getKey({ q: 'a' });

    // StrictMode — в корне: в React 19 вложенный StrictMode не повторяет эффекты при монтировании.
    const { unmount } = render(
      <StrictMode>
        <Provider store={store}>
          <Subscriber query={query} params={{ q: 'a' }} />
        </Provider>
      </StrictMode>,
    );
    // Эффект смонтирован, размонтирован и смонтирован снова: первый запрос отменён отпиской,
    // второй идёт.
    expect(subscriptions()).toEqual([`+${key}`, `-${key}`, `+${key}`]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);

    // Счётчик ключа — 1: единственная отписка переводит его в 0 и отменяет запрос.
    unmount();
    expect(signals[1]!.aborted).toBe(true);
  });

  it('два подписчика одного ключа: запрос отменяется только с уходом последнего', () => {
    const { query, fetcher, signals, wrapper } = setup();
    const params = { q: 'a' };

    const first = render(<Subscriber query={query} params={params} />, { wrapper });
    const second = render(<Subscriber query={query} params={{ ...params }} />, { wrapper });
    expect(fetcher).toHaveBeenCalledTimes(1);

    first.unmount();
    expect(signals[0]!.aborted).toBe(false);
    second.unmount();
    expect(signals[0]!.aborted).toBe(true);
  });
});
