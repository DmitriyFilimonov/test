import babel from '@rolldown/plugin-babel';
import react from '@vitejs/plugin-react';
import { defineConfig, type ProxyOptions } from 'vite';

const apiProxy: Record<string, ProxyOptions> = {
  // MOCK_API_URL — чтобы поднять второй экземпляр мок-сервера на другом порту.
  '/api': { target: process.env.MOCK_API_URL ?? 'http://localhost:3001' },
};

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // displayName/fileName для styled-components нужны только в dev-сервере.
    command === 'serve' &&
      babel({
        plugins: [['babel-plugin-styled-components', { displayName: true, fileName: true }]],
      }),
  ],
  resolve: {
    // react-redux тоже: две копии дают два контекста, и хуки из пакетов не увидят Provider.
    dedupe: ['react', 'react-dom', 'styled-components', 'react-redux'],
  },
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
}));
