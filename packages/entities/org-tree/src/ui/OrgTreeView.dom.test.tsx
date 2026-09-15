import { combineSlices, configureStore } from '@reduxjs/toolkit';
import { theme } from '@shared/theme';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import createSagaMiddleware from 'redux-saga';
import { ThemeProvider } from 'styled-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgNode } from '../model/schema';
import { orgTreeSaga, orgTreeSlice } from '../model/store';
import { makeOrgNodes } from '../model/testing/fixtures';
import type { OrgTreeViewProps } from '../model/useTreeModel';
import { OrgTreeView } from './OrgTreeView';

/**
 * Дерево на реальном сторе с сагой; fetch отвечает сразу. Фикстура: «Дивизион Б» → «Отдел 1»
 * (две команды) и «Отдел 2»; «Дивизион А» → «Отдел 3» (одна команда).
 */
function renderTree(props: OrgTreeViewProps = {}, nodes: OrgNode[] = makeOrgNodes()) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(nodes)),
  );
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: combineSlices(orgTreeSlice),
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
  });
  sagaMiddleware.run(orgTreeSaga);
  const view = render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <OrgTreeView {...props} />
      </ThemeProvider>
    </Provider>,
  );
  return {
    ...view,
    store: () => store,
    card: (id: string) => view.container.querySelector<HTMLElement>(`[data-id="${id}"]`),
    visibleIds: () =>
      [...view.container.querySelectorAll<HTMLElement>('[data-node-id]')]
        .map((node) => node.dataset.nodeId)
        .sort(),
  };
}

/** jsdom без раскладки: проверяется, что статическое правило по data-атрибуту применилось. */
// eslint-disable-next-line no-restricted-globals
const opacity = (element: Element) => getComputedStyle(element).opacity;

describe('OrgTreeView', () => {
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

  it('без пропа expandedIds работает автономно: первый уровень раскрыт, шевроны и кнопки меняют раскрытие', async () => {
    const { visibleIds } = renderTree();
    await screen.findByLabelText('Оргструктура');
    expect(visibleIds()).toEqual(['d-a', 'd-b', 'p-1', 'p-2', 'p-3']);

    fireEvent.click(screen.getByRole('button', { name: 'Развернуть: Отдел 1' }));
    expect(visibleIds()).toEqual(['d-a', 'd-b', 'p-1', 'p-2', 'p-3', 't-1', 't-2']);

    fireEvent.click(screen.getByRole('button', { name: 'Свернуть всё' }));
    expect(visibleIds()).toEqual(['d-a', 'd-b']);

    fireEvent.click(screen.getByRole('button', { name: 'Развернуть всё' }));
    expect(visibleIds()).toHaveLength(8);

    // Alt+клик по раскрытому — поддерево свёрнуто; повторно — раскрыто целиком.
    fireEvent.click(screen.getByRole('button', { name: 'Свернуть: Дивизион Б' }), { altKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть: Дивизион Б' }));
    expect(visibleIds()).toEqual(['d-a', 'd-b', 'p-1', 'p-2', 'p-3', 't-3']);
    fireEvent.click(screen.getByRole('button', { name: 'Свернуть: Дивизион Б' }));
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть: Дивизион Б' }), {
      altKey: true,
    });
    expect(visibleIds()).toHaveLength(8);
  });

  it('неуправляемый режим: defaultExpandedIds задаёт начальное раскрытие', async () => {
    const { visibleIds } = renderTree({ defaultExpandedIds: new Set(['d-b', 'p-1']) });
    await screen.findByLabelText('Оргструктура');
    expect(visibleIds()).toEqual(['d-a', 'd-b', 'p-1', 'p-2', 't-1', 't-2']);
  });

  it('управляемый режим: раскрытие из пропа, действия уходят в колбэки', async () => {
    const onToggle = vi.fn();
    const onToggleRecursive = vi.fn();
    const onExpandAll = vi.fn();
    const onCollapseAll = vi.fn();
    const { visibleIds } = renderTree({
      expandedIds: new Set(['d-b']),
      onToggle,
      onToggleRecursive,
      onExpandAll,
      onCollapseAll,
    });
    await screen.findByLabelText('Оргструктура');
    expect(visibleIds()).toEqual(['d-a', 'd-b', 'p-1', 'p-2']);

    fireEvent.click(screen.getByRole('button', { name: 'Развернуть: Отдел 1' }));
    expect(onToggle).toHaveBeenCalledWith('p-1');
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть: Дивизион А' }), {
      altKey: true,
    });
    expect(onToggleRecursive).toHaveBeenCalledWith('d-a');
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть всё' }));
    fireEvent.click(screen.getByRole('button', { name: 'Свернуть всё' }));
    expect([onExpandAll.mock.calls.length, onCollapseAll.mock.calls.length]).toEqual([1, 1]);
    // Своё состояние не меняется: раскрытие — только из пропа.
    expect(visibleIds()).toEqual(['d-a', 'd-b', 'p-1', 'p-2']);
  });

  it('выбор: клик по карточке и кнопка названия вызывают onSelect, шеврон — нет; выбранный отмечен', async () => {
    const onSelect = vi.fn();
    const { card } = renderTree({ onSelect, selectedId: 'p-2' });
    await screen.findByLabelText('Оргструктура');

    expect(card('p-2')!.dataset.selected).toBe('true');
    expect(screen.getByRole('button', { name: 'Отдел 2' }).getAttribute('aria-current')).toBe(
      'true',
    );
    expect(card('p-1')!.dataset.selected).toBe('false');
    expect(screen.getByRole('button', { name: 'Отдел 1' }).hasAttribute('aria-current')).toBe(
      false,
    );

    fireEvent.click(card('p-1')!.querySelector('[data-metric]')!);
    expect(onSelect).toHaveBeenLastCalledWith('p-1');
    fireEvent.click(screen.getByRole('button', { name: 'Отдел 3' }));
    expect(onSelect).toHaveBeenLastCalledWith('p-3');
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть: Отдел 1' }));
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('dimUnmatched: несовпавшие приглушены статическим правилом и интерактивны; без него — не приглушены', async () => {
    const nodes = makeOrgNodes().map((node) => ({ ...node, matches: node.id.startsWith('t-') }));
    const onSelect = vi.fn();
    const { card, visibleIds, unmount } = renderTree({ dimUnmatched: true, onSelect }, nodes);
    await screen.findByLabelText('Оргструктура');

    expect(card('p-1')!.dataset.dimmed).toBe('true');
    expect(opacity(card('p-1')!)).toBe('0.45');
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть: Отдел 1' }));
    expect(visibleIds()).toContain('t-1');
    expect(card('t-1')!.dataset.dimmed).toBe('false');
    expect(opacity(card('t-1')!)).not.toBe('0.45');
    fireEvent.click(screen.getByRole('button', { name: 'Отдел 1' }));
    expect(onSelect).toHaveBeenCalledWith('p-1');
    unmount();

    const plain = renderTree({}, nodes);
    await screen.findByLabelText('Оргструктура');
    expect(plain.card('p-1')!.dataset.dimmed).toBe('false');
    expect(opacity(plain.card('p-1')!)).not.toBe('0.45');
  });

  it('revealRequest доводит холст до узла; каждый новый nonce — снова, тот же nonce — нет', async () => {
    // Холст 400×300: при масштабе подгонки на экране помещается один-два узла.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private readonly callback: ResizeObserverCallback;
        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }
        observe() {
          this.callback(
            [{ contentRect: { width: 400, height: 300 } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
        }
        disconnect() {}
      },
    );
    const defaultExpandedIds = new Set(['d-a', 'd-b', 'p-1']);
    const { rerender, container, store } = renderTree({ defaultExpandedIds, revealRequest: null });
    await screen.findByLabelText('Оргструктура');

    const parse = (value: string | null) => (value ?? '').match(/-?[\d.]+/g)!.map(Number);
    const view = () => parse(container.querySelector('svg > g')!.getAttribute('transform'));
    /** Прямоугольник узла на экране целиком внутри холста 400×300. */
    const onScreen = (id: string) => {
      const [x, y, k] = view();
      const [nx, ny] = parse(
        container.querySelector(`[data-node-id="${id}"]`)!.getAttribute('transform'),
      );
      const { width, height } = theme.tree.nodeSize;
      const left = nx! * k! + x!;
      const top = ny! * k! + y!;
      return left >= 0 && top >= 0 && left + width * k! <= 400 && top + height * k! <= 300;
    };
    const show = (revealRequest: { id: string; nonce: number }) =>
      rerender(
        <Provider store={store()}>
          <ThemeProvider theme={theme}>
            <OrgTreeView defaultExpandedIds={defaultExpandedIds} revealRequest={revealRequest} />
          </ThemeProvider>
        </Provider>,
      );

    // Подгонка от левого края: d-a на экране, p-2 (крайний справа) — нет.
    expect([onScreen('d-a'), onScreen('p-2')]).toEqual([true, false]);
    show({ id: 'p-2', nonce: 1 });
    expect([onScreen('d-a'), onScreen('p-2')]).toEqual([false, true]);

    show({ id: 'd-a', nonce: 2 });
    expect([onScreen('d-a'), onScreen('p-2')]).toEqual([true, false]);

    // Тот же узел ещё раз — новым запросом: холст снова доводится до него.
    show({ id: 'p-2', nonce: 3 });
    expect(onScreen('p-2')).toBe(true);
    const settled = view();
    // Тот же nonce — запрос уже выполнен, холст не двигается.
    show({ id: 'd-a', nonce: 3 });
    expect(view()).toEqual(settled);
  });
});
