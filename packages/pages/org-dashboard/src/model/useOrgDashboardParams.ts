import type { OrgTreeParams } from '@entities/org-tree';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  parseDashboardSearch,
  parseStructuredFilterSearch,
  withParams,
  withStructuredFilter,
  withView,
  type OrgDashboardView,
  type StructuredFilterUrl,
} from './searchParams';

export interface OrgDashboardParams {
  /** Параметры запроса из адреса: тот же объект, пока значения не изменились. */
  params: OrgTreeParams;
  /** Намерение пользователя. На экране может быть другой режим (см. resolveView). */
  view: OrgDashboardView;
  /** Структурный фильтр из адреса. */
  structuredFilter: StructuredFilterUrl;
  /** Фильтр и сортировка — replace: «назад» не отматывает по символу. */
  setParams: (params: OrgTreeParams) => void;
  /** Режим — push: осознанный переход, «назад» к нему возвращает. */
  setView: (view: OrgDashboardView) => void;
  /** Применить структурный фильтр — replace. */
  setStructuredFilter: (filter: StructuredFilterUrl) => void;
  /** Снять структурный фильтр целиком. */
  clearStructuredFilter: () => void;
  /** Снять структурный фильтр и записать текст в q — одной навигацией, replace. */
  searchByText: (q: string) => void;
}

/**
 * Адресная строка — источник правды для q, sort, dir, view и структурного фильтра.
 * Значения читаются из неё на каждом рендере и в состоянии React не дублируются.
 */
export function useOrgDashboardParams(): OrgDashboardParams {
  const [searchParams, setSearchParams] = useSearchParams();
  const { q, sort, dir, view } = parseDashboardSearch(searchParams);
  const structuredFilter = parseStructuredFilterSearch(searchParams);
  const params = useMemo(() => ({ q, sort, dir }), [q, sort, dir]);

  // Та же строка адреса — навигации нет: ни лишнего рендера, ни записи в истории.
  const navigate = useCallback(
    (next: URLSearchParams, replace: boolean) => {
      if (next.toString() !== searchParams.toString()) {
        setSearchParams(next, { replace });
      }
    },
    [searchParams, setSearchParams],
  );

  const setParams = useCallback(
    (next: OrgTreeParams) => navigate(withParams(searchParams, next), true),
    [navigate, searchParams],
  );

  const setView = useCallback(
    (next: OrgDashboardView) => navigate(withView(searchParams, next), false),
    [navigate, searchParams],
  );

  const setStructuredFilter = useCallback(
    (filter: StructuredFilterUrl) => navigate(withStructuredFilter(searchParams, filter), true),
    [navigate, searchParams],
  );

  const clearStructuredFilter = useCallback(
    () => navigate(withStructuredFilter(searchParams, { levels: [] }), true),
    [navigate, searchParams],
  );

  const searchByText = useCallback(
    (text: string) => {
      const withoutFilter = withStructuredFilter(searchParams, { levels: [] });
      navigate(withParams(withoutFilter, { ...params, q: text }), true);
    },
    [navigate, searchParams, params],
  );

  return useMemo(
    () => ({
      params,
      view,
      structuredFilter,
      setParams,
      setView,
      setStructuredFilter,
      clearStructuredFilter,
      searchByText,
    }),
    [
      params,
      view,
      structuredFilter,
      setParams,
      setView,
      setStructuredFilter,
      clearStructuredFilter,
      searchByText,
    ],
  );
}
