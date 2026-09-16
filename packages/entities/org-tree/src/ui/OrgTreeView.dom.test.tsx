import { combineSlices, configureStore } from '@reduxjs/toolkit';
import { theme } from '@shared/theme';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import createSagaMiddleware from 'redux-saga';
import { ThemeProvider } from 'styled-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgNode } from '../model/schema';
import { orgTreeSaga, orgTreeSlice, orgTreeUpdatesSlice } from '../model/store';
import { makeOrgNodes } from '../model/testing/fixtures';
import type { OrgTreeViewProps } from '../model/useTreeModel';
import { OrgTreeView } from './OrgTreeView';
import { declared, REDUCED_MOTION } from './testing/declared';

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
    reducer: combineSlices(orgTreeSlice, orgTreeUpdatesSlice),
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

describe('OrgTreeView', () => {
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

/** Числа из атрибута transform: translate(x y) → [x, y]. */
const translate = (element: Element) =>
  (element.getAttribute('transform') ?? '').match(/-?[\d.]+/g)!.map(Number);

describe('OrgTreeView: появление и исчезновение узлов', () => {
  /** Группы узла: место (внешняя), угол якоря (средняя), анимируемая (внутренняя). */
  function groups(container: HTMLElement, id: string) {
    const outer = container.querySelector(`[data-node-id="${id}"], [data-exiting-id="${id}"]`);
    const middle = outer?.firstElementChild;
    return { outer, middle, inner: middle?.firstElementChild };
  }
  const motions = (container: HTMLElement, selector: string) =>
    [...container.querySelectorAll(`${selector}[data-motion]`)].map((element) =>
      element.getAttribute('data-motion'),
    );

  it('раскрытие: новые узлы и рёбра появляются из родителя, прежние — без анимации; клик во время появления работает', async () => {
    const onSelect = vi.fn();
    const { container } = renderTree({ onSelect });
    await screen.findByLabelText('Оргструктура');
    // Первые данные на холсте — без анимации.
    expect(container.querySelectorAll('[data-motion]')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Развернуть: Отдел 1' }));

    const parent = groups(container, 'p-1');
    const child = groups(container, 't-1');
    expect(child.inner!.getAttribute('data-motion')).toBe('enter');
    expect(groups(container, 't-2').inner!.getAttribute('data-motion')).toBe('enter');
    expect(parent.inner!.hasAttribute('data-motion')).toBe(false);
    expect(motions(container, 'g')).toEqual(['enter', 'enter']);
    expect(motions(container, 'path')).toEqual(['enter', 'enter']);
    // Узел стоит на своём месте; средняя группа — угол родителя, внутренняя возвращает на место.
    const [x, y] = translate(child.outer!);
    const [px, py] = translate(parent.outer!);
    expect(translate(child.middle!)).toEqual([px! - x!, py! - y!]);
    expect(translate(child.inner!)).toEqual([x! - px!, y! - py!]);

    fireEvent.click(screen.getByRole('button', { name: 'Команда 1' }));
    expect(onSelect).toHaveBeenCalledWith('t-1');
  });

  it('сворачивание: узел уходит в родителя, скрыт от скринридера и удаляется из DOM после своей анимации', async () => {
    const { container, visibleIds } = renderTree({ defaultExpandedIds: new Set(['d-b', 'p-1']) });
    await screen.findByLabelText('Оргструктура');
    const edges = () => container.querySelectorAll('path').length;
    // Дивизион Б → два отдела, Отдел 1 → две команды.
    expect(edges()).toBe(4);

    fireEvent.click(screen.getByRole('button', { name: 'Свернуть: Отдел 1' }));

    // Раскладка — сразу без команд; сами команды ещё на холсте и исчезают.
    expect(visibleIds()).toEqual(['d-a', 'd-b', 'p-1', 'p-2']);
    const leaving = groups(container, 't-1');
    expect(leaving.outer!.getAttribute('data-exiting-id')).toBe('t-1');
    expect(leaving.outer!.getAttribute('aria-hidden')).toBe('true');
    expect(leaving.inner!.getAttribute('data-motion')).toBe('exit');
    expect(motions(container, 'path')).toEqual(['exit', 'exit']);
    expect(screen.queryByRole('button', { name: 'Команда 1' })).toBeNull();
    const [x, y] = translate(leaving.outer!);
    const [px, py] = translate(groups(container, 'p-1').outer!);
    expect(translate(leaving.middle!)).toEqual([px! - x!, py! - y!]);

    // Закончилась анимация вложенного элемента (подсветка значения) — узел остаётся.
    fireEvent.animationEnd(leaving.outer!.querySelector('[data-metric]')!);
    expect(groups(container, 't-1').outer).toBe(leaving.outer);

    fireEvent.animationEnd(leaving.inner!);
    expect(groups(container, 't-1').outer).toBeNull();
    expect(groups(container, 't-2').outer).not.toBeNull();
    expect(edges()).toBe(3);

    fireEvent.animationEnd(groups(container, 't-2').inner!);
    expect(container.querySelectorAll('[data-exiting-id], [data-motion="exit"]')).toHaveLength(0);
    expect(edges()).toBe(2);
  });

  it('быстрая серия: вернувшийся до конца исчезновения узел — тот же элемент, анимации не копятся', async () => {
    const { container, visibleIds } = renderTree({ defaultExpandedIds: new Set(['d-b', 'p-1']) });
    await screen.findByLabelText('Оргструктура');
    const node = groups(container, 't-1');
    const chevron = /^(Свернуть|Развернуть): Отдел 1$/;
    const toggle = () => fireEvent.click(screen.getByRole('button', { name: chevron }));

    for (let i = 0; i < 5; i++) {
      toggle();
    }
    expect(groups(container, 't-1').outer).toBe(node.outer);
    expect(groups(container, 't-1').inner).toBe(node.inner);
    // Пять переключений от раскрытого: команды исчезают, по одному элементу на команду.
    expect(container.querySelectorAll('[data-exiting-id]')).toHaveLength(2);

    toggle();
    expect(visibleIds()).toEqual(['d-a', 'd-b', 'p-1', 'p-2', 't-1', 't-2']);
    expect(container.querySelectorAll('[data-exiting-id]')).toHaveLength(0);
    expect(container.querySelectorAll('g[data-motion]')).toHaveLength(2);
    expect(container.querySelectorAll('path')).toHaveLength(4);
    expect(node.inner!.getAttribute('data-motion')).toBe('enter');
    expect(translate(node.middle!)).toEqual([
      translate(groups(container, 'p-1').outer!)[0]! - translate(node.outer!)[0]!,
      translate(groups(container, 'p-1').outer!)[1]! - translate(node.outer!)[1]!,
    ]);

    // Опоздавший конец прежнего исчезновения вернувшийся узел не удаляет.
    fireEvent.animationEnd(node.inner!);
    expect(groups(container, 't-1').outer).toBe(node.outer);
  });

  it('prefers-reduced-motion: появление и исчезновение без анимации, длительность — из темы вне media', async () => {
    const { container } = renderTree({ defaultExpandedIds: new Set(['d-a', 'd-b']) });
    await screen.findByLabelText('Оргструктура');
    // Команды Отдела 1 появляются, Отдел 3 исчезает.
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть: Отдел 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Свернуть: Дивизион А' }));

    const entering = [
      groups(container, 't-1').inner!,
      container.querySelector('path[data-motion="enter"]')!,
    ];
    const exiting = [
      groups(container, 'p-3').inner!,
      container.querySelector('path[data-motion="exit"]')!,
    ];
    expect(entering.map((element) => element.getAttribute('data-motion'))).toEqual([
      'enter',
      'enter',
    ]);
    expect(exiting.map((element) => element.getAttribute('data-motion'))).toEqual(['exit', 'exit']);

    for (const element of [...entering, ...exiting]) {
      const [animation, ...rest] = declared(element, 'animation');
      expect(rest).toEqual([]);
      expect(animation).toContain(theme.motion.treeTransition);
      expect(declared(element, 'animation-duration', REDUCED_MOTION)).toEqual(['0s']);
    }
    // Появление ничего не держит после конца, исчезновение держит последний кадр до удаления.
    expect(declared(entering[0]!, 'animation')[0]).toMatch(/\bbackwards\b/);
    expect(declared(exiting[0]!, 'animation')[0]).toMatch(/\bforwards\b/);
  });
});
