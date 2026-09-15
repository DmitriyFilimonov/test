import {
  createAction,
  miniSerializeError,
  type SerializedError,
  type UnknownAction,
} from '@reduxjs/toolkit';
import type { Task } from 'redux-saga';
import {
  call,
  cancel,
  cancelled,
  debounce,
  delay,
  fork,
  join,
  put,
  select,
  take,
} from 'typed-redux-saga';
import { serializeParams } from './serializeParams';

export const DEFAULT_STALE_TIME = 5000;
export const DEFAULT_GC_TIME = 5 * 60 * 1000;

export type QueryStatus = 'idle' | 'loading' | 'success' | 'error';

/** Запись кеша одного ключа. */
export interface QueryState<TData> {
  data: TData | undefined;
  error: SerializedError | undefined;
  fetchedAt: number | undefined;
  status: QueryStatus;
}

export interface QueryCacheState<TData> {
  /** Записи по ключу `getKey(params)`. */
  entries: Record<string, QueryState<TData>>;
  /** Ключ последнего успешного ответа: откуда брать данные-заглушку для нового ключа. */
  lastKey: string | undefined;
}

/** Состояние ключа, как его видят компоненты. */
export interface QueryResult<TData> extends QueryState<TData> {
  /**
   * true — по этому ключу данных ещё нет, а `data` взяты из записи последнего успешного
   * ключа (keepPreviousData). `status`, `error` и `fetchedAt` — всегда собственные.
   */
  isPlaceholder: boolean;
}

export interface CreateQueryOptions<TName extends string, TParams, TData> {
  /** Ключ стейта в корневом редьюсере (`reducerPath`) и префикс типов экшенов. */
  name: TName;
  fetcher: (params: TParams, signal: AbortSignal) => Promise<unknown>;
  /** Парсинг и валидация сырого ответа. Вызывается через `call`, ошибка даёт status 'error'. */
  parse: (raw: unknown) => TData;
  /** true — новые данные не отличаются от текущих данных того же ключа: ссылка сохраняется. */
  isEqual: (current: TData, next: TData) => boolean;
  /** Стабильная сериализация параметров в ключ кеша. По умолчанию `serializeParams`. */
  getKey?: (params: TParams) => string;
  /** Сколько миллисекунд данные считаются свежими. По умолчанию 5000. */
  staleTime?: number;
  /**
   * Окно debounce для запуска запросов по подпискам, мс. 0 (по умолчанию) — без дебаунса.
   * На `requested` не действует.
   */
  debounceMs?: number;
  /** Сколько миллисекунд живёт запись без подписчиков. По умолчанию 5 минут. */
  gcTime?: number;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

export function createQuery<TName extends string, TParams, TData>({
  name,
  fetcher,
  parse,
  isEqual,
  getKey = serializeParams,
  staleTime = DEFAULT_STALE_TIME,
  debounceMs = 0,
  gcTime = DEFAULT_GC_TIME,
}: CreateQueryOptions<TName, TParams, TData>) {
  const withKey = (params: TParams) => ({ payload: { params, key: getKey(params) } });

  // Публичные: объявляют намерение, решение о запросе принимает сага.
  const subscribed = createAction(`${name}/subscribed`, withKey);
  const unsubscribed = createAction(`${name}/unsubscribed`, withKey);
  const requested = createAction(
    `${name}/requested`,
    (params: TParams, options?: { force?: boolean }) => ({
      payload: { params, key: getKey(params), force: options?.force === true },
    }),
  );

  // Внутренние: жизненный цикл запроса и записи, диспатчат только воркеры.
  const fetchStarted = createAction<{ key: string }>(`${name}/fetchStarted`);
  const fetchSucceeded = createAction<{ key: string; data: TData; fetchedAt: number }>(
    `${name}/fetchSucceeded`,
  );
  const fetchFailed = createAction<{ key: string; error: SerializedError }>(`${name}/fetchFailed`);
  const fetchCancelled = createAction<{ key: string }>(`${name}/fetchCancelled`);
  const entryRemoved = createAction<{ key: string }>(`${name}/entryRemoved`);

  const initialEntry: QueryState<TData> = {
    data: undefined,
    error: undefined,
    fetchedAt: undefined,
    status: 'idle',
  };
  const initialState: QueryCacheState<TData> = { entries: {}, lastKey: undefined };

  const setEntry = (
    state: QueryCacheState<TData>,
    key: string,
    entry: QueryState<TData>,
    lastKey = state.lastKey,
  ): QueryCacheState<TData> => ({ entries: { ...state.entries, [key]: entry }, lastKey });

  // Редьюсер без Immer: сохранение ссылки на data видно явно, а не зависит от того,
  // трогал ли драфт вложенные поля. Каждый экшен меняет только запись своего ключа.
  function reducer(
    state: QueryCacheState<TData> = initialState,
    action: UnknownAction,
  ): QueryCacheState<TData> {
    if (fetchStarted.match(action)) {
      const { key } = action.payload;
      return setEntry(state, key, { ...(state.entries[key] ?? initialEntry), status: 'loading' });
    }
    if (fetchSucceeded.match(action)) {
      const { key, data, fetchedAt } = action.payload;
      const previous = state.entries[key]?.data;
      const unchanged = previous !== undefined && isEqual(previous, data);
      return setEntry(
        state,
        key,
        {
          data: unchanged ? previous : data,
          error: undefined,
          fetchedAt,
          status: 'success',
        },
        key,
      );
    }
    if (fetchFailed.match(action)) {
      const { key, error } = action.payload;
      return setEntry(state, key, {
        ...(state.entries[key] ?? initialEntry),
        error,
        status: 'error',
      });
    }
    if (fetchCancelled.match(action)) {
      const { key } = action.payload;
      const entry = state.entries[key];
      if (!entry) {
        return state;
      }
      // Отмена — не результат: возвращаем статус, который был до запуска запроса.
      const status: QueryStatus =
        entry.error !== undefined ? 'error' : entry.data !== undefined ? 'success' : 'idle';
      return setEntry(state, key, { ...entry, status });
    }
    if (entryRemoved.match(action)) {
      const { key } = action.payload;
      if (!Object.hasOwn(state.entries, key)) {
        return state;
      }
      const entries = { ...state.entries };
      delete entries[key];
      return { entries, lastKey: state.lastKey === key ? undefined : state.lastKey };
    }
    return state;
  }

  type RootState = { [K in TName]: QueryCacheState<TData> };

  const selectCache = (root: RootState): QueryCacheState<TData> => root[name];

  // Результат для компонентов — новый объект поверх записи. Кешируется по ссылкам на
  // записи, чтобы useSelector не видел новое значение на каждое обновление стора.
  const results = new WeakMap<QueryState<TData>, QueryResult<TData>>();
  const placeholders = new WeakMap<
    QueryState<TData>,
    WeakMap<QueryState<TData>, QueryResult<TData>>
  >();

  function toResult(entry: QueryState<TData>): QueryResult<TData> {
    let result = results.get(entry);
    if (!result) {
      result = { ...entry, isPlaceholder: false };
      results.set(entry, result);
    }
    return result;
  }

  function toPlaceholder(
    entry: QueryState<TData>,
    previous: QueryState<TData>,
  ): QueryResult<TData> {
    let byPrevious = placeholders.get(entry);
    if (!byPrevious) {
      byPrevious = new WeakMap();
      placeholders.set(entry, byPrevious);
    }
    let result = byPrevious.get(previous);
    if (!result) {
      result = { ...entry, data: previous.data, isPlaceholder: true };
      byPrevious.set(previous, result);
    }
    return result;
  }

  /**
   * Состояние ключа. Данных по ключу ещё нет, а по последнему успешному ключу этого же
   * запроса есть — отдаются они, с `isPlaceholder: true`: при смене параметров экран не
   * мигает пустотой.
   */
  function selectState(root: RootState, params: TParams): QueryResult<TData> {
    const cache = selectCache(root);
    const key = getKey(params);
    const entry = cache.entries[key] ?? initialEntry;
    if (entry.data === undefined && cache.lastKey !== undefined && cache.lastKey !== key) {
      const previous = cache.entries[cache.lastKey];
      if (previous?.data !== undefined) {
        return toPlaceholder(entry, previous);
      }
    }
    return toResult(entry);
  }

  const selectors = {
    selectState,
    selectData: (root: RootState, params: TParams) => selectState(root, params).data,
    selectError: (root: RootState, params: TParams) => selectState(root, params).error,
    selectStatus: (root: RootState, params: TParams) => selectState(root, params).status,
    selectFetchedAt: (root: RootState, params: TParams) => selectState(root, params).fetchedAt,
    selectIsPlaceholder: (root: RootState, params: TParams) =>
      selectState(root, params).isPlaceholder,
    /** Показать нечего (нет ни своих данных, ни заглушки) и идёт запрос. */
    selectIsLoading: (root: RootState, params: TParams) => {
      const state = selectState(root, params);
      return state.status === 'loading' && state.data === undefined;
    },
    /** Есть что показать (свои данные или заглушка) и идёт запрос. */
    selectIsValidating: (root: RootState, params: TParams) => {
      const state = selectState(root, params);
      return state.status === 'loading' && state.data !== undefined;
    },
  };

  function* fetchWorker(params: TParams, key: string) {
    const controller = new AbortController();
    try {
      yield* put(fetchStarted({ key }));
      const raw = yield* call(fetcher, params, controller.signal);
      // SagaReturnType<(raw) => TData> для обобщённого TData не раскрывается; parse
      // синхронный, поэтому результат call — это TData.
      const data = (yield* call(parse, raw)) as TData;
      yield* put(fetchSucceeded({ key, data, fetchedAt: Date.now() }));
    } catch (error) {
      // Отмена задачи сюда не попадает: redux-saga завершает генератор через return(),
      // минуя catch. Но AbortError может прийти и без отмены — сигнал оборвали извне
      // (браузер, обёртка фетчера). Это не ошибка данных: статус восстанавливается как
      // при отмене. Просто выйти нельзя — статус остался бы 'loading'.
      if (isAbortError(error)) {
        yield* put(fetchCancelled({ key }));
      } else {
        yield* put(fetchFailed({ key, error: miniSerializeError(error) }));
      }
    } finally {
      if (yield* cancelled()) {
        controller.abort();
        yield* put(fetchCancelled({ key }));
      }
    }
  }

  /**
   * Вытеснение записи без подписчиков. Если по ключу идёт запрос (requested без подписок),
   * отсчёт начинается после его завершения: иначе ответ записал бы запись обратно, и её
   * уже никто бы не удалил.
   */
  function* gcWorker(key: string, pending: Task | undefined) {
    if (pending) {
      yield* join(pending);
    }
    yield* delay(gcTime);
    yield* put(entryRemoved({ key }));
  }

  /**
   * Вотчер — единственный владелец счётчиков подписчиков и задач по ключам. Экшены
   * обрабатываются строго по одному, поэтому решения «форкнуть» и «отменить» принимаются
   * атомарно относительно счётчиков.
   */
  function* saga() {
    const subscribers = new Map<string, number>();
    const tasks = new Map<string, Task>();
    const gcTasks = new Map<string, Task>();
    /** Ключи, подписанные за текущее окно debounce, и их параметры. */
    const pending = new Map<string, TParams>();

    const isRunning = (key: string) => tasks.get(key)?.isRunning() === true;

    function* isStale(key: string) {
      const fetchedAt = yield* select(
        (root: RootState) => selectCache(root).entries[key]?.fetchedAt,
      );
      return fetchedAt === undefined || Date.now() - fetchedAt >= staleTime;
    }

    function* start(params: TParams, key: string) {
      const task = yield* fork(fetchWorker, params, key);
      tasks.set(key, task);
      return task;
    }

    /** Запуск по подписке: подписчики есть, запроса по ключу нет, данные протухли. */
    function* startForSubscribers(params: TParams, key: string) {
      if ((subscribers.get(key) ?? 0) > 0 && !isRunning(key) && (yield* isStale(key))) {
        yield* start(params, key);
      }
    }

    function* scheduleRemoval(key: string, after?: Task) {
      const previous = gcTasks.get(key);
      if (previous) {
        yield* cancel(previous);
      }
      gcTasks.set(key, yield* fork(gcWorker, key, after));
    }

    /**
     * Конец окна debounce. Воркер debounce получает только последний экшен, но решение
     * принимается по каждому ключу, подписанному за окно: одновременные подписки на разные
     * ключи (дерево и таблица) не теряют запрос. Промежуточные ключи отсеивает проверка
     * подписчиков — при смене параметров подписка на старый ключ уже снята. Чтение Map и
     * fork — синхронные эффекты, ни один экшен между ними не вклинивается.
     */
    function* flushPending() {
      const batch = [...pending];
      pending.clear();
      for (const [key, params] of batch) {
        yield* startForSubscribers(params, key);
      }
    }

    if (debounceMs > 0) {
      yield* debounce(debounceMs, subscribed.type, flushPending);
    }

    while (true) {
      const action = yield* take<UnknownAction>([
        subscribed.type,
        unsubscribed.type,
        requested.type,
      ]);
      // Завершённые задачи не нужны: решения принимаются только по isRunning().
      for (const map of [tasks, gcTasks]) {
        for (const [key, task] of map) {
          if (!task.isRunning()) {
            map.delete(key);
          }
        }
      }

      if (subscribed.match(action)) {
        const { params, key } = action.payload;
        subscribers.set(key, (subscribers.get(key) ?? 0) + 1);
        const gcTask = gcTasks.get(key);
        if (gcTask) {
          yield* cancel(gcTask);
          gcTasks.delete(key);
        }
        if (debounceMs > 0) {
          pending.set(key, params);
        } else {
          yield* startForSubscribers(params, key);
        }
      } else if (unsubscribed.match(action)) {
        const { key } = action.payload;
        const count = subscribers.get(key) ?? 0;
        if (count > 1) {
          subscribers.set(key, count - 1);
        } else if (count === 1) {
          // Переход в 0: запрос никому не нужен, запись начинает отсчёт до вытеснения.
          subscribers.delete(key);
          const task = tasks.get(key);
          if (task?.isRunning()) {
            yield* cancel(task);
          }
          yield* scheduleRemoval(key);
        }
      } else if (requested.match(action)) {
        const { params, key, force } = action.payload;
        if (!isRunning(key) && (force || (yield* isStale(key)))) {
          const task = yield* start(params, key);
          if (!subscribers.has(key)) {
            yield* scheduleRemoval(key, task);
          }
        }
      }
    }
  }

  return {
    reducerPath: name,
    reducer,
    saga,
    getKey,
    actions: { subscribed, unsubscribed, requested },
    selectors,
  };
}

export type Query<TName extends string, TParams, TData> = ReturnType<
  typeof createQuery<TName, TParams, TData>
>;
