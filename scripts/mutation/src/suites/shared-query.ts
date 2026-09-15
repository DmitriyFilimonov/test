import type { Suite } from '../types.ts';

export const sharedQuerySuite: Suite = {
  name: 'shared-query',
  file: 'packages/shared/query/src/createQuery.ts',
  tests: 'packages/shared/query/src/createQuery.test.ts',
  mutations: [
    {
      name: 'data всегда заменяется (isEqual игнорируется)',
      from: 'data: unchanged ? state.data : data,',
      to: 'data,',
    },
    {
      name: 'нет controller.abort() при отмене',
      from: '        controller.abort();\n',
      to: '',
    },
    {
      name: 'отмена (finally) превращается в ошибку',
      from: 'controller.abort();\n        yield* put(fetchCancelled());',
      to: "controller.abort();\n        yield* put(fetchFailed({ message: 'cancelled' }));",
    },
    {
      name: 'subscribed форкает без проверки идущей задачи',
      from: 'if (!isRunning && (yield* isStale())) {',
      to: 'if (yield* isStale()) {',
    },
    {
      name: 'cancel без учёта счётчика подписчиков',
      from: 'subscribers === 0 && task && isRunning',
      to: 'task && isRunning',
    },
    {
      name: 'staleTime игнорируется',
      from: 'return fetchedAt === undefined || Date.now() - fetchedAt >= staleTime;',
      to: 'return true;',
    },
    {
      name: 'fetchStarted сбрасывает data',
      from: "return { ...state, status: 'loading' };",
      to: "return { ...state, data: undefined, status: 'loading' };",
    },
    {
      name: 'fetchFailed сбрасывает data',
      from: "return { ...state, error: action.payload, status: 'error' };",
      to: "return { ...state, data: undefined, error: action.payload, status: 'error' };",
    },
    {
      name: 'requested({ force }) не проверяет идущую задачу',
      from: 'if (!isRunning && (action.payload?.force === true',
      to: 'if ((action.payload?.force === true',
    },
    {
      name: 'force игнорируется',
      from: 'action.payload?.force === true ||',
      to: 'false ||',
    },
    {
      name: 'внешний AbortError: просто return из catch',
      from: 'if (isAbortError(error)) {\n        yield* put(fetchCancelled());',
      to: 'if (isAbortError(error)) {\n        return;',
    },
    {
      name: 'внешний AbortError не распознаётся',
      from: 'if (isAbortError(error)) {',
      to: 'if (false) {',
    },
  ],
};
