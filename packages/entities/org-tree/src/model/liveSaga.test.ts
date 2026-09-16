/** @vitest-environment node */
import {
  combineSlices,
  configureStore,
  type Middleware,
  type UnknownAction,
} from '@reduxjs/toolkit';
import { QUERY_FUNCTION_ACTION_PATHS } from '@shared/query';
import createSagaMiddleware from 'redux-saga';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aggregateSubtrees } from './aggregate';
import { orgTreeLive, type OrgTreeLiveEvent, type OrgTreePatch } from './live';
import { DEFAULT_ORG_TREE_PARAMS as P, type OrgTreeParams } from './params';
import { orgTreeQuery } from './query';
import { selectOrgNodes, selectStatus, selectSubtreeAggregates } from './selectors';
import { orgTreeLivePatchSaga, orgTreeSaga, orgTreeSlice, orgTreeUpdatesSlice } from './store';
import { makeOrgNodes } from './testing/fixtures';
import { selectOrgTreeUpdates } from './updates';

// Счётчик полных расчётов итогов: реализация настоящая, вызовы считаются.
vi.mock('./aggregate', { spy: true });
const fullAggregations = () => vi.mocked(aggregateSubtrees).mock.calls.length;

const UPDATED_AT = '2026-09-16T10:00:00.000Z';
const Q: OrgTreeParams = { ...P, q: 'Отдел' };

function setup() {
  const fetchMock = vi.fn(async () => Response.json(makeOrgNodes()));
  vi.stubGlobal('fetch', fetchMock);

  const actions: UnknownAction[] = [];
  const record: Middleware = () => (next) => (action) => {
    actions.push(action as UnknownAction);
    return next(action);
  };
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: combineSlices(orgTreeSlice, orgTreeUpdatesSlice),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: { ignoredActionPaths: QUERY_FUNCTION_ACTION_PATHS },
      }).concat(record, sagaMiddleware),
  });
  sagaMiddleware.run(orgTreeSaga);
  sagaMiddleware.run(orgTreeLivePatchSaga);

  const load = async (params: OrgTreeParams, calls: number) => {
    store.dispatch(orgTreeQuery.actions.subscribed(params));
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(calls);
      expect(selectStatus(store.getState(), params)).toBe('success');
    });
  };
  const receive = (event: OrgTreeLiveEvent) =>
    store.dispatch(orgTreeLive.sagaActions.messageReceived({ event }));
  const patch = (seq: number, change: Partial<OrgTreePatch> = {}) =>
    receive({ type: 'patch', seq, nodes: [], removed: [], added: [], ...change });
  const node = (id: string, params: OrgTreeParams = P) =>
    selectOrgNodes(store.getState(), params).find((candidate) => candidate.id === id);
  const entry = (params: OrgTreeParams) =>
    store.getState().orgTree.entries[orgTreeQuery.getKey(params)]!;
  const forcedRequests = () =>
    actions.filter(orgTreeQuery.actions.requested.match).map((action) => action.payload);

  return { store, fetchMock, load, receive, patch, node, entry, forcedRequests };
}

describe('orgTreeLivePatchSaga: поток изменений → кеш', () => {
  beforeEach(() => {
    vi.mocked(aggregateSubtrees).mockClear();
    // Подменяется только Date: промисы fetch и задержки саг идут по настоящим таймерам.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-16T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Время патча отличается от времени ответа: видно, что fetchedAt обновил именно патч. */
  const later = () => vi.setSystemTime(Date.now() + 1000);

  it('patched меняет data записи текущего ключа, фетчер не вызывается, полного расчёта итогов нет', async () => {
    const t = setup();
    await t.load(P, 1);
    selectSubtreeAggregates(t.store.getState(), P);
    expect(fullAggregations()).toBe(1);

    later();
    t.receive({ type: 'hello', seq: 10 });
    t.patch(11, { nodes: [{ id: 't-1', headcount: 10, updatedAt: UPDATED_AT }] });

    expect(t.node('t-1')).toMatchObject({ headcount: 10, updatedAt: UPDATED_AT });
    expect(t.entry(P).fetchedAt).toBe(Date.now());
    expect(selectSubtreeAggregates(t.store.getState(), P).get('p-1')).toMatchObject({
      headcount: 1 + 10 + 10,
    });
    expect(fullAggregations()).toBe(1);
    expect(selectOrgTreeUpdates(t.store.getState())['t-1']).toEqual({
      ownHeadcount: 11,
      totalHeadcount: 11,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
    expect(t.forcedRequests()).toEqual([]);
  });

  it('patched не трогает записи других ключей, но помечает их протухшими', async () => {
    const t = setup();
    await t.load(Q, 1);
    t.store.dispatch(orgTreeQuery.actions.unsubscribed(Q));
    await t.load(P, 2);
    const other = t.entry(Q);

    later();
    t.receive({ type: 'hello', seq: 0 });
    t.patch(1, { nodes: [{ id: 't-1', headcount: 10, updatedAt: UPDATED_AT }] });

    expect(t.entry(Q).data).toBe(other.data);
    expect(t.entry(Q).fetchedAt).toBeUndefined();
    expect(t.node('t-1', Q)!.headcount).toBe(6);
    expect(t.entry(P).fetchedAt).toBe(Date.now());
    expect(t.node('t-1')!.headcount).toBe(10);
    expect(t.fetchMock).toHaveBeenCalledTimes(2);

    // Возврат к протухшему ключу — перезапрос.
    t.store.dispatch(orgTreeQuery.actions.subscribed(Q));
    expect(t.fetchMock).toHaveBeenCalledTimes(3);
  });

  it('пропуск seq вызывает requested({ force }) текущего ключа; патч с пропуском не применяется', async () => {
    const t = setup();
    await t.load(P, 1);

    t.receive({ type: 'hello', seq: 0 });
    t.patch(1, { nodes: [{ id: 't-1', headcount: 10, updatedAt: UPDATED_AT }] });
    expect(t.forcedRequests()).toEqual([]);

    t.patch(3, { nodes: [{ id: 't-2', headcount: 99, updatedAt: UPDATED_AT }] });
    expect(t.forcedRequests()).toEqual([{ params: P, key: orgTreeQuery.getKey(P), force: true }]);
    expect(t.node('t-2')!.headcount).toBe(10);
    await vi.waitFor(() => expect(t.fetchMock).toHaveBeenCalledTimes(2));

    // Следующий по порядку после пропуска снова применяется без запроса.
    await vi.waitFor(() => expect(selectStatus(t.store.getState(), P)).toBe('success'));
    t.patch(4, { nodes: [{ id: 't-2', headcount: 12, updatedAt: UPDATED_AT }] });
    expect(t.node('t-2')!.headcount).toBe(12);
    expect(t.forcedRequests()).toHaveLength(1);
  });

  it('hello после переподключения: тот же seq — ничего, другой — перезапрос', async () => {
    const t = setup();
    await t.load(P, 1);

    t.receive({ type: 'hello', seq: 5 });
    t.patch(6);
    t.receive({ type: 'hello', seq: 6 });
    expect(t.forcedRequests()).toEqual([]);

    t.receive({ type: 'hello', seq: 9 });
    expect(t.forcedRequests()).toHaveLength(1);
  });

  it('повтор уже учтённого seq игнорируется', async () => {
    const t = setup();
    await t.load(P, 1);

    t.receive({ type: 'hello', seq: 0 });
    t.patch(1, { nodes: [{ id: 't-1', headcount: 10, updatedAt: UPDATED_AT }] });
    const data = t.entry(P).data;
    t.patch(1, { nodes: [{ id: 't-1', headcount: 20, updatedAt: UPDATED_AT }] });

    expect(t.entry(P).data).toBe(data);
    expect(t.forcedRequests()).toEqual([]);
  });
});
