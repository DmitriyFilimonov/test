import { theme } from '@shared/theme';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatBudget } from '../model/format';
import type { RevealRequest } from '../model/selection';
import type { OrgTableColumn, OrgTableSortColumn, TableRow } from '../model/table';
import type { TableModel } from '../model/useTableModel';
import { OrgTable } from './OrgTable';

// Счётчик отрисовок строк: formatBudget вызывается ровно один раз на рендер строки.
vi.mock('../model/format', { spy: true });
const rowRenders = () => vi.mocked(formatBudget).mock.calls.length;

const NBSP = String.fromCharCode(0xa0);

const ROWS: TableRow[] = [
  {
    id: 'd-1',
    parentId: null,
    name: 'Дивизион 1',
    level: 1,
    totalHeadcount: 120,
    totalBudget: 12345678,
    totalPerformance: 71.6,
    matches: true,
  },
  {
    id: 'p-1',
    parentId: 'd-1',
    name: 'Отдел 1',
    level: 2,
    totalHeadcount: 40,
    totalBudget: 1000,
    totalPerformance: 64,
    matches: false,
  },
  {
    id: 't-1',
    parentId: 'p-1',
    name: 'Команда 1',
    level: 3,
    totalHeadcount: 0,
    totalBudget: 0,
    totalPerformance: null,
    matches: true,
  },
];

const LABELS: Record<OrgTableColumn, string> = {
  name: 'Подразделение',
  level: 'Уровень',
  totalHeadcount: 'Всего сотрудников',
  totalBudget: 'Бюджет суммарный',
  totalPerformance: 'Средняя эффективность',
};

function makeModel(overrides: Partial<TableModel> = {}): TableModel {
  return {
    rows: ROWS,
    updates: {},
    sort: 'name',
    dir: 'asc',
    isLoading: false,
    isValidating: false,
    isPlaceholder: false,
    hasData: true,
    isEmpty: false,
    error: undefined,
    draftQuery: '',
    setDraftQuery: vi.fn(),
    clearQuery: vi.fn(),
    filterDisabled: false,
    toggleSort: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

function renderTable(model: TableModel, selectedId: string | null = null) {
  const onSelect = vi.fn<(id: string) => void>();
  const ui = (nextModel: TableModel, nextSelectedId: string | null) => (
    <ThemeProvider theme={theme}>
      <OrgTable model={nextModel} selectedId={nextSelectedId} onSelect={onSelect} />
    </ThemeProvider>
  );
  const view = render(ui(model, selectedId));
  return {
    ...view,
    onSelect,
    update: (nextModel: TableModel, nextSelectedId: string | null = selectedId) =>
      view.rerender(ui(nextModel, nextSelectedId)),
  };
}

const tbody = () => screen.getAllByRole('rowgroup')[1]!;
const bodyRows = () => within(tbody()).getAllByRole('row');
const rowIds = () => bodyRows().map((row) => row.dataset.id);
const cells = (id: string) =>
  within(bodyRows().find((row) => row.dataset.id === id)!).getAllByRole('cell');
const header = (column: OrgTableColumn) =>
  screen.getByRole('columnheader', { name: new RegExp(`^${LABELS[column]}`) });
const sortButton = (column: OrgTableSortColumn) => within(header(column)).getByRole('button');

/** Высота прокручиваемой области для ResizeObserver: от неё зависит шаг PageUp/PageDown. */
let scrollerHeight = 0;

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private readonly callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe() {
        this.callback(
          [{ contentRect: { width: 800, height: scrollerHeight } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.mocked(formatBudget).mockClear();
  vi.unstubAllGlobals();
  scrollerHeight = 0;
});

describe('OrgTable: сортировка', () => {
  it('клик по заголовку вызывает toggleSort; aria-sort и aria-label отражают сортировку и обновляются', () => {
    const model = makeModel({ sort: 'name', dir: 'asc' });
    const { update } = renderTable(model);

    expect(screen.getAllByRole('columnheader')).toHaveLength(5);
    expect(header('name').getAttribute('aria-sort')).toBe('ascending');
    expect(sortButton('name').getAttribute('aria-label')).toBe(
      'Подразделение, сортировка по возрастанию',
    );
    for (const column of ['totalHeadcount', 'totalBudget', 'totalPerformance'] as const) {
      expect(header(column).getAttribute('aria-sort')).toBe('none');
    }
    // Уровень не сортируется: у соседей в группе он один.
    expect(within(header('level')).queryByRole('button')).toBeNull();
    expect(header('level').hasAttribute('aria-sort')).toBe(false);
    expect(within(screen.getAllByRole('rowgroup')[0]!).getAllByRole('button')).toHaveLength(4);

    fireEvent.click(sortButton('totalBudget'));
    expect(model.toggleSort).toHaveBeenCalledTimes(1);
    expect(model.toggleSort).toHaveBeenCalledWith('totalBudget');

    // Та же функция toggleSort, новые sort/dir — как после ответа родителя.
    update({ ...model, sort: 'totalBudget', dir: 'desc' });
    expect(header('totalBudget').getAttribute('aria-sort')).toBe('descending');
    expect(sortButton('totalBudget').getAttribute('aria-label')).toBe(
      'Бюджет суммарный, сортировка по убыванию',
    );
    expect(header('name').getAttribute('aria-sort')).toBe('none');
    expect(sortButton('name').getAttribute('aria-label')).toBe('Подразделение, без сортировки');
  });

  it('isPlaceholder: прежние строки видны и приглушены, таблица не пуста, заголовки активны', () => {
    const model = makeModel({ isPlaceholder: true, isValidating: true });
    renderTable(model);

    expect(rowIds()).toEqual(['d-1', 'p-1', 't-1']);
    const table = screen.getByRole('table');
    expect(table.dataset.placeholder).toBe('true');
    // jsdom без раскладки: проверяется, что статическое правило по data-атрибуту применилось.
    // eslint-disable-next-line no-restricted-globals
    expect(getComputedStyle(tbody()).opacity).toBe('0.55');

    expect((sortButton('totalHeadcount') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(sortButton('totalHeadcount'));
    expect(model.toggleSort).toHaveBeenCalledWith('totalHeadcount');
  });

  it('ревалидация своих данных строки не приглушает', () => {
    renderTable(makeModel({ isValidating: true }));
    expect(screen.getByRole('table').dataset.placeholder).toBe('false');
    // eslint-disable-next-line no-restricted-globals
    expect(getComputedStyle(tbody()).opacity).not.toBe('0.55');
    expect(screen.getByRole('status').dataset.active).toBe('true');
  });

  it('смена порядка не перерисовывает строки с теми же данными; выбор — только затронутые', () => {
    const model = makeModel();
    const { update } = renderTable(model);
    expect(rowRenders()).toBe(3);

    vi.mocked(formatBudget).mockClear();
    // Новые объекты строк в обратном порядке: у строк те же примитивные пропсы.
    update({ ...model, sort: 'name', dir: 'desc', rows: ROWS.toReversed().map((r) => ({ ...r })) });
    expect(rowIds()).toEqual(['t-1', 'p-1', 'd-1']);
    expect(rowRenders()).toBe(0);

    update(model, 'p-1');
    expect(rowRenders()).toBe(1);
    update(model, 'd-1');
    expect(rowRenders()).toBe(3);

    // Ввод в фильтр строки не трогает.
    vi.mocked(formatBudget).mockClear();
    update({ ...model, draftQuery: 'От' }, 'd-1');
    expect(rowRenders()).toBe(0);
  });
});

describe('OrgTable: строки и выделение', () => {
  it('клик по строке вызывает onSelect с её id — по ячейке и по кнопке названия', () => {
    const { onSelect } = renderTable(makeModel());

    fireEvent.click(cells('p-1')[3]!);
    expect(onSelect).toHaveBeenLastCalledWith('p-1');

    fireEvent.click(screen.getByRole('button', { name: 'Команда 1' }));
    expect(onSelect).toHaveBeenLastCalledWith('t-1');
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('выбранная строка отмечена data-selected и aria-current, остальные — нет', () => {
    renderTable(makeModel(), 'p-1');

    expect(bodyRows().map((row) => row.dataset.selected)).toEqual(['false', 'true', 'false']);
    expect(bodyRows().map((row) => row.getAttribute('aria-current'))).toEqual([null, 'true', null]);
  });

  it('ячейки: уровень, численность, бюджет «12 345 678 руб.», эффективность округлена, null — «—»', () => {
    renderTable(makeModel());

    expect(cells('d-1').map((cell) => cell.textContent)).toEqual([
      'Дивизион 1',
      '1',
      '120',
      `12${NBSP}345${NBSP}678${NBSP}руб.`,
      '72',
    ]);
    expect(cells('t-1')[3]!.textContent).toBe(`0${NBSP}руб.`);
    expect(cells('t-1')[4]!.textContent).toBe('—');
  });
});

describe('OrgTable: группировка', () => {
  it('глубина — отступом названия: статическое правило по data-level, шаг на уровень', () => {
    renderTable(makeModel());
    // jsdom без раскладки: проверяется значение переменной, которое задало правило уровня.
    const indent = (id: string) =>
      // eslint-disable-next-line no-restricted-globals
      getComputedStyle(cells(id)[0]!).getPropertyValue('--indent');
    expect(['d-1', 'p-1', 't-1'].map(indent)).toEqual(['0px', '20px', '40px']);
  });

  it('строка контекста (узел не совпал, совпал потомок) приглушена статическим правилом и выбирается', () => {
    const { onSelect } = renderTable(makeModel());
    const row = (id: string) => bodyRows().find((candidate) => candidate.dataset.id === id)!;

    expect(bodyRows().map((candidate) => candidate.dataset.matches)).toEqual([
      'true',
      'false',
      'true',
    ]);
    // eslint-disable-next-line no-restricted-globals
    const color = (id: string) => getComputedStyle(row(id)).color;
    expect(color('p-1')).not.toBe(color('d-1'));

    fireEvent.click(cells('p-1')[2]!);
    expect(onSelect).toHaveBeenLastCalledWith('p-1');
  });
});

describe('OrgTable: состояния', () => {
  it('пустой результат фильтра — строка «Ничего не найдено»', () => {
    renderTable(makeModel({ rows: [], draftQuery: 'xyz' }));

    expect(bodyRows()).toHaveLength(1);
    const [cell] = within(bodyRows()[0]!).getAllByRole('cell');
    expect(cell!.textContent).toBe('Ничего не найдено');
    expect(cell!.getAttribute('colspan')).toBe('5');
  });

  it('пустой ответ — осмысленный текст, а не «Ничего не найдено»', () => {
    renderTable(makeModel({ rows: [], isEmpty: true }));
    expect(tbody().textContent).toBe('В оргструктуре пока нет подразделений');
  });

  it('isLoading — скелетон строк', () => {
    renderTable(makeModel({ rows: [], hasData: false, isLoading: true }));

    expect(bodyRows()).toHaveLength(theme.table.skeletonRows);
    expect(tbody().textContent).toBe('');
    expect(screen.getByRole('table').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('«Повторить» disabled при isValidating и вызывает retry без него', () => {
    const error = { message: 'Сервер ответил ошибкой 500' };
    const model = makeModel({ error, isValidating: true });
    const { update } = renderTable(model);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Не удалось обновить данные');
    expect(
      within(alert).getByRole<HTMLButtonElement>('button', { name: 'Повторить' }).disabled,
    ).toBe(true);
    // Строки не размонтированы.
    expect(rowIds()).toEqual(['d-1', 'p-1', 't-1']);

    update({ ...model, isValidating: false });
    const retry = screen.getByRole<HTMLButtonElement>('button', { name: 'Повторить' });
    expect(retry.disabled).toBe(false);
    fireEvent.click(retry);
    expect(model.retry).toHaveBeenCalledTimes(1);
  });

  it('ошибка без данных — сообщение в таблице и «Повторить»', () => {
    renderTable(makeModel({ rows: [], hasData: false, error: { message: 'Нет соединения' } }));

    expect(tbody().textContent).toBe('Данные не загружены');
    expect(screen.getByRole('alert').textContent).toContain('Не удалось загрузить данные');
  });
});

describe('OrgTable: фильтр', () => {
  it('поле показывает draftQuery и передаёт ввод в setDraftQuery', () => {
    const model = makeModel({ draftQuery: 'От' });
    renderTable(model);

    const input = screen.getByRole<HTMLInputElement>('searchbox', {
      name: 'Поиск подразделения по названию',
    });
    expect(input.value).toBe('От');
    fireEvent.change(input, { target: { value: 'Отд' } });
    expect(model.setDraftQuery).toHaveBeenCalledWith('Отд');
  });

  it('«Очистить» вызывает clearQuery и возвращает фокус в поле; при пустом поле — disabled', () => {
    const model = makeModel({ draftQuery: 'abc' });
    const { update } = renderTable(model);

    const clear = screen.getByRole<HTMLButtonElement>('button', { name: 'Очистить' });
    fireEvent.click(clear);
    expect(model.clearQuery).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));

    update({ ...model, draftQuery: '' });
    expect(clear.disabled).toBe(true);
  });
});

describe('OrgTable: прокрутка к строке по запросу', () => {
  const scrollIntoView = vi.fn();
  beforeEach(() => {
    // В jsdom scrollIntoView не реализован.
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    scrollIntoView.mockReset();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  function renderWithReveal(revealRequest: RevealRequest | null) {
    const ui = (request: RevealRequest | null) => (
      <ThemeProvider theme={theme}>
        <OrgTable model={makeModel()} selectedId="p-1" onSelect={vi.fn()} revealRequest={request} />
      </ThemeProvider>
    );
    const view = render(ui(revealRequest));
    return { update: (request: RevealRequest | null) => view.rerender(ui(request)) };
  }

  it('запрос прокручивает строку узла (block: nearest); повторный запрос того же узла — снова', () => {
    const { update } = renderWithReveal(null);
    expect(scrollIntoView).not.toHaveBeenCalled();

    update({ id: 'p-1', nonce: 1 });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(bodyRows()[1]);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });

    update({ id: 'p-1', nonce: 2 });
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('строки узла нет (не совпала с фильтром) — ни прокрутки, ни ошибки', () => {
    const { update } = renderWithReveal(null);
    update({ id: 'missing', nonce: 1 });
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(rowIds()).toEqual(['d-1', 'p-1', 't-1']);
  });
});

describe('OrgTable: клавиатура', () => {
  const scrollIntoView = vi.fn();
  beforeEach(() => {
    // В jsdom scrollIntoView не реализован.
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    scrollIntoView.mockReset();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  const row = (id: string) => bodyRows().find((candidate) => candidate.dataset.id === id)!;
  const focusedId = () => (document.activeElement as HTMLElement | null)?.dataset.id;
  const press = (key: string) => fireEvent.keyDown(document.activeElement!, { key });
  /** Вход в таблицу с Tab: фокус на единственной строке в порядке Tab. */
  const enter = () =>
    act(() =>
      bodyRows()
        .find((candidate) => candidate.tabIndex === 0)!
        .focus(),
    );
  /** Элементы в порядке Tab: tabIndex ≥ 0 и не disabled. */
  const tabStops = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLElement>('input, button, [tabindex]')].filter(
      (element) => element.tabIndex >= 0 && !(element as HTMLButtonElement).disabled,
    );

  it('Tab: в порядке Tab одна строка — в таблицу и из неё одним нажатием; кнопки названий вне порядка', () => {
    const { container } = renderTable(makeModel());

    const stops = tabStops(container);
    // Поле, четыре кнопки сортировки («Очистить» при пустом поле disabled) и одна строка.
    expect(stops).toHaveLength(6);
    expect(stops.at(-1)).toBe(row('d-1'));
    expect(bodyRows().map((candidate) => candidate.tabIndex)).toEqual([0, -1, -1]);
    for (const name of ['Дивизион 1', 'Отдел 1', 'Команда 1']) {
      expect(screen.getByRole('button', { name }).tabIndex).toBe(-1);
    }

    enter();
    press('ArrowDown');
    expect(focusedId()).toBe('p-1');
    expect(tabStops(container).filter((element) => element.tagName === 'TR')).toEqual([row('p-1')]);
  });

  it('стрелки двигают фокус по строкам и останавливаются на краях; Home/End — к первой и последней', () => {
    renderTable(makeModel());
    enter();
    expect(focusedId()).toBe('d-1');

    press('ArrowDown');
    expect(focusedId()).toBe('p-1');
    press('ArrowDown');
    expect(focusedId()).toBe('t-1');
    press('ArrowDown');
    expect(focusedId()).toBe('t-1');
    press('Home');
    expect(focusedId()).toBe('d-1');
    press('ArrowUp');
    expect(focusedId()).toBe('d-1');
    press('End');
    expect(focusedId()).toBe('t-1');
    press('ArrowUp');
    expect(focusedId()).toBe('p-1');

    // Строка с фокусом доводится до видимой части; в порядке Tab — она.
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(row('p-1'));
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' });
    expect(bodyRows().map((candidate) => candidate.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('PageDown/PageUp — на высоту прокручиваемой области без заголовка', () => {
    // Три строки по 36px: под заголовком видны две.
    scrollerHeight = 3 * 36;
    renderTable(makeModel());
    enter();

    press('PageDown');
    expect(focusedId()).toBe('t-1');
    press('PageUp');
    expect(focusedId()).toBe('d-1');
  });

  it('Enter выбирает строку с фокусом — и на строке, и на кнопке названия после клика мышью', () => {
    const { onSelect } = renderTable(makeModel());
    enter();
    press('ArrowDown');
    press('Enter');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith('p-1');

    const button = screen.getByRole('button', { name: 'Дивизион 1' });
    act(() => button.focus());
    press('Enter');
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith('d-1');
    press('ArrowDown');
    expect(focusedId()).toBe('p-1');
  });

  it('смена сортировки: фокус и место в порядке Tab остаются на том же узле, а не на позиции', () => {
    const model = makeModel();
    const { update } = renderTable(model);
    enter();
    expect(focusedId()).toBe('d-1');

    update({ ...model, dir: 'desc', rows: ROWS.toReversed().map((r) => ({ ...r })) });
    expect(rowIds()).toEqual(['t-1', 'p-1', 'd-1']);
    expect(focusedId()).toBe('d-1');
    expect(bodyRows().map((candidate) => candidate.tabIndex)).toEqual([-1, -1, 0]);

    // Стрелки идут по новому порядку.
    press('ArrowUp');
    expect(focusedId()).toBe('p-1');
  });

  it('узел с фокусом отфильтрован: фокус на ближайшей оставшейся строке; без строк фокус не возвращается', () => {
    const model = makeModel();
    const { update } = renderTable(model);
    enter();
    press('ArrowDown');
    expect(focusedId()).toBe('p-1');

    update({ ...model, rows: [ROWS[0]!, ROWS[2]!] });
    expect(focusedId()).toBe('t-1');
    expect(bodyRows().map((candidate) => candidate.tabIndex)).toEqual([-1, 0]);

    // Следующей нет — предыдущая.
    update({ ...model, rows: [ROWS[0]!] });
    expect(focusedId()).toBe('d-1');

    // Строк не осталось: фокус ушёл, и появившиеся строки его не забирают.
    update({ ...model, rows: [] });
    update(model);
    expect(document.activeElement).toBe(document.body);
    expect(bodyRows().map((candidate) => candidate.tabIndex)).toEqual([0, -1, -1]);
  });
});
