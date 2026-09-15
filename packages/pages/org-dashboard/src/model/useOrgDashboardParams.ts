import type { OrgTreeParams } from '@entities/org-tree';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { parseDashboardSearch, withParams, withView, type OrgDashboardView } from './searchParams';

export interface OrgDashboardParams {
  /** Параметры запроса из адреса: тот же объект, пока значения не изменились. */
  params: OrgTreeParams;
  /** Намерение пользователя. На экране может быть другой режим (см. resolveView). */
  view: OrgDashboardView;
  /** Фильтр и сортировка — replace: «назад» не отматывает по символу. */
  setParams: (params: OrgTreeParams) => void;
  /** Режим — push: осознанный переход, «назад» к нему возвращает. */
  setView: (view: OrgDashboardView) => void;
}

/**
 * Адресная строка — источник правды для q, sort, dir и view. Значения читаются из неё на
 * каждом рендере и в состоянии React не дублируются.
 */
export function useOrgDashboardParams(): OrgDashboardParams {
  const [searchParams, setSearchParams] = useSearchParams();
  const { q, sort, dir, view } = parseDashboardSearch(searchParams);
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

  return useMemo(() => ({ params, view, setParams, setView }), [params, view, setParams, setView]);
}
