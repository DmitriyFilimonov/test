import { aboutRoute } from '@pages/about';
import { orgDashboardRoute } from '@pages/org-dashboard';
import { createBrowserRouter } from 'react-router';
import { AppLayout } from './AppLayout';

let router: ReturnType<typeof createBrowserRouter> | undefined;

/** Роутер создаётся при первом рендере, а не при импорте модуля (см. getStore). */
export function getRouter() {
  router ??= createBrowserRouter([
    { element: <AppLayout />, children: [orgDashboardRoute, aboutRoute] },
  ]);
  return router;
}
