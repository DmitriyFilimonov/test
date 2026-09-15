import {
  createAction,
  miniSerializeError,
  type SerializedError,
  type UnknownAction,
} from '@reduxjs/toolkit';
import type { Task } from 'redux-saga';
import { call, cancel, cancelled, fork, put, select, take } from 'typed-redux-saga';

export const DEFAULT_STALE_TIME = 5000;

export type QueryStatus = 'idle' | 'loading' | 'success' | 'error';

export interface QueryState<TData> {
  data: TData | undefined;
  error: SerializedError | undefined;
  fetchedAt: number | undefined;
  status: QueryStatus;
}

export interface CreateQueryOptions<TName extends string, TData> {
  /** Ключ стейта в корневом редьюсере (`reducerPath`) и префикс типов экшенов. */
  name: TName;
  fetcher: (signal: AbortSignal) => Promise<unknown>;
  /** Парсинг и валидация сырого ответа. Вызывается через `call`, ошибка даёт status 'error'. */
  parse: (raw: unknown) => TData;
  /** true — новые данные не отличаются от текущих: ссылка на `data` сохраняется. */
  isEqual: (current: TData, next: TData) => boolean;
  /** Сколько миллисекунд данные считаются свежими. По умолчанию 5000. */
  staleTime?: number;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

export function createQuery<TName extends string, TData>({
  name,
  fetcher,
  parse,
  isEqual,
  staleTime = DEFAULT_STALE_TIME,
}: CreateQueryOptions<TName, TData>) {
  // Публичные: объявляют намерение, решение о запросе принимает сага.
  const subscribed = createAction(`${name}/subscribed`);
  const unsubscribed = createAction(`${name}/unsubscribed`);
  const requested = createAction<{ force?: boolean } | undefined>(`${name}/requested`);

  // Внутренние: жизненный цикл запроса, диспатчит только воркер.
  const fetchStarted = createAction(`${name}/fetchStarted`);
  const fetchSucceeded = createAction<{ data: TData; fetchedAt: number }>(`${name}/fetchSucceeded`);
  const fetchFailed = createAction<SerializedError>(`${name}/fetchFailed`);
  const fetchCancelled = createAction(`${name}/fetchCancelled`);

  const initialState: QueryState<TData> = {
    data: undefined,
    error: undefined,
    fetchedAt: undefined,
    status: 'idle',
  };

  // Редьюсер без Immer: сохранение ссылки на data видно явно, а не зависит от того,
  // трогал ли драфт вложенные поля.
  function reducer(
    state: QueryState<TData> = initialState,
    action: UnknownAction,
  ): QueryState<TData> {
    if (fetchStarted.match(action)) {
      return { ...state, status: 'loading' };
    }
    if (fetchSucceeded.match(action)) {
      const { data, fetchedAt } = action.payload;
      const unchanged = state.data !== undefined && isEqual(state.data, data);
      return {
        data: unchanged ? state.data : data,
        error: undefined,
        fetchedAt,
        status: 'success',
      };
    }
    if (fetchFailed.match(action)) {
      return { ...state, error: action.payload, status: 'error' };
    }
    if (fetchCancelled.match(action)) {
      // Отмена — не результат: возвращаем статус, который был до запуска запроса.
      const status: QueryStatus =
        state.error !== undefined ? 'error' : state.data !== undefined ? 'success' : 'idle';
      return { ...state, status };
    }
    return state;
  }

  type RootState = { [K in TName]: QueryState<TData> };

  const selectState = (root: RootState): QueryState<TData> => root[name];

  const selectors = {
    selectState,
    selectData: (root: RootState) => selectState(root).data,
    selectError: (root: RootState) => selectState(root).error,
    selectStatus: (root: RootState) => selectState(root).status,
    selectFetchedAt: (root: RootState) => selectState(root).fetchedAt,
    /** Данных нет и идёт запрос. */
    selectIsLoading: (root: RootState) => {
      const state = selectState(root);
      return state.status === 'loading' && state.data === undefined;
    },
    /** Данные есть и идёт фоновый запрос. */
    selectIsValidating: (root: RootState) => {
      const state = selectState(root);
      return state.status === 'loading' && state.data !== undefined;
    },
  };

  function* fetchWorker() {
    const controller = new AbortController();
    try {
      yield* put(fetchStarted());
      const raw = yield* call(fetcher, controller.signal);
      // SagaReturnType<(raw) => TData> для обобщённого TData не раскрывается; parse
      // синхронный, поэтому результат call — это TData.
      const data = (yield* call(parse, raw)) as TData;
      yield* put(fetchSucceeded({ data, fetchedAt: Date.now() }));
    } catch (error) {
      // Отмена задачи сюда не попадает: redux-saga завершает генератор через return(),
      // минуя catch. Но AbortError может прийти и без отмены — сигнал оборвали извне
      // (браузер, обёртка фетчера). Это не ошибка данных: статус восстанавливается как
      // при отмене. Просто выйти нельзя — статус остался бы 'loading'.
      if (isAbortError(error)) {
        yield* put(fetchCancelled());
      } else {
        yield* put(fetchFailed(miniSerializeError(error)));
      }
    } finally {
      if (yield* cancelled()) {
        controller.abort();
        yield* put(fetchCancelled());
      }
    }
  }

  /**
   * Вотчер — единственный владелец счётчика подписчиков и ссылки на задачу.
   * Экшены обрабатываются строго по одному, поэтому решения «форкнуть» и «отменить»
   * принимаются атомарно относительно счётчика.
   */
  function* saga() {
    let subscribers = 0;
    let task: Task | undefined;

    function* isStale() {
      const fetchedAt = yield* select(selectors.selectFetchedAt);
      return fetchedAt === undefined || Date.now() - fetchedAt >= staleTime;
    }

    while (true) {
      const action = yield* take<UnknownAction>([
        subscribed.type,
        unsubscribed.type,
        requested.type,
      ]);
      const isRunning = task?.isRunning() === true;

      if (subscribed.match(action)) {
        subscribers += 1;
        if (!isRunning && (yield* isStale())) {
          task = yield* fork(fetchWorker);
        }
      } else if (unsubscribed.match(action)) {
        subscribers = Math.max(0, subscribers - 1);
        if (subscribers === 0 && task && isRunning) {
          yield* cancel(task);
        }
      } else if (requested.match(action)) {
        if (!isRunning && (action.payload?.force === true || (yield* isStale()))) {
          task = yield* fork(fetchWorker);
        }
      }
    }
  }

  return {
    reducerPath: name,
    reducer,
    saga,
    actions: { subscribed, unsubscribed, requested },
    selectors,
  };
}

export type Query<TName extends string, TData> = ReturnType<typeof createQuery<TName, TData>>;
export type QueryActions = Query<string, unknown>['actions'];
