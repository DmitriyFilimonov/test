import { defineConfig } from 'vitest/config';

/** Тесты, которым нужен DOM, помечены суффиксом: остальные идут в node без jsdom. */
const DOM_TESTS = '**/*.dom.test.{ts,tsx}';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', '**/dist/**', DOM_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: [DOM_TESTS],
          exclude: ['**/node_modules/**', '**/dist/**'],
          setupFiles: ['./vitest.dom-setup.ts'],
        },
      },
    ],
  },
});
