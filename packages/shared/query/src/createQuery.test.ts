import { combineSlices, configureStore, type Middleware } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuery, DEFAULT_STALE_TIME } from './createQuery';

interface Item {
  id: string;
  value: number;
}

interface PendingRequest {
  signal: AbortSignal;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/** Фетчер, ответами которого управляет тест. Как и fetch, отклоняется с AbortError при abort(). */
function createControllableFetcher() {
  const requests: PendingRequest[] = [];
  const fetcher = vi.fn(
    (signal: AbortSignal) =>
      new Promise<unknown>((resolve, reject) => {
        requests.push({ signal, resolve, reject });
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('The operation was aborted.', 'AbortError')),
          { once: true },
        );
      }),
  );
  return { fetcher, requests };
}

function setup({
  parse = (raw: unknown) => raw as Item[],
}: { parse?: (raw: unknown) => Item[] } = {}) {
  const { fetcher, requests } = createControllableFetcher();
  const query = createQuery({
    name: 'items',
    fetcher,
    parse,
    isEqual: (current, next) => JSON.stringify(current) === JSON.stringify(next),
  });

  const dispatchedTypes: string[] = [];
  const recordActions: Middleware = () => (next) => (action) => {
    dispatchedTypes.push((action as { type: string }).type);
    return next(action);
  };

  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: combineSlices(query),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(recordActions, sagaMiddleware),
  });
  sagaMiddleware.run(query.saga);

  const { actions, selectors } = query;
  return {
    fetcher,
    requests,
    dispatchedTypes,
    subscribe: () => store.dispatch(actions.subscribed()),
    unsubscribe: () => store.dispatch(actions.unsubscribed()),
    request: (force?: boolean) => store.dispatch(actions.requested({ force })),
    read: () => {
      const root = store.getState();
      return {
        ...selectors.selectState(root),
        isLoading: selectors.selectIsLoading(root),
        isValidating: selectors.selectIsValidating(root),
      };
    },
  };
}

/** Даёт отработать промисам фетчера и продолжению саги. */
const flush = () => vi.advanceTimersByTimeAsync(0);

const V1: Item[] = [{ id: 'a', value: 1 }];
const V2: Item[] = [{ id: 'a', value: 2 }];

describe('createQuery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. первая подписка — один вызов фетчера', async () => {
    const q = setup();

    q.subscribe();
    expect(q.fetcher).toHaveBeenCalledTimes(1);
    expect(q.read()).toMatchObject({ status: 'loading', isLoading: true, isValidating: false });

    q.requests[0]!.resolve(V1);
    await flush();

    expect(q.fetcher).toHaveBeenCalledTimes(1);
    expect(q.read()).toMatchObject({
      status: 'success',
      data: V1,
      fetchedAt: Date.now(),
      isLoading: false,
    });
  });

  it('2. две подписки в одном тике — фетчер вызван один раз', async () => {
    const q = setup();

    q.subscribe();
    q.subscribe();
    q.requests[0]!.resolve(V1);
    await flush();

    expect(q.fetcher).toHaveBeenCalledTimes(1);
    expect(q.read().status).toBe('success');
  });

  it('3. повторная подписка внутри staleTime — фетчер не вызван', async () => {
    const q = setup();

    q.subscribe();
    q.requests[0]!.resolve(V1);
    await flush();
    q.unsubscribe();

    vi.advanceTimersByTime(DEFAULT_STALE_TIME - 1);
    q.subscribe();

    expect(q.fetcher).toHaveBeenCalledTimes(1);
    expect(q.read()).toMatchObject({ status: 'success', isValidating: false });
  });

  it('4. подписка после staleTime — фетчер вызван, старые данные доступны всё время запроса', async () => {
    const q = setup();

    q.subscribe();
    q.requests[0]!.resolve(V1);
    await flush();
    const staleData = q.read().data;
    q.unsubscribe();

    vi.advanceTimersByTime(DEFAULT_STALE_TIME);
    q.subscribe();
    expect(q.fetcher).toHaveBeenCalledTimes(2);

    const expectRevalidating = () => {
      const state = q.read();
      expect(state.data).toBe(staleData);
      expect(state).toMatchObject({ status: 'loading', isValidating: true, isLoading: false });
    };
    expectRevalidating();
    await flush();
    vi.advanceTimersByTime(1000);
    await flush();
    expectRevalidating();

    q.requests[1]!.resolve(V2);
    await flush();
    expect(q.read()).toMatchObject({ status: 'success', data: V2, isValidating: false });
  });

  it('5. отписка последнего подписчика во время запроса — abort, без состояния ошибки', async () => {
    const q = setup();

    q.subscribe();
    const { signal } = q.requests[0]!;
    expect(signal.aborted).toBe(false);

    q.unsubscribe();
    expect(signal.aborted).toBe(true);
    await flush();

    expect(q.read()).toMatchObject({
      status: 'idle',
      error: undefined,
      isLoading: false,
      isValidating: false,
    });
    expect(q.dispatchedTypes).toContain('items/fetchCancelled');
    expect(q.dispatchedTypes).not.toContain('items/fetchFailed');
  });

  it('6. отписка одного из двух подписчиков — запрос не отменён', async () => {
    const q = setup();

    q.subscribe();
    q.subscribe();
    q.unsubscribe();

    expect(q.requests[0]!.signal.aborted).toBe(false);
    q.requests[0]!.resolve(V1);
    await flush();
    expect(q.read()).toMatchObject({ status: 'success', data: V1 });
  });

  it('7. ответ, равный текущим данным, — ссылка на data не меняется', async () => {
    const q = setup();

    q.subscribe();
    q.requests[0]!.resolve(V1);
    await flush();
    const before = q.read();

    vi.advanceTimersByTime(DEFAULT_STALE_TIME);
    q.request(true);
    q.requests[1]!.resolve(structuredClone(V1));
    await flush();

    const after = q.read();
    expect(after.data).toBe(before.data);
    expect(after.fetchedAt).toBe(Date.now());
    expect(after.fetchedAt).toBeGreaterThan(before.fetchedAt!);
    expect(after.status).toBe('success');

    // Контроль: при реальном изменении ссылка заменяется.
    q.request(true);
    q.requests[2]!.resolve(V2);
    await flush();
    expect(q.read().data).not.toBe(before.data);
    expect(q.read().data).toEqual(V2);
  });

  it("8. отклонённый фетчер — status 'error', предыдущие data сохранены", async () => {
    const q = setup();

    q.subscribe();
    q.requests[0]!.resolve(V1);
    await flush();
    const { data: previousData, fetchedAt: previousFetchedAt } = q.read();

    q.request(true);
    q.requests[1]!.reject(new Error('Network down'));
    await flush();

    const state = q.read();
    expect(state.status).toBe('error');
    expect(state.error).toMatchObject({ name: 'Error', message: 'Network down' });
    expect(state.data).toBe(previousData);
    expect(state.fetchedAt).toBe(previousFetchedAt);
    expect(state).toMatchObject({ isLoading: false, isValidating: false });
  });

  it('AbortError без отмены задачи — не ошибка, статус восстановлен; сетевая ошибка — ошибка', async () => {
    const q = setup();

    q.subscribe();
    q.requests[0]!.resolve(V1);
    await flush();

    // Сигнал оборван извне: задачу никто не отменял, reject приходит в catch.
    q.request(true);
    q.requests[1]!.reject(new DOMException('The operation was aborted.', 'AbortError'));
    await flush();

    expect(q.read()).toMatchObject({
      status: 'success',
      data: V1,
      error: undefined,
      isValidating: false,
    });
    expect(q.dispatchedTypes).not.toContain('items/fetchFailed');

    // Задача завершилась: следующий запрос стартует.
    q.request(true);
    expect(q.fetcher).toHaveBeenCalledTimes(3);

    // Обрыв соединения fetch отдаёт как TypeError — это ошибка.
    q.requests[2]!.reject(new TypeError('Failed to fetch'));
    await flush();
    expect(q.read()).toMatchObject({
      status: 'error',
      data: V1,
      error: { name: 'TypeError', message: 'Failed to fetch' },
    });
  });

  it('requested({ force }) обходит staleTime, но не запускает второй запрос параллельно', async () => {
    const q = setup();

    q.subscribe();
    q.requests[0]!.resolve(V1);
    await flush();

    q.request();
    expect(q.fetcher).toHaveBeenCalledTimes(1);

    q.request(true);
    q.request(true);
    q.subscribe();
    expect(q.fetcher).toHaveBeenCalledTimes(2);
  });

  it("ошибка parse — status 'error', данные не заменены", async () => {
    const q = setup({
      parse: (raw) => {
        if (!Array.isArray(raw)) {
          throw new TypeError('Expected an array');
        }
        return raw as Item[];
      },
    });

    q.subscribe();
    q.requests[0]!.resolve(V1);
    await flush();

    q.request(true);
    q.requests[1]!.resolve({ not: 'an array' });
    await flush();

    expect(q.read()).toMatchObject({
      status: 'error',
      data: V1,
      error: { name: 'TypeError', message: 'Expected an array' },
    });
  });

  it('быстрое размонтирование и монтирование (подписка, отписка, подписка в одном тике): первый запрос отменён, второй завершается', async () => {
    const q = setup();

    q.subscribe();
    q.unsubscribe();
    q.subscribe();

    expect(q.fetcher).toHaveBeenCalledTimes(2);
    expect(q.requests[0]!.signal.aborted).toBe(true);
    expect(q.requests[1]!.signal.aborted).toBe(false);

    q.requests[1]!.resolve(V1);
    await flush();
    expect(q.read()).toMatchObject({ status: 'success', data: V1, error: undefined });
  });
});
