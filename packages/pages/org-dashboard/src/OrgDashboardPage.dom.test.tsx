// eslint-disable-next-line no-restricted-imports -- тест собирает стор, как это делает @app/web
import { combineSlices, configureStore } from '@reduxjs/toolkit';
import { orgTreeSaga, orgTreeSlice, type OrgNode } from '@entities/org-tree';
import { theme } from '@shared/theme';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
// eslint-disable-next-line no-restricted-imports -- тест собирает стор, как это делает @app/web
import { Provider } from 'react-redux';
import {
  MemoryRouter,
  useLocation,
  useNavigate,
  useNavigationType,
  type NavigateFunction,
} from 'react-router';
// eslint-disable-next-line no-restricted-imports -- тест собирает стор, как это делает @app/web
import createSagaMiddleware from 'redux-saga';
import { ThemeProvider } from 'styled-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrgDashboardPage } from './OrgDashboardPage';

type Seed = [id: string, name: string, parentId: string | null];

// Дивизион продаж → Отдел продаж (Команда Альфа, Команда Бета), Отдел маркетинга;
// Дивизион разработки → Отдел платформы (Команда ядра).
const SEEDS: Seed[] = [
  ['d-1', 'Дивизион продаж', null],
  ['p-1', 'Отдел продаж', 'd-1'],
  ['t-1', 'Команда Альфа', 'p-1'],
  ['t-2', 'Команда Бета', 'p-1'],
  ['p-2', 'Отдел маркетинга', 'd-1'],
  ['d-2', 'Дивизион разработки', null],
  ['p-3', 'Отдел платформы', 'd-2'],
  ['t-3', 'Команда ядра', 'p-3'],
];

/** Ответ как у сервера: все узлы, matches — по собственному имени, order — позиция. */
function respond(url: URL): OrgNode[] {
  const q = (url.searchParams.get('q') ?? '').toLowerCase();
  return SEEDS.map(([id, name, parentId], index) => ({
    id,
    name,
    parentId,
    headcount: 1,
    budget: 100,
    performance: 50,
    updatedAt: '2026-01-01T00:00:00.000Z',
    matches: name.toLowerCase().includes(q),
    order: index,
  }));
}

const probe: { search: string; type: string; navigate: NavigateFunction | null } = {
  search: '',
  type: '',
  navigate: null,
};

function LocationProbe() {
  const location = useLocation();
  const type = useNavigationType();
  const navigate = useNavigate();
  useEffect(() => {
    probe.search = location.search;
    probe.type = type;
    probe.navigate = navigate;
  });
  return null;
}

let width = 1440;
const mediaListeners = new Set<() => void>();

/** Заглушка вычисляет запрос сама: константа из исходника в тесте не используется. */
function evaluateMedia(query: string): boolean {
  const match = /^\((min|max)-width: (\d+)px\)$/.exec(query);
  if (!match) {
    throw new Error(`Неожиданный медиазапрос: ${query}`);
  }
  const limit = Number(match[2]);
  return match[1] === 'min' ? width >= limit : width <= limit;
}

function resize(next: number) {
  act(() => {
    width = next;
    mediaListeners.forEach((listener) => listener());
  });
}

let requests: URLSearchParams[] = [];
const scrollIntoView = vi.fn();

beforeEach(() => {
  width = 1440;
  requests = [];
  vi.stubGlobal('matchMedia', (query: string) => {
    return {
      media: query,
      get matches() {
        return evaluateMedia(query);
      },
      addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
    };
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input, 'http://localhost');
      requests.push(url.searchParams);
      return Response.json(respond(url));
    }),
  );
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  vi.unstubAllGlobals();
  mediaListeners.clear();
  scrollIntoView.mockReset();
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

function renderPage(url: string) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: combineSlices(orgTreeSlice),
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
  });
  sagaMiddleware.run(orgTreeSaga);
  return render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={[url]}>
          <OrgDashboardPage />
          <LocationProbe />
        </MemoryRouter>
      </ThemeProvider>
    </Provider>,
  );
}

const search = () => new URLSearchParams(probe.search);
const radios = () => within(screen.getByRole('radiogroup')).getAllByRole<HTMLInputElement>('radio');
const checkedView = () => radios().find((radio) => radio.checked)?.value;
const radio = (name: string) => screen.getByRole('radio', { name });
const tree = () => screen.getByLabelText('Оргструктура');
const treeCard = (id: string) => tree().querySelector<HTMLElement>(`[data-id="${id}"]`);
const table = () => screen.getByRole('table');
const tableRow = (id: string) => table().querySelector<HTMLElement>(`tr[data-id="${id}"]`);
const searchbox = () => screen.getByRole<HTMLInputElement>('searchbox');
const typeQuery = (value: string) => fireEvent.change(searchbox(), { target: { value } });
/** Дерево и строки таблицы с данными на экране. */
const loaded = async (url: string) => {
  const view = renderPage(url);
  await waitFor(() => {
    expect(screen.queryByLabelText('Оргструктура') ?? screen.queryByRole('table')).not.toBeNull();
    const t = screen.queryByRole('table');
    if (t) {
      expect(t.querySelector('tr[data-id]')).not.toBeNull();
    }
  });
  return view;
};

describe('OrgDashboardPage: параметры в адресной строке', () => {
  it('парсинг: q, sort, dir и view из адреса применяются к запросу, полю, заголовку и режиму', async () => {
    await loaded('/?q=Отдел&sort=totalBudget&dir=desc&view=table');

    expect(screen.queryByLabelText('Оргструктура')).toBeNull();
    expect(searchbox().value).toBe('Отдел');
    expect(
      screen.getByRole('columnheader', { name: /^Бюджет суммарный/ }).getAttribute('aria-sort'),
    ).toBe('descending');
    expect(checkedView()).toBe('table');
    expect(requests.at(-1)?.toString()).toBe(
      new URLSearchParams({ q: 'Отдел', sort: 'totalBudget', dir: 'desc' }).toString(),
    );
  });

  it('невалидные значения заменяются умолчаниями, адрес при чтении не переписывается', async () => {
    const longQuery = 'а'.repeat(201);
    const url = `/?q=${longQuery}&sort=bogus&dir=up&view=grid`;
    await loaded(url);
    await screen.findByLabelText('Оргструктура');

    expect(searchbox().value).toBe('');
    expect(
      screen.getByRole('columnheader', { name: /^Подразделение/ }).getAttribute('aria-sort'),
    ).toBe('ascending');
    expect(checkedView()).toBe('split');
    expect(requests.at(-1)?.toString()).toBe('q=&sort=name&dir=asc');
    expect([...search()]).toEqual([
      ['q', longQuery],
      ['sort', 'bogus'],
      ['dir', 'up'],
      ['view', 'grid'],
    ]);
  });

  it('sort=level — невалидно: у сгруппированной таблицы уровень не сортируется', async () => {
    await loaded('/?sort=level&dir=desc&view=table');

    expect(
      screen.getByRole('columnheader', { name: /^Подразделение/ }).getAttribute('aria-sort'),
    ).toBe('descending');
    expect(requests.at(-1)?.toString()).toBe('q=&sort=name&dir=desc');
    expect(search().get('sort')).toBe('level');
  });

  it('умолчания не пишутся в адрес', async () => {
    await loaded('/');
    const nameSort = () =>
      within(screen.getByRole('columnheader', { name: /^Подразделение/ })).getByRole('button');

    fireEvent.click(nameSort());
    await waitFor(() => expect(probe.search).toBe('?dir=desc'));
    fireEvent.click(nameSort());
    await waitFor(() => expect(probe.search).toBe(''));

    fireEvent.click(radio('Таблица'));
    await waitFor(() => expect(probe.search).toBe('?view=table'));
    fireEvent.click(radio('Дерево и таблица'));
    await waitFor(() => expect(probe.search).toBe(''));
  });

  it('изменение q — replace, изменение view — push: «назад» возвращает к прежнему режиму, а не к символу', async () => {
    await loaded('/');

    typeQuery('К');
    typeQuery('Ком');
    await waitFor(() => expect(search().get('q')).toBe('Ком'));
    expect(probe.type).toBe('REPLACE');

    fireEvent.click(radio('Таблица'));
    await waitFor(() => expect(search().get('view')).toBe('table'));
    expect(probe.type).toBe('PUSH');
    expect(search().get('q')).toBe('Ком');

    typeQuery('Коман');
    await waitFor(() => expect(search().get('q')).toBe('Коман'));
    typeQuery('Команда');
    await waitFor(() => expect(search().get('q')).toBe('Команда'));
    expect(probe.type).toBe('REPLACE');

    // В истории две записи: исходная (q заменялся в ней) и переход в table (q заменялся в ней).
    act(() => void probe.navigate!(-1));
    await waitFor(() => expect([...search()]).toEqual([['q', 'Ком']]));
    expect(probe.type).toBe('POP');
    expect(searchbox().value).toBe('Ком');
    expect(checkedView()).toBe('split');
  });
});

describe('OrgDashboardPage: режимы просмотра', () => {
  it('matchMedia ≥ 1280 и view=split — оба представления в документе, в переключателе три кнопки', async () => {
    await loaded('/?view=split');
    await screen.findByLabelText('Оргструктура');

    expect(table()).toBeDefined();
    expect(radios().map((input) => input.value)).toEqual(['tree', 'table', 'split']);
    expect(checkedView()).toBe('split');
  });

  it('matchMedia < 1280 и view=split — показано дерево, две кнопки, параметр в адресе остался split', async () => {
    width = 1000;
    await loaded('/?view=split');
    await screen.findByLabelText('Оргструктура');

    expect(screen.queryByRole('table')).toBeNull();
    expect(radios().map((input) => input.value)).toEqual(['tree', 'table']);
    expect(checkedView()).toBe('tree');
    expect(probe.search).toBe('?view=split');
  });

  it('возврат на широкий экран восстанавливает split, дерево не перемонтируется и запроса нет', async () => {
    await loaded('/');
    const svg = await screen.findByLabelText('Оргструктура');
    const requestCount = requests.length;

    resize(1279);
    expect(screen.queryByRole('table')).toBeNull();
    expect(radios()).toHaveLength(2);
    expect(probe.search).toBe('');

    resize(1280);
    expect(await screen.findByRole('table')).toBeDefined();
    expect(radios()).toHaveLength(3);
    expect(checkedView()).toBe('split');
    expect(tree()).toBe(svg);
    expect(requests).toHaveLength(requestCount);
  });

  it('переключение режимов не перемонтирует оставшееся представление и не делает новых запросов', async () => {
    await loaded('/');
    const svg = await screen.findByLabelText('Оргструктура');
    const tableElement = table();
    const requestCount = requests.length;

    fireEvent.click(radio('Дерево'));
    await waitFor(() => expect(screen.queryByRole('table')).toBeNull());
    expect(tree()).toBe(svg);

    fireEvent.click(radio('Дерево и таблица'));
    await screen.findByRole('table');
    fireEvent.click(radio('Таблица'));
    await waitFor(() => expect(screen.queryByLabelText('Оргструктура')).toBeNull());
    const shownTable = table();

    // Обновление адреса сортировкой: та же таблица, не новая.
    fireEvent.click(
      within(screen.getByRole('columnheader', { name: /^Всего сотрудников/ })).getByRole('button'),
    );
    await waitFor(() => expect(search().get('sort')).toBe('totalHeadcount'));
    expect(table()).toBe(shownTable);
    expect(tableElement).not.toBe(shownTable);
    expect(requests.length - requestCount).toBe(1);
  });
});

describe('OrgDashboardPage: фильтр и дерево', () => {
  it('view=tree при непустом q — узлы не приглушены, q в адресе на месте', async () => {
    await loaded('/?view=tree&q=Отдел');
    await screen.findByLabelText('Оргструктура');

    expect(tree().querySelectorAll('[data-dimmed="true"]')).toHaveLength(0);
    expect(treeCard('d-1')!.dataset.dimmed).toBe('false');
    expect(search().get('q')).toBe('Отдел');
  });

  it('view=split при непустом q — несовпавшие узлы приглушены, совпавшие нет', async () => {
    await loaded('/?q=Отдел');
    await screen.findByLabelText('Оргструктура');

    await waitFor(() => expect(treeCard('d-1')!.dataset.dimmed).toBe('true'));
    expect(treeCard('p-1')!.dataset.dimmed).toBe('false');
    expect(treeCard('p-3')!.dataset.dimmed).toBe('false');
  });

  it('переключение в tree не стирает q и снимает приглушение; возврат в split возвращает его', async () => {
    await loaded('/?q=Отдел');
    await waitFor(() => expect(treeCard('d-1')!.dataset.dimmed).toBe('true'));

    fireEvent.click(radio('Дерево'));
    await waitFor(() => expect(search().get('view')).toBe('tree'));
    expect(search().get('q')).toBe('Отдел');
    expect(treeCard('d-1')!.dataset.dimmed).toBe('false');

    fireEvent.click(radio('Дерево и таблица'));
    await waitFor(() => expect(search().has('view')).toBe(false));
    expect(search().get('q')).toBe('Отдел');
    expect(treeCard('d-1')!.dataset.dimmed).toBe('true');
    expect(searchbox().value).toBe('Отдел');
  });

  it('очистка фильтра из таблицы убирает q из адреса', async () => {
    await loaded('/?q=Отдел&view=table');

    fireEvent.click(screen.getByRole('button', { name: 'Очистить' }));
    await waitFor(() => expect(search().has('q')).toBe(false));
    expect(probe.search).toBe('?view=table');
  });
});

describe('OrgDashboardPage: выделение', () => {
  const clickRow = (name: string) => fireEvent.click(within(table()).getByRole('button', { name }));

  it('клик по строке раскрывает предков и выделяет узел в дереве и в таблице', async () => {
    await loaded('/');
    await screen.findByLabelText('Оргструктура');
    expect(treeCard('t-1')).toBeNull();

    clickRow('Команда Альфа');
    expect(treeCard('t-1')!.dataset.selected).toBe('true');
    expect(within(tree()).getByRole('button', { name: 'Свернуть: Отдел продаж' })).toBeDefined();
    expect(tableRow('t-1')!.dataset.selected).toBe('true');
    // Выбор из таблицы таблицу не прокручивает: строка под курсором.
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('повторный клик по той же строке после ручного сворачивания раскрывает снова', async () => {
    await loaded('/');
    await screen.findByLabelText('Оргструктура');

    clickRow('Команда Альфа');
    fireEvent.click(within(tree()).getByRole('button', { name: 'Свернуть: Отдел продаж' }));
    expect(treeCard('t-1')).toBeNull();

    clickRow('Команда Альфа');
    expect(treeCard('t-1')!.dataset.selected).toBe('true');
  });

  it('клик по узлу дерева выделяет строку и прокручивает к ней', async () => {
    await loaded('/');
    await screen.findByLabelText('Оргструктура');

    fireEvent.click(within(tree()).getByRole('button', { name: 'Отдел маркетинга' }));
    expect(treeCard('p-2')!.dataset.selected).toBe('true');
    expect(tableRow('p-2')!.dataset.selected).toBe('true');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(tableRow('p-2'));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('клик по узлу, отсутствующему в таблице, выделяет его в дереве и не роняет приложение', async () => {
    await loaded('/?q=Команда');
    // Дивизион — строка контекста (в нём есть совпавшие команды), отдел маркетинга — без них.
    await waitFor(() => expect(tableRow('p-2')).toBeNull());
    expect(tableRow('d-1')!.dataset.matches).toBe('false');
    const rowsBefore = table().querySelectorAll('tr[data-id]').length;

    fireEvent.click(within(tree()).getByRole('button', { name: 'Отдел маркетинга' }));
    expect(treeCard('p-2')!.dataset.selected).toBe('true');
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(table().querySelectorAll('tr[data-id]')).toHaveLength(rowsBefore);
    expect(table().querySelector('[data-selected="true"]')).toBeNull();
  });

  it('в режиме table клик по строке режим не переключает; выделение видно при возврате', async () => {
    await loaded('/?view=table');

    clickRow('Команда Альфа');
    expect(tableRow('t-1')!.dataset.selected).toBe('true');
    expect(probe.search).toBe('?view=table');
    expect(checkedView()).toBe('table');

    fireEvent.click(radio('Дерево и таблица'));
    await screen.findByLabelText('Оргструктура');
    expect(treeCard('t-1')!.dataset.selected).toBe('true');
  });
});
