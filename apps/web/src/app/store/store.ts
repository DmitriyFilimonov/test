import { configureStore } from '@reduxjs/toolkit';
import { QUERY_FUNCTION_ACTION_PATHS } from '@shared/query';
import createSagaMiddleware from 'redux-saga';
import { rootReducer } from './rootReducer';
import { rootSaga } from './rootSaga';

export function createAppStore() {
  const sagaMiddleware = createSagaMiddleware();

  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: { ignoredActionPaths: QUERY_FUNCTION_ACTION_PATHS },
      }).concat(sagaMiddleware),
    devTools: import.meta.env.DEV,
  });

  sagaMiddleware.run(rootSaga);

  return store;
}

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = AppStore['dispatch'];

let store: AppStore | undefined;

/**
 * Единственный стор, создаётся при первом обращении, а не при импорте модуля: первая
 * загрузка не делает синхронной работы на уровне модулей. Не useState: стор с сагой один на
 * приложение, а не на экземпляр компонента.
 */
export function getStore(): AppStore {
  store ??= createAppStore();
  return store;
}
