import type { ReactElement } from 'react';
import { AboutPage } from './AboutPage';

export const aboutRoute: { path: string; element: ReactElement } = {
  path: '/about',
  element: <AboutPage />,
};
