import { orgTreeLive } from './live';
import { orgTreeQuery } from './query';
import { ORG_TREE_UPDATES_PATH, orgTreeUpdatesReducer } from './updates';

export { orgTreeLivePatchSaga } from './liveSaga';

/** Для `combineSlices` в @app/web. */
export const orgTreeSlice = {
  reducerPath: orgTreeQuery.reducerPath,
  reducer: orgTreeQuery.reducer,
};

/** Для реестра саг в @app/web. */
export const orgTreeSaga = orgTreeQuery.saga;

/** Поток изменений: состояние соединения — в стор, сага — в реестр @app/web. */
export const orgTreeLiveSlice = {
  reducerPath: orgTreeLive.reducerPath,
  reducer: orgTreeLive.reducer,
};

export const orgTreeLiveSaga = orgTreeLive.saga;

/** Номера патчей, изменивших значения узлов: по ним подсвечиваются обновлённые ячейки. */
export const orgTreeUpdatesSlice = {
  reducerPath: ORG_TREE_UPDATES_PATH,
  reducer: orgTreeUpdatesReducer,
};
