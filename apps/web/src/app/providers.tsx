import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { theme } from '@shared/theme';
import { ThemeProvider } from 'styled-components';
import { getStore } from './store/store';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Provider store={getStore()}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </Provider>
  );
}
