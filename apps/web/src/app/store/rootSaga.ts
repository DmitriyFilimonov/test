import { orgTreeLivePatchSaga, orgTreeLiveSaga, orgTreeSaga } from '@entities/org-tree';
import { all, fork } from 'typed-redux-saga';
import { supervise, type PackageSaga } from './supervise';

/**
 * Статический реестр корневых саг пакетов. Каждая запускается под `supervise`:
 * падение одной не останавливает остальные.
 */
const packageSagas: PackageSaga[] = [orgTreeSaga, orgTreeLiveSaga, orgTreeLivePatchSaga];

export function* rootSaga() {
  yield* all(packageSagas.map((saga) => fork(supervise, saga)));
}
