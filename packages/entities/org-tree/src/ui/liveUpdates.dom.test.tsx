import { combineSlices, configureStore } from '@reduxjs/toolkit';
import { QUERY_FUNCTION_ACTION_PATHS } from '@shared/query';
import { theme } from '@shared/theme';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import createSagaMiddleware from 'redux-saga';
import { ThemeProvider } from 'styled-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMetricRows } from '../lib/nodeMetrics';
import { formatBudget } from '../model/format';
import { orgTreeLive, type OrgTreePatch } from '../model/live';
import { DEFAULT_ORG_TREE_PARAMS as P } from '../model/params';
import {
  orgTreeLivePatchSaga,
  orgTreeSaga,
  orgTreeSlice,
  orgTreeUpdatesSlice,
} from '../model/store';
import { makeOrgNodes } from '../model/testing/fixtures';
import { useTableModel } from '../model/useTableModel';
import { OrgTable } from './OrgTable';
import { OrgTreeView } from './OrgTreeView';
import { declared, REDUCED_MOTION } from './testing/declared';

// Счётчики отрисовок: formatBudget — один вызов на рендер строки, getMetricRows — на рендер
// карточки. Реализации настоящие.
vi.mock('../model/format', { spy: true });
vi.mock('../lib/nodeMetrics', { spy: true });
const rowRenders = () => vi.mocked(formatBudget).mock.calls.length;
const cardRenders = () => vi.mocked(getMetricRows).mock.calls.length;

const UPDATED_AT = '2026-09-16T10:00:00.000Z';
const noop = () => {};

function Dashboard() {
  const model = useTableModel({ params: P, onParamsChange: noop });
  return (
    <>
      <OrgTreeView params={P} />
      <OrgTable model={model} selectedId={null} onSelect={noop} />
    </>
  );
}

/** Дерево и таблица на реальном сторе с сагами запроса и патчей; события потока — экшеном источника. */
async function renderDashboard() {
  const fetchMock = vi.fn(async () => Response.json(makeOrgNodes()));
  vi.stubGlobal('fetch', fetchMock);
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: combineSlices(orgTreeSlice, orgTreeUpdatesSlice),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: { ignoredActionPaths: QUERY_FUNCTION_ACTION_PATHS },
      }).concat(sagaMiddleware),
  });
  sagaMiddleware.run(orgTreeSaga);
  sagaMiddleware.run(orgTreeLivePatchSaga);
  const view = render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <Dashboard />
      </ThemeProvider>
    </Provider>,
  );
  await screen.findByRole('button', { name: 'Команда 1' });
  act(() => {
    store.dispatch(orgTreeLive.sagaActions.messageReceived({ event: { type: 'hello', seq: 0 } }));
  });

  const row = (id: string) =>
    view.container.querySelector<HTMLTableRowElement>(`tr[data-id="${id}"]`)!;
  return {
    fetchMock,
    patch: (seq: number, change: Partial<OrgTreePatch>) =>
      act(() => {
        store.dispatch(
          orgTreeLive.sagaActions.messageReceived({
            event: { type: 'patch', seq, nodes: [], removed: [], added: [], ...change },
          }),
        );
      }),
    row,
    /** Ячейки итогов строки: численность, бюджет, эффективность. */
    totals: (id: string) => {
      const [, , headcount, budget, performance] = row(id).cells;
      return { headcount: headcount!, budget: budget!, performance: performance! };
    },
    card: (id: string) =>
      view.container.querySelector<HTMLElement>(`[data-node-id="${id}"] [data-id="${id}"]`),
    value: (id: string, metric: string) =>
      view.container.querySelector<HTMLElement>(
        `[data-node-id="${id}"] [data-metric="${metric}"]`,
      )!,
    updated: () => view.container.querySelectorAll('[data-updated]'),
  };
}

const headcount = (id: string, value: number) => ({
  nodes: [{ id, headcount: value, updatedAt: UPDATED_AT }],
});

describe('патчи потока в таблице и дереве', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('патч подсвечивает изменённые ячейки и поля карточек, подсветка гаснет', async () => {
    const t = await renderDashboard();
    expect(t.updated()).toHaveLength(0);

    t.patch(1, headcount('t-1', 10));

    // Команда: численность изменилась, эффективность листа — нет. Предки: численность и
    // эффективность. Бюджет не менялся нигде.
    for (const [id, performance] of [
      ['t-1', false],
      ['p-1', true],
      ['d-b', true],
    ] as const) {
      const cells = t.totals(id);
      expect(cells.headcount.dataset.updated).toBe('1');
      expect(cells.budget.hasAttribute('data-updated')).toBe(false);
      expect(cells.performance.hasAttribute('data-updated')).toBe(performance);
    }
    expect(t.totals('p-2').headcount.hasAttribute('data-updated')).toBe(false);
    expect(t.value('p-1', 'total-headcount').dataset.updated).toBe('1');
    expect(t.value('p-1', 'total-performance').dataset.updated).toBe('1');
    expect(t.value('p-1', 'own-headcount').hasAttribute('data-updated')).toBe(false);
    expect(t.value('d-b', 'total-headcount').dataset.updated).toBe('1');
    // Изменились 3 ячейки численности, 2 эффективности и по 2 поля у карточек p-1 и d-b.
    expect(t.updated()).toHaveLength(9);

    // Гаснет: анимация фона одна, конечная, без удержания конечного кадра.
    for (const element of [t.totals('p-1').headcount, t.value('p-1', 'total-headcount')]) {
      const [animation, ...rest] = declared(element, 'animation');
      expect(rest).toEqual([]);
      expect(animation).toMatch(/\b1\.5s\b/);
      expect(animation).not.toMatch(/infinite|forwards|both/);
      expect(declared(t.totals('p-2').headcount, 'animation')).toEqual([]);
    }
  });

  it('повторный патч той же ячейки до угасания перезапускает подсветку: новый элемент', async () => {
    const t = await renderDashboard();
    t.patch(1, headcount('t-1', 10));
    const row = t.row('p-1');
    const first = t.totals('p-1');
    const firstValue = t.value('p-1', 'total-headcount');

    t.patch(2, headcount('t-1', 11));

    const second = t.totals('p-1');
    expect(t.row('p-1')).toBe(row);
    expect(second.headcount).not.toBe(first.headcount);
    expect(second.headcount.dataset.updated).toBe('2');
    expect(second.headcount.textContent).toBe('22');
    expect(second.budget).toBe(first.budget);
    expect(t.value('p-1', 'total-headcount')).not.toBe(firstValue);
    expect(t.value('p-1', 'total-headcount').dataset.updated).toBe('2');
  });

  it('prefers-reduced-motion — подсветка без перехода, но не пропадает', async () => {
    const t = await renderDashboard();
    t.patch(1, headcount('t-1', 10));

    for (const element of [t.totals('p-1').headcount, t.value('p-1', 'total-headcount')]) {
      expect(declared(element, 'animation-timing-function', REDUCED_MOTION)).toEqual(['step-end']);
      expect(declared(element, 'animation')[0]).toMatch(/ease-out/);
    }
  });

  it('значение, обновлённое до появления строки или карточки, не подсвечивается', async () => {
    const t = await renderDashboard();
    t.patch(1, headcount('t-1', 10));
    expect(t.card('t-1')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Развернуть: Отдел 1' }));
    expect(t.value('t-1', 'headcount').textContent).toBe('10');
    expect(t.value('t-1', 'headcount').hasAttribute('data-updated')).toBe(false);

    t.patch(2, headcount('t-1', 12));
    expect(t.value('t-1', 'headcount').dataset.updated).toBe('2');
  });

  it('патч не перемонтирует таблицу и дерево и перерисовывает только строки и карточки узла и предков', async () => {
    const t = await renderDashboard();
    const table = screen.getByRole('table');
    const canvas = screen.getByLabelText('Оргструктура');
    const rows = [...table.querySelectorAll('tr[data-id]')];
    const cards = ['d-a', 'd-b', 'p-1', 'p-2', 'p-3'].map((id) => t.card(id));
    const renders = { rows: rowRenders(), cards: cardRenders() };

    t.patch(1, headcount('t-1', 10));

    expect(screen.getByRole('table')).toBe(table);
    expect(screen.getByLabelText('Оргструктура')).toBe(canvas);
    expect([...table.querySelectorAll('tr[data-id]')]).toEqual(rows);
    rows.forEach((row, index) => expect(table.querySelectorAll('tr[data-id]')[index]).toBe(row));
    expect(['d-a', 'd-b', 'p-1', 'p-2', 'p-3'].map((id) => t.card(id))).toEqual(cards);
    cards.forEach((card) => expect(t.card(card!.dataset.id!)).toBe(card));

    // Строки t-1, p-1, d-b; карточки p-1 и d-b (команды свёрнуты).
    expect(rowRenders() - renders.rows).toBe(3);
    expect(cardRenders() - renders.cards).toBe(2);
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
  });
});
