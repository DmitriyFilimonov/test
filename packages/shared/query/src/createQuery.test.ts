import { combineSlices, configureStore, type Middleware } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuery, DEFAULT_STALE_TIME } from './createQuery';
import { serializeParams } from './serializeParams';

interface Item {
  id: string;
  value: number;
}

interface Params {
  q: string;
}

interface PendingRequest {
  params: Params;
  signal: AbortSignal;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/** Фетчер, ответами которого управляет тест. Как и fetch, отклоняется с AbortError при abort(). */
function createControllableFetcher() {
  const requests: PendingRequest[] = [];
  const fetcher = vi.fn(
    (params: Params, signal: AbortSignal) =>
      new Promise<unknown>((resolve, reject) => {
        requests.push({ params, signal, resolve, reject });
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
  debounceMs,
  gcTime,
}: { parse?: (raw: unknown) => Item[]; debounceMs?: number; gcTime?: number } = {}) {
  const { fetcher, requests } = createControllableFetcher();
  const query = createQuery({
    name: 'items',
    fetcher,
    parse,
    isEqual: (current, next) => JSON.stringify(current) === JSON.stringify(next),
    debounceMs,
    gcTime,
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
    subscribe: (params: Params) => store.dispatch(actions.subscribed(params)),
    unsubscribe: (params: Params) => store.dispatch(actions.unsubscribed(params)),
    request: (params: Params, force?: boolean) =>
      store.dispatch(actions.requested(params, { force })),
    read: (params: Params) => {
      const root = store.getState();
      return {
        ...selectors.selectState(root, params),
        isLoading: selectors.selectIsLoading(root, params),
        isValidating: selectors.selectIsValidating(root, params),
      };
    },
    keys: () => Object.keys(store.getState().items.entries),
  };
}

/** Даёт отработать промисам фетчера и продолжению саги. */
const flush = () => vi.advanceTimersByTimeAsync(0);
/** Сдвиг времени с продолжением саг: delay в redux-saga — промис, сага продолжается в микрозадаче. */
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

const A: Params = { q: 'a' };
const B: Params = { q: 'b' };
const C: Params = { q: 'c' };

const V1: Item[] = [{ id: 'a', value: 1 }];
const V2: Item[] = [{ id: 'a', value: 2 }];
const VB: Item[] = [{ id: 'b', value: 1 }];

describe('serializeParams', () => {
  it('порядок ключей и поля undefined не влияют на ключ; разные значения — разные ключи', () => {
    expect(serializeParams({ q: 'x', sort: 'name', dir: 'asc' })).toBe(
      serializeParams({ dir: 'asc', sort: 'name', q: 'x' }),
    );
    expect(serializeParams({ q: 'x', page: undefined })).toBe(serializeParams({ q: 'x' }));
    expect(serializeParams({ a: { d: 1, c: 2 } })).toBe(serializeParams({ a: { c: 2, d: 1 } }));
    expect(serializeParams({ q: 'x' })).not.toBe(serializeParams({ q: 'y' }));
    expect(serializeParams(undefined)).toBe('');
  });
});

describe('createQuery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. подписка на ключ A — один вызов фетчера с параметрами A', async () => {
    const q = setup();

    q.subscribe(A);
    expect(q.fetcher).toHaveBeenCalledTimes(1);
    expect(q.fetcher).toHaveBeenCalledWith(A, expect.any(AbortSignal));
    expect(q.read(A)).toMatchObject({ status: 'loading', isLoading: true, isValidating: false });

    q.requests[0]!.resolve(V1);
    await flush();

    expect(q.fetcher).toHaveBeenCalledTimes(1);
    expect(q.read(A)).toMatchObject({
      status: 'success',
      data: V1,
      fetchedAt: Date.now(),
      isLoading: false,
      isPlaceholder: false,
    });
  });

  it('2. две подписки на один ключ в одном тике — один вызов', async () => {
    const q = setup();

    q.subscribe(A);
    q.subscribe({ ...A });
    q.requests[0]!.resolve(V1);
    await flush();

    expect(q.fetcher).toHaveBeenCalledTimes(1);
    expect(q.read(A).status).toBe('success');
  });

  it('3. подписки на A и B одновременно — два вызова, два независимых состояния', async () => {
    const q = setup();

    q.subscribe(A);
    q.subscribe(B);
    expect(q.fetcher).toHaveBeenCalledTimes(2);
    expect(q.requests.map((request) => request.params)).toEqual([A, B]);

    q.requests[1]!.resolve(VB);
    await flush();
    expect(q.read(B)).toMatchObject({ status: 'success', data: VB });
    expect(q.read(A)).toMatchObject({ status: 'loading' });

    q.requests[0]!.resolve(V1);
    await flush();
    expect(q.read(A)).toMatchObject({ status: 'success', data: V1, isPlaceholder: false });
    expect(q.read(B)).toMatchObject({ status: 'success', data: VB, isPlaceholder: false });
  });

  it('4. повторная подписка на A внутри staleTime — вызова нет', async () => {
    const q = setup();

    q.subscribe(A);
    q.requests[0]!.resolve(V1);
    await flush();
    q.unsubscribe(A);

    vi.advanceTimersByTime(DEFAULT_STALE_TIME - 1);
    q.subscribe(A);

    expect(q.fetcher).toHaveBeenCalledTimes(1);
    expect(q.read(A)).toMatchObject({ status: 'success', isValidating: false });
  });

  it('5. подписка на A после staleTime — вызов, старые данные доступны всё время запроса', async () => {
    const q = setup();

    q.subscribe(A);
    q.requests[0]!.resolve(V1);
    await flush();
    const staleData = q.read(A).data;
    q.unsubscribe(A);

    vi.advanceTimersByTime(DEFAULT_STALE_TIME);
    q.subscribe(A);
    expect(q.fetcher).toHaveBeenCalledTimes(2);

    const expectRevalidating = () => {
      const state = q.read(A);
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
    expect(q.read(A)).toMatchObject({ status: 'success', data: V2, isValidating: false });
  });

  it('6. отписка последнего подписчика A во время запроса — abort, без состояния ошибки', async () => {
    const q = setup();

    q.subscribe(A);
    const { signal } = q.requests[0]!;
    expect(signal.aborted).toBe(false);

    q.unsubscribe(A);
    expect(signal.aborted).toBe(true);
    await flush();

    expect(q.read(A)).toMatchObject({
      status: 'idle',
      error: undefined,
      isLoading: false,
      isValidating: false,
    });
    expect(q.dispatchedTypes).toContain('items/fetchCancelled');
    expect(q.dispatchedTypes).not.toContain('items/fetchFailed');
  });

  it('7. отписка одного из двух подписчиков A — запрос не отменён', async () => {
    const q = setup();

    q.subscribe(A);
    q.subscribe(A);
    q.unsubscribe(A);

    expect(q.requests[0]!.signal.aborted).toBe(false);
    q.requests[0]!.resolve(V1);
    await flush();
    expect(q.read(A)).toMatchObject({ status: 'success', data: V1 });
  });

  it('8. отписка от A не отменяет идущий запрос по B', async () => {
    const q = setup();

    q.subscribe(A);
    q.subscribe(B);
    q.unsubscribe(A);

    // A остался без подписчиков — его запрос отменён; у B подписчик есть.
    expect(q.requests[0]!.signal.aborted).toBe(true);
    expect(q.requests[1]!.signal.aborted).toBe(false);

    q.requests[1]!.resolve(VB);
    await flush();
    expect(q.read(B)).toMatchObject({ status: 'success', data: VB });
    expect(q.read(A)).toMatchObject({ status: 'idle', error: undefined });
  });

  it('9. равный ответ — ссылка на data не изменилась', async () => {
    const q = setup();

    q.subscribe(A);
    q.requests[0]!.resolve(V1);
    await flush();
    const before = q.read(A);

    vi.advanceTimersByTime(DEFAULT_STALE_TIME);
    q.request(A, true);
    q.requests[1]!.resolve(structuredClone(V1));
    await flush();

    const after = q.read(A);
    expect(after.data).toBe(before.data);
    expect(after.fetchedAt).toBe(Date.now());
    expect(after.fetchedAt).toBeGreaterThan(before.fetchedAt!);
    expect(after.status).toBe('success');

    // Контроль: при реальном изменении ссылка заменяется.
    q.request(A, true);
    q.requests[2]!.resolve(V2);
    await flush();
    expect(q.read(A).data).not.toBe(before.data);
    expect(q.read(A).data).toEqual(V2);
  });

  it("10. reject — status 'error', предыдущие data сохранены", async () => {
    const q = setup();

    q.subscribe(A);
    q.requests[0]!.resolve(V1);
    await flush();
    const { data: previousData, fetchedAt: previousFetchedAt } = q.read(A);

    q.request(A, true);
    q.requests[1]!.reject(new Error('Network down'));
    await flush();

    const state = q.read(A);
    expect(state.status).toBe('error');
    expect(state.error).toMatchObject({ name: 'Error', message: 'Network down' });
    expect(state.data).toBe(previousData);
    expect(state.fetchedAt).toBe(previousFetchedAt);
    expect(state).toMatchObject({ isLoading: false, isValidating: false });
  });

  it('11. debounce: смена ключа трижды в пределах окна — один вызов, с параметрами последнего', async () => {
    const q = setup({ debounceMs: 250 });

    // Так хук переподписывается при смене параметров: отписка от старого ключа, подписка на новый.
    q.subscribe(A);
    await tick(100);
    q.unsubscribe(A);
    q.subscribe(B);
    await tick(100);
    q.unsubscribe(B);
    q.subscribe(C);

    await tick(249);
    expect(q.fetcher).not.toHaveBeenCalled();

    await tick(1);
    expect(q.fetcher).toHaveBeenCalledTimes(1);
    expect(q.fetcher).toHaveBeenCalledWith(C, expect.any(AbortSignal));
  });

  it('debounce: две живые подписки на разные ключи в одном окне — оба запроса', async () => {
    const q = setup({ debounceMs: 250 });

    q.subscribe(A);
    q.subscribe(B);
    await tick(250);

    expect(q.fetcher).toHaveBeenCalledTimes(2);
    expect(q.requests.map((request) => request.params)).toEqual([A, B]);
  });

  it('12. debounce: подписчик ушёл до истечения окна — фетчера нет', async () => {
    const q = setup({ debounceMs: 250 });

    q.subscribe(A);
    await tick(100);
    q.unsubscribe(A);
    await tick(1000);

    expect(q.fetcher).not.toHaveBeenCalled();
    expect(q.read(A)).toMatchObject({ status: 'idle', data: undefined });
  });

  it('13. requested({ force }) не дебаунсится', async () => {
    const q = setup({ debounceMs: 250 });

    q.subscribe(A);
    q.request(A, true);
    expect(q.fetcher).toHaveBeenCalledTimes(1);

    // Окно истекло, но запрос по ключу уже идёт — второго нет.
    await tick(250);
    expect(q.fetcher).toHaveBeenCalledTimes(1);
  });

  it('14. keepPreviousData: данные прежнего ключа с isPlaceholder, после ответа — свои', async () => {
    const q = setup();

    q.subscribe(A);
    q.requests[0]!.resolve(V1);
    await flush();
    const previousData = q.read(A).data;

    q.unsubscribe(A);
    q.subscribe(B);
    expect(q.read(B)).toMatchObject({
      status: 'loading',
      isPlaceholder: true,
      isLoading: false,
      isValidating: true,
      fetchedAt: undefined,
    });
    expect(q.read(B).data).toBe(previousData);
    // Селектор стабилен: тот же стор — тот же объект.
    expect(q.read(B).data).toBe(q.read(B).data);

    q.requests[1]!.resolve(VB);
    await flush();
    expect(q.read(B)).toMatchObject({ status: 'success', data: VB, isPlaceholder: false });
    expect(q.read(A)).toMatchObject({ data: V1, isPlaceholder: false });
  });

  it('15. gcTime: запись без подписчиков удалена после истечения; новая подписка отменяет удаление', async () => {
    const q = setup({ gcTime: 1000 });

    q.subscribe(A);
    q.requests[0]!.resolve(V1);
    await flush();
    q.unsubscribe(A);

    await tick(999);
    expect(q.keys()).toContain(serializeParams(A));
    await tick(1);
    expect(q.keys()).not.toContain(serializeParams(A));
    expect(q.read(A)).toMatchObject({ status: 'idle', data: undefined, isPlaceholder: false });

    // Новая подписка до истечения — запись живёт, пока есть подписчик.
    q.subscribe(B);
    q.requests[1]!.resolve(VB);
    await flush();
    q.unsubscribe(B);
    await tick(500);
    q.subscribe(B);
    await tick(2000);
    expect(q.read(B)).toMatchObject({ status: 'success', data: VB });

    // Ушёл один из двух подписчиков — отсчёт не начинается.
    q.subscribe(B);
    q.unsubscribe(B);
    await tick(2000);
    expect(q.keys()).toContain(serializeParams(B));
  });

  it('gcTime: запрос без подписчиков — запись удаляется через gcTime после ответа, а не во время запроса', async () => {
    const q = setup({ gcTime: 1000 });

    q.request(A);
    await tick(1500);
    q.requests[0]!.resolve(V1);
    await flush();
    expect(q.read(A)).toMatchObject({ status: 'success', data: V1 });

    await tick(999);
    expect(q.keys()).toContain(serializeParams(A));
    await tick(1);
    expect(q.keys()).not.toContain(serializeParams(A));
  });

  it('16. StrictMode-последовательность (подписка, отписка, подписка) по одному ключу: первый запрос отменён, второй завершается', async () => {
    const q = setup();

    q.subscribe(A);
    q.unsubscribe(A);
    q.subscribe(A);

    expect(q.fetcher).toHaveBeenCalledTimes(2);
    expect(q.requests[0]!.signal.aborted).toBe(true);
    expect(q.requests[1]!.signal.aborted).toBe(false);

    q.requests[1]!.resolve(V1);
    await flush();
    expect(q.read(A)).toMatchObject({ status: 'success', data: V1, error: undefined });
  });

  it('AbortError без отмены задачи — не ошибка, статус восстановлен; сетевая ошибка — ошибка', async () => {
    const q = setup();

    q.subscribe(A);
    q.requests[0]!.resolve(V1);
    await flush();

    // Сигнал оборван извне: задачу никто не отменял, reject приходит в catch.
    q.request(A, true);
    q.requests[1]!.reject(new DOMException('The operation was aborted.', 'AbortError'));
    await flush();

    expect(q.read(A)).toMatchObject({
      status: 'success',
      data: V1,
      error: undefined,
      isValidating: false,
    });
    expect(q.dispatchedTypes).not.toContain('items/fetchFailed');

    // Задача завершилась: следующий запрос стартует.
    q.request(A, true);
    expect(q.fetcher).toHaveBeenCalledTimes(3);

    // Обрыв соединения fetch отдаёт как TypeError — это ошибка.
    q.requests[2]!.reject(new TypeError('Failed to fetch'));
    await flush();
    expect(q.read(A)).toMatchObject({
      status: 'error',
      data: V1,
      error: { name: 'TypeError', message: 'Failed to fetch' },
    });
  });

  it('requested({ force }) обходит staleTime, но не запускает второй запрос по ключу параллельно', async () => {
    const q = setup();

    q.subscribe(A);
    q.requests[0]!.resolve(V1);
    await flush();

    q.request(A);
    expect(q.fetcher).toHaveBeenCalledTimes(1);

    q.request(A, true);
    q.request(A, true);
    q.subscribe(A);
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

    q.subscribe(A);
    q.requests[0]!.resolve(V1);
    await flush();

    q.request(A, true);
    q.requests[1]!.resolve({ not: 'an array' });
    await flush();

    expect(q.read(A)).toMatchObject({
      status: 'error',
      data: V1,
      error: { name: 'TypeError', message: 'Expected an array' },
    });
  });
});
