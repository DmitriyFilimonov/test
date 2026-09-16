/** @vitest-environment node */
import { combineSlices, configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aggregateSubtrees } from './aggregate';
import { DEFAULT_ORG_TREE_PARAMS as P } from './params';
import { orgTreeQuery } from './query';
import type { OrgNode } from './schema';
import {
  selectExpandableIds,
  selectOrgNodes,
  selectStatus,
  selectVisibleTree,
  type OrgTreeItem,
  type VisibleOrgTreeNode,
} from './selectors';
import { orgTreeSaga, orgTreeSlice } from './store';
import { selectTableRows, type TableRow } from './table';
import { makeOrgNodes, stateWith } from './testing/fixtures';

// Счётчик вызовов расчёта итогов: реализация настоящая, вызовы считаются.
vi.mock('./aggregate', { spy: true });
const aggregateCalls = () => vi.mocked(aggregateSubtrees).mock.calls.length;

/** Ответ сервера на q: matches — только у перечисленных узлов. */
const matching = (nodes: OrgNode[], ids: readonly string[]): OrgNode[] =>
  nodes.map((node) => ({ ...node, matches: ids.includes(node.id) }));

const byId = (rows: TableRow[]) => new Map(rows.map((row) => [row.id, row]));

const flatten = (tree: VisibleOrgTreeNode[]): OrgTreeItem[] =>
  tree.flatMap((node) => [node.data, ...flatten(node.children)]);

beforeEach(() => {
  vi.mocked(aggregateSubtrees).mockClear();
});

describe('selectTableRows', () => {
  it('уровни 1/2/3: дивизион, отдел, команда', () => {
    const rows = byId(selectTableRows(stateWith(makeOrgNodes()), P));
    expect(['d-a', 'd-b'].map((id) => rows.get(id)!.level)).toEqual([1, 1]);
    expect(['p-1', 'p-2', 'p-3'].map((id) => rows.get(id)!.level)).toEqual([2, 2, 2]);
    expect(['t-1', 't-2', 't-3'].map((id) => rows.get(id)!.level)).toEqual([3, 3, 3]);
  });

  it('строка — id, name, level и итоги; у листа итог равен собственным значениям', () => {
    const rows = byId(selectTableRows(stateWith(makeOrgNodes()), P));
    expect(rows.get('t-1')).toEqual({
      id: 't-1',
      parentId: 'p-1',
      name: 'Команда 1',
      level: 3,
      totalHeadcount: 6,
      totalBudget: 120,
      totalPerformance: 40,
      matches: true,
    });
    expect(rows.get('t-2')).toMatchObject({
      totalHeadcount: 10,
      totalBudget: 200,
      totalPerformance: 80,
    });
  });

  it('итоги узла в selectVisibleTree и в selectTableRows совпадают по всем полям', () => {
    const state = stateWith(makeOrgNodes());
    const expandAll = new Set(selectExpandableIds(state, P));
    const items = flatten(selectVisibleTree(state, P, expandAll));
    const rows = byId(selectTableRows(state, P));

    expect(items).toHaveLength(8);
    expect(rows.size).toBe(8);
    for (const { node, subtree } of items) {
      const row = rows.get(node.id)!;
      expect({
        headcount: row.totalHeadcount,
        budget: row.totalBudget,
        performance: row.totalPerformance,
      }).toEqual(subtree);
    }
    // Проверка непустая: у узлов с детьми итог отличается от собственных значений.
    expect(rows.get('d-b')!.totalHeadcount).toBe(24);
  });

  it('q совпал только с одним отделом: он и дивизион-контекст, итоги включают несовпавшие команды', () => {
    const rows = selectTableRows(stateWith(matching(makeOrgNodes(), ['p-1'])), P);
    expect(rows.map((row) => [row.id, row.matches])).toEqual([
      ['d-b', false],
      ['p-1', true],
    ]);
    // p-1 (1) + t-2 (10) + t-1 (6); команды не совпали и не показаны, но в итог входят.
    expect(rows[1]).toMatchObject({ level: 2, totalHeadcount: 17, totalBudget: 340 });
    expect(rows[1].totalPerformance).toBeCloseTo((1 * 10 + 10 * 80 + 6 * 40) / 17);
    // Итог строки контекста — по всему дивизиону, а не по показанным строкам.
    expect(rows[0]).toMatchObject({ level: 1, totalHeadcount: 24 });
  });

  it('группировка: дети сразу под родителем, соседи — по order, а не по позиции в массиве', () => {
    // Перестановка не совпадает ни с порядком массива, ни с сортировкой по какому-либо полю.
    const order: Record<string, number> = {
      't-3': 0,
      'd-a': 1,
      'p-1': 2,
      'd-b': 3,
      't-1': 4,
      'p-3': 5,
      't-2': 6,
      'p-2': 7,
    };
    const nodes = makeOrgNodes().map((node) => ({ ...node, order: order[node.id] }));
    expect(nodes.map((node) => node.id)).toEqual([
      'd-b',
      'd-a',
      'p-2',
      'p-1',
      'p-3',
      't-2',
      't-1',
      't-3',
    ]);

    const rows = selectTableRows(stateWith(nodes), P);
    expect(rows.map((row) => row.id)).toEqual([
      'd-a',
      'p-3',
      't-3',
      'd-b',
      'p-1',
      't-1',
      't-2',
      'p-2',
    ]);
    expect(rows.every((row) => row.matches)).toBe(true);
  });

  it('фильтр: совпавшие и их предки в порядке группировки; несовпавшие потомки совпавших скрыты', () => {
    const order: Record<string, number> = {
      't-3': 0,
      'd-a': 1,
      'p-1': 2,
      'd-b': 3,
      't-1': 4,
      'p-3': 5,
      't-2': 6,
      'p-2': 7,
    };
    const nodes = makeOrgNodes().map((node) => ({ ...node, order: order[node.id] }));

    // Совпали отдел p-3 (его команда t-3 — нет) и команда t-1 (её отдел и дивизион — нет).
    const rows = selectTableRows(stateWith(matching(nodes, ['p-3', 't-1'])), P);
    expect(rows.map((row) => [row.id, row.matches])).toEqual([
      ['d-a', false],
      ['p-3', true],
      ['d-b', false],
      ['p-1', false],
      ['t-1', true],
    ]);

    // Совпали дивизион и команда внутри него: промежуточный отдел — контекст, соседи — скрыты.
    const nested = selectTableRows(stateWith(matching(nodes, ['d-b', 't-2'])), P);
    expect(nested.map((row) => [row.id, row.matches])).toEqual([
      ['d-b', true],
      ['p-1', false],
      ['t-2', true],
    ]);

    expect(selectTableRows(stateWith(matching(nodes, [])), P)).toEqual([]);
  });

  it('нет данных или пустой ответ — пустой список', () => {
    expect(selectTableRows(stateWith(undefined), P)).toEqual([]);
    expect(selectTableRows(stateWith([]), P)).toEqual([]);
  });
});

describe('selectVisibleTree: флаг matches', () => {
  it('узел дерева несёт matches из ответа; несовпавшие узлы в дереве остаются', () => {
    const state = stateWith(matching(makeOrgNodes(), ['p-1']));
    const expandAll = new Set(selectExpandableIds(state, P));
    const items = flatten(selectVisibleTree(state, P, expandAll));
    expect(items).toHaveLength(8);
    expect(items.filter((item) => item.matches).map((item) => item.node.id)).toEqual(['p-1']);
  });
});

describe('расчёт итогов общий и мемоизирован', () => {
  function setup() {
    const fetchMock = vi.fn(async () => Response.json(makeOrgNodes()));
    vi.stubGlobal('fetch', fetchMock);
    const sagaMiddleware = createSagaMiddleware();
    const store = configureStore({
      reducer: combineSlices(orgTreeSlice),
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
    });
    sagaMiddleware.run(orgTreeSaga);
    const settle = (calls: number) =>
      vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(calls);
        expect(selectStatus(store.getState(), P)).toBe('success');
      });
    return { store, settle };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('таблица — проекция того же расчёта: один вызов на данные для таблицы и дерева', () => {
    const state = stateWith(makeOrgNodes());
    selectTableRows(state, P);
    expect(aggregateCalls()).toBe(1);

    selectVisibleTree(state, P, new Set(['d-b']));
    expect(aggregateCalls()).toBe(1);
  });

  it('повторный вызов с тем же state — без пересчёта, та же ссылка', () => {
    const state = stateWith(makeOrgNodes());
    const rows = selectTableRows(state, P);
    expect(selectTableRows(state, P)).toBe(rows);
    expect(aggregateCalls()).toBe(1);
  });

  it('смена expandedIds — без пересчёта', () => {
    const state = stateWith(makeOrgNodes());
    const rows = selectTableRows(state, P);
    selectVisibleTree(state, P, new Set());
    selectVisibleTree(state, P, new Set(['d-b']));
    selectVisibleTree(state, P, new Set(['d-b', 'p-1']));
    expect(selectTableRows(state, P)).toBe(rows);
    expect(aggregateCalls()).toBe(1);
  });

  it('ревалидация с равными данными (ссылка на data та же) — без пересчёта', async () => {
    const { store, settle } = setup();
    store.dispatch(orgTreeQuery.actions.subscribed(P));
    await settle(1);
    const before = store.getState();
    const rows = selectTableRows(before, P);
    selectVisibleTree(before, P, new Set());
    const calls = aggregateCalls();
    expect(calls).toBe(1);

    // Сервер вернул те же узлы новыми объектами: isEqual сохраняет прежнюю ссылку на data.
    store.dispatch(orgTreeQuery.actions.requested(P, { force: true }));
    await settle(2);
    const after = store.getState();

    expect(after).not.toBe(before);
    expect(selectOrgNodes(after, P)).toBe(selectOrgNodes(before, P));
    expect(selectTableRows(after, P)).toBe(rows);
    selectVisibleTree(after, P, new Set(['d-b']));
    expect(aggregateCalls()).toBe(calls);
  });

  it('изменение data — пересчёт', () => {
    const nodes = makeOrgNodes();
    const rows = selectTableRows(stateWith(nodes), P);
    expect(aggregateCalls()).toBe(1);

    const changed = nodes.map((node) =>
      node.id === 't-1' ? { ...node, headcount: 7, updatedAt: '2026-09-15T12:00:00.000Z' } : node,
    );
    const next = selectTableRows(stateWith(changed), P);
    expect(aggregateCalls()).toBe(2);
    expect(next).not.toBe(rows);
    expect(byId(next).get('p-1')!.totalHeadcount).toBe(18);
  });
});
