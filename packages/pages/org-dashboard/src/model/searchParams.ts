import {
  DEFAULT_ORG_TREE_PARAMS,
  ORG_TABLE_SORT_COLUMNS,
  ORG_TREE_MAX_QUERY_LENGTH,
  type OrgTreeParams,
  type OrgTreeSortDirection,
} from '@entities/org-tree';

export const ORG_DASHBOARD_VIEWS = ['tree', 'table', 'split'] as const;
export type OrgDashboardView = (typeof ORG_DASHBOARD_VIEWS)[number];

/** Умолчание намерения. На узком экране split схлопывается в tree (см. resolveView). */
export const DEFAULT_VIEW: OrgDashboardView = 'split';

const SORT_DIRECTIONS: readonly OrgTreeSortDirection[] = ['asc', 'desc'];

/** Ключи адресной строки. Остальные параметры адреса хук не читает и не трогает. */
const KEYS = { q: 'q', sort: 'sort', dir: 'dir', view: 'view' } as const;

function oneOf<T extends string>(values: readonly T[], value: string | null, fallback: T): T {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

export interface DashboardSearch extends OrgTreeParams {
  view: OrgDashboardView;
}

/** Значения из адреса; отсутствующие и невалидные — умолчания. Адрес при этом не меняется. */
export function parseDashboardSearch(search: URLSearchParams): DashboardSearch {
  const q = search.get(KEYS.q) ?? DEFAULT_ORG_TREE_PARAMS.q;
  return {
    // Длиннее, чем принимает эндпоинт, — невалидно: иначе запрос с таким q всегда 400.
    q: q.length <= ORG_TREE_MAX_QUERY_LENGTH ? q : DEFAULT_ORG_TREE_PARAMS.q,
    // Только колонки, по которым таблица сортирует: sort=level эндпоинт принимает, но у
    // сгруппированной таблицы заголовок уровня без сортировки.
    sort: oneOf(ORG_TABLE_SORT_COLUMNS, search.get(KEYS.sort), DEFAULT_ORG_TREE_PARAMS.sort),
    dir: oneOf(SORT_DIRECTIONS, search.get(KEYS.dir), DEFAULT_ORG_TREE_PARAMS.dir),
    view: oneOf(ORG_DASHBOARD_VIEWS, search.get(KEYS.view), DEFAULT_VIEW),
  };
}

/** Значение пишется, только если отличается от умолчания: чистый адрес — валидное состояние. */
function put(search: URLSearchParams, key: string, value: string, fallback: string) {
  if (value === fallback) {
    search.delete(key);
  } else {
    search.set(key, value);
  }
}

/** Копия адреса с параметрами запроса. */
export function withParams(search: URLSearchParams, params: OrgTreeParams): URLSearchParams {
  const next = new URLSearchParams(search);
  put(next, KEYS.q, params.q, DEFAULT_ORG_TREE_PARAMS.q);
  put(next, KEYS.sort, params.sort, DEFAULT_ORG_TREE_PARAMS.sort);
  put(next, KEYS.dir, params.dir, DEFAULT_ORG_TREE_PARAMS.dir);
  return next;
}

/** Копия адреса с режимом просмотра. q, sort и dir не трогает. */
export function withView(search: URLSearchParams, view: OrgDashboardView): URLSearchParams {
  const next = new URLSearchParams(search);
  put(next, KEYS.view, view, DEFAULT_VIEW);
  return next;
}

/**
 * Режим на экране. URL хранит намерение, ширина его ограничивает: без места для двух панелей
 * split показывается как tree, а параметр в адресе остаётся split.
 */
export function resolveView(view: OrgDashboardView, splitAvailable: boolean): OrgDashboardView {
  return view === 'split' && !splitAvailable ? 'tree' : view;
}
