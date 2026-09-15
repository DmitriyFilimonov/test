/** @vitest-environment node */
import { combineSlices, configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ORG_TREE_PARAMS, type OrgTreeParams } from './params';
import { orgTreeQuery } from './query';
import { selectError, selectOrgNodes, selectStatus } from './selectors';
import type { OrgNode } from './schema';
import { orgTreeSaga, orgTreeSlice } from './store';
import { makeOrgNodes } from './testing/fixtures';

function setup(responses: (() => Response)[], params: OrgTreeParams = DEFAULT_ORG_TREE_PARAMS) {
  const fetchMock = vi.fn(async () => {
    const next = responses.shift();
    if (!next) {
      throw new Error('no more responses');
    }
    return next();
  });
  vi.stubGlobal('fetch', fetchMock);

  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: combineSlices(orgTreeSlice),
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
  });
  sagaMiddleware.run(orgTreeSaga);

  const settle = async (calls: number) => {
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(calls);
      expect(selectStatus(store.getState(), params)).not.toBe('loading');
    });
  };
  return {
    store,
    fetchMock,
    settle,
    status: () => selectStatus(store.getState(), params),
    error: () => selectError(store.getState(), params),
    data: () => selectOrgNodes(store.getState(), params),
    subscribe: () => store.dispatch(orgTreeQuery.actions.subscribed(params)),
    refetch: () => store.dispatch(orgTreeQuery.actions.requested(params, { force: true })),
  };
}

const json =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('orgTreeQuery: fetch + zod + isEqual на реальном сторе', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('запрос с параметрами по умолчанию идёт на /api/org-tree с AbortSignal', async () => {
    const q = setup([json(makeOrgNodes())]);
    q.subscribe();
    await q.settle(1);

    expect(q.fetchMock).toHaveBeenCalledWith('/api/org-tree?q=&sort=name&dir=asc', {
      signal: expect.any(AbortSignal),
    });
    expect(q.status()).toBe('success');
  });

  it('параметры попадают в query-строку, q кодируется', async () => {
    const q = setup([json(makeOrgNodes())], { q: 'отдел & ко', sort: 'totalBudget', dir: 'desc' });
    q.subscribe();
    await q.settle(1);

    const [url] = q.fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      `/api/org-tree?q=${encodeURIComponent('отдел & ко').replaceAll('%20', '+')}&sort=totalBudget&dir=desc`,
    );
    expect(Object.fromEntries(new URL(url, 'http://x').searchParams)).toEqual({
      q: 'отдел & ко',
      sort: 'totalBudget',
      dir: 'desc',
    });
  });

  it('без изменений — ссылка на data та же', async () => {
    const q = setup([json(makeOrgNodes()), json(makeOrgNodes())]);
    q.subscribe();
    await q.settle(1);
    const before = q.data();

    q.refetch();
    await q.settle(2);
    expect(q.data()).toBe(before);
  });

  it('touch?mode=update — данные заменены', async () => {
    const changed = makeOrgNodes();
    changed[4] = { ...changed[4], headcount: 42, updatedAt: '2026-09-15T12:00:00.000Z' };
    const q = setup([json(makeOrgNodes()), json(changed)]);
    q.subscribe();
    await q.settle(1);
    const before = q.data();

    q.refetch();
    await q.settle(2);
    expect(q.data()).not.toBe(before);
    expect(q.data().find((n) => n.id === 'p-3')!.headcount).toBe(42);
  });

  it('touch?mode=delete — данные заменены, хотя максимум updatedAt прежний', async () => {
    // Сервер пересчитывает order после удаления: он остаётся перестановкой 0..n-1.
    const withoutLeaf = makeOrgNodes()
      .filter((node) => node.id !== 't-2')
      .map((node, order) => ({ ...node, order }));
    const q = setup([json(makeOrgNodes()), json(withoutLeaf)]);
    q.subscribe();
    await q.settle(1);
    const before = q.data();

    q.refetch();
    await q.settle(2);
    expect(q.data()).not.toBe(before);
    expect(q.data().map((n: OrgNode) => n.id)).not.toContain('t-2');
  });

  it('невалидный ответ — ошибка целиком, прежние данные сохранены', async () => {
    const invalid = makeOrgNodes().map((node, i) =>
      i === 0 ? { ...node, performance: '87' } : node,
    );
    const q = setup([json(makeOrgNodes()), json(invalid)]);
    q.subscribe();
    await q.settle(1);
    const before = q.data();

    q.refetch();
    await q.settle(2);
    expect(q.status()).toBe('error');
    expect(q.error()).toMatchObject({ name: 'OrgTreeContractError' });
    expect(q.data()).toBe(before);
  });

  it('HTTP 500 — OrgTreeHttpError', async () => {
    const q = setup([json({ error: 'boom' }, 500)]);
    q.subscribe();
    await q.settle(1);
    expect(q.error()).toMatchObject({
      name: 'OrgTreeHttpError',
      message: 'Сервер ответил ошибкой 500',
    });
  });
});
