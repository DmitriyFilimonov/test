import type { Suite } from '../types.ts';

const TESTS = 'packages/shared/query/src/createQuery.test.ts';

export const sharedQuerySuite: Suite = {
  name: 'shared-query',
  file: 'packages/shared/query/src/createQuery.ts',
  tests: TESTS,
  mutations: [
    // Требования шага 01 — смысл тот же, фрагменты под многоключевой кеш.
    {
      name: 'data всегда заменяется (isEqual игнорируется)',
      from: 'data: unchanged ? previous : data,',
      to: 'data,',
    },
    {
      name: 'нет controller.abort() при отмене',
      from: '        controller.abort();\n',
      to: '',
    },
    {
      name: 'отмена (finally) превращается в ошибку',
      from: 'controller.abort();\n        yield* put(fetchCancelled({ key }));',
      to: "controller.abort();\n        yield* put(fetchFailed({ key, error: { message: 'cancelled' } }));",
    },
    {
      name: 'subscribed форкает без проверки идущей задачи',
      from: '> 0 && !isRunning(key) && (yield* isStale(key))',
      to: '> 0 && (yield* isStale(key))',
    },
    {
      name: 'cancel без учёта счётчика подписчиков',
      from: '        const count = subscribers.get(key) ?? 0;\n        if (count > 1) {',
      to: '        const count = subscribers.get(key) ?? 0;\n        const running = tasks.get(key);\n        if (running?.isRunning()) {\n          yield* cancel(running);\n        }\n        if (count > 1) {',
    },
    {
      name: 'staleTime игнорируется',
      from: 'return fetchedAt === undefined || Date.now() - fetchedAt >= staleTime;',
      to: 'return true;',
    },
    {
      name: 'fetchStarted сбрасывает data',
      from: "{ ...(state.entries[key] ?? initialEntry), status: 'loading' }",
      to: "{ ...(state.entries[key] ?? initialEntry), data: undefined, status: 'loading' }",
    },
    {
      name: 'fetchFailed сбрасывает data',
      from: "        ...(state.entries[key] ?? initialEntry),\n        error,\n        status: 'error',",
      to: "        ...(state.entries[key] ?? initialEntry),\n        data: undefined,\n        error,\n        status: 'error',",
    },
    {
      name: 'requested({ force }) не проверяет идущую задачу',
      from: 'if (!isRunning(key) && (force ||',
      to: 'if ((force ||',
    },
    {
      name: 'force игнорируется',
      from: '(force || (yield* isStale(key)))',
      to: '(false || (yield* isStale(key)))',
    },
    {
      name: 'внешний AbortError: просто return из catch',
      from: 'if (isAbortError(error)) {\n        yield* put(fetchCancelled({ key }));',
      to: 'if (isAbortError(error)) {\n        return;',
    },
    {
      name: 'внешний AbortError не распознаётся',
      from: 'if (isAbortError(error)) {',
      to: 'if (false) {',
    },

    // Многоключевой кеш.
    {
      name: 'счётчик подписчиков общий на все ключи',
      from: '    const subscribers = new Map<string, number>();',
      to: "    const subscribers = new (class extends Map<string, number> {\n      override get(_key: string) {\n        return super.get('');\n      }\n      override set(_key: string, value: number) {\n        return super.set('', value);\n      }\n      override has(_key: string) {\n        return super.has('');\n      }\n      override delete(_key: string) {\n        return super.delete('');\n      }\n    })();",
    },
    {
      name: 'cancel отменяет задачи всех ключей',
      from: '          const task = tasks.get(key);\n          if (task?.isRunning()) {\n            yield* cancel(task);\n          }',
      to: '          for (const task of tasks.values()) {\n            if (task.isRunning()) {\n              yield* cancel(task);\n            }\n          }',
    },
    {
      name: 'запрос по одному ключу блокирует запросы по другим',
      from: 'const isRunning = (key: string) => tasks.get(key)?.isRunning() === true;',
      to: 'const isRunning = (_key: string) => [...tasks.values()].some((task) => task.isRunning());',
    },
    {
      name: 'запись ключа перетирает записи других ключей',
      from: 'entries: { ...state.entries, [key]: entry }',
      to: 'entries: { [key]: entry }',
    },

    // Debounce.
    {
      name: 'debounce не отменяет отложенный запуск при уходе подписчика',
      from: 'if ((subscribers.get(key) ?? 0) > 0 && !isRunning(key)',
      to: 'if (!isRunning(key)',
    },
    {
      name: 'debounceMs игнорируется: запуск сразу по подписке',
      from: '        if (debounceMs > 0) {\n          pending.set(key, params);\n        } else {\n          yield* startForSubscribers(params, key);\n        }',
      to: '        yield* startForSubscribers(params, key);',
    },
    {
      name: 'requested тоже дебаунсится',
      from: '        if (!isRunning(key) && (force || (yield* isStale(key)))) {\n          const task = yield* start(params, key);',
      to: '        if (debounceMs > 0) {\n          pending.set(key, params);\n        } else if (!isRunning(key) && (force || (yield* isStale(key)))) {\n          const task = yield* start(params, key);',
    },
    {
      name: 'конец окна запускает только ключ последнего экшена (буквальный debounce)',
      from: '    function* flushPending() {\n      const batch = [...pending];\n      pending.clear();\n      for (const [key, params] of batch) {\n        yield* startForSubscribers(params, key);\n      }\n    }',
      to: '    function* flushPending(action: ReturnType<typeof subscribed>) {\n      pending.clear();\n      yield* startForSubscribers(action.payload.params, action.payload.key);\n    }',
    },

    // keepPreviousData.
    {
      name: 'keepPreviousData отдаёт данные без флага isPlaceholder',
      from: 'result = { ...entry, data: previous.data, isPlaceholder: true };',
      to: 'result = { ...entry, data: previous.data, isPlaceholder: false };',
    },
    {
      name: 'keepPreviousData отключён',
      from: '        return toPlaceholder(entry, previous);',
      to: '        return toResult(entry);',
    },
    {
      name: 'lastKey обновляется при старте запроса, а не при успехе',
      from: "{ ...(state.entries[key] ?? initialEntry), status: 'loading' });",
      to: "{ ...(state.entries[key] ?? initialEntry), status: 'loading' }, key);",
    },

    // Вытеснение.
    {
      name: 'gcTime удаляет запись с живыми подписчиками: новая подписка не отменяет удаление',
      from: '        if (gcTask) {\n          yield* cancel(gcTask);\n          gcTasks.delete(key);\n        }\n',
      to: '',
    },
    {
      name: 'gcTime удаляет запись с живыми подписчиками: отсчёт при уходе не последнего',
      from: '          subscribers.set(key, count - 1);\n        } else if (count === 1) {',
      to: '          subscribers.set(key, count - 1);\n          yield* scheduleRemoval(key);\n        } else if (count === 1) {',
    },
    {
      name: 'gcTime не ждёт идущий запрос',
      from: '    if (pending) {\n      yield* join(pending);\n    }\n',
      to: '',
    },
    {
      name: 'запись после запроса без подписчиков не вытесняется',
      from: '          if (!subscribers.has(key)) {\n            yield* scheduleRemoval(key, task);\n          }',
      to: '          void task;',
    },
  ],
};

export const sharedQueryKeySuite: Suite = {
  name: 'shared-query-key',
  file: 'packages/shared/query/src/serializeParams.ts',
  tests: TESTS,
  mutations: [
    {
      name: 'порядок ключей параметров не фиксирован',
      from: 'Object.fromEntries(Object.entries(value).sort(compareKeys))',
      to: 'Object.fromEntries(Object.entries(value))',
    },
  ],
};

export const sharedQuerySubscriptionSuite: Suite = {
  name: 'shared-query-subscription',
  file: 'packages/shared/query/src/useQuerySubscription.ts',
  tests: 'packages/shared/query/src/useQuerySubscription.dom.test.tsx',
  mutations: [
    {
      name: 'размонтирование не отписывает',
      from: '      dispatch(unsubscribed(subscription.params));\n',
      to: '',
    },
    {
      name: 'при смене ключа запоминаются прежние параметры (подписка на старый ключ)',
      from: '    setSubscription({ key, params });',
      to: '    setSubscription({ key, params: subscription.params });',
    },
    {
      name: 'переподписка на каждый новый объект параметров',
      from: '}, [dispatch, subscribed, unsubscribed, subscription]);',
      to: '}, [dispatch, subscribed, unsubscribed, subscription, params]);',
    },
    {
      name: 'смена ключа не переподписывает',
      from: 'if (subscription.key !== key) {',
      to: 'if (false) {',
    },
  ],
};
