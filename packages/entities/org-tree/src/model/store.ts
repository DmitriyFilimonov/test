import { orgTreeQuery } from './query';

/** Для `combineSlices` в @app/web. */
export const orgTreeSlice = {
  reducerPath: orgTreeQuery.reducerPath,
  reducer: orgTreeQuery.reducer,
};

/** Для реестра саг в @app/web. */
export const orgTreeSaga = orgTreeQuery.saga;
