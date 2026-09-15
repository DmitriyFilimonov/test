import type { ReactElement } from 'react';
import { OrgDashboardPage } from './OrgDashboardPage';

/** Дескриптор маршрута как данные; роутер собирается только в @app/web. */
export const orgDashboardRoute: { path: string; element: ReactElement } = {
  path: '/',
  element: <OrgDashboardPage />,
};
