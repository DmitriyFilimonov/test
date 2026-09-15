import { RouterProvider } from 'react-router/dom';
import { Providers } from './providers';
import { getRouter } from './router';

export function App() {
  return (
    <Providers>
      <RouterProvider router={getRouter()} />
    </Providers>
  );
}
