/** @vitest-environment node */
import { combineSlices, configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { orgTreeQuery } from './query';
import { selectError, selectOrgNodes, selectStatus } from './selectors';
import type { OrgNode } from './schema';
import { orgTreeSaga, orgTreeSlice } from './store';
import { makeOrgNodes } from './testing/fixtures';

function setup(responses: (() => Response)[]) {
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
      expect(selectStatus(store.getState())).not.toBe('loading');
    });
  };
  return {
    store,
    fetchMock,
    settle,
    data: () => selectOrgNodes(store.getState()),
    subscribe: () => store.dispatch(orgTreeQuery.actions.subscribed()),
    refetch: () => store.dispatch(orgTreeQuery.actions.requested({ force: true })),
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

  it('запрос идёт на /api/org-tree с AbortSignal', async () => {
    const q = setup([json(makeOrgNodes())]);
    q.subscribe();
    await q.settle(1);

    expect(q.fetchMock).toHaveBeenCalledWith('/api/org-tree', { signal: expect.any(AbortSignal) });
    expect(selectStatus(q.store.getState())).toBe('success');
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
    const withoutLeaf = makeOrgNodes().filter((node) => node.id !== 't-2');
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
    expect(selectStatus(q.store.getState())).toBe('error');
    expect(selectError(q.store.getState())).toMatchObject({ name: 'OrgTreeContractError' });
    expect(q.data()).toBe(before);
  });

  it('HTTP 500 — OrgTreeHttpError', async () => {
    const q = setup([json({ error: 'boom' }, 500)]);
    q.subscribe();
    await q.settle(1);
    expect(selectError(q.store.getState())).toMatchObject({
      name: 'OrgTreeHttpError',
      message: 'Сервер ответил ошибкой 500',
    });
  });
});
