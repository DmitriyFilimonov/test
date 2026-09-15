import { fixupPluginRules } from '@eslint/compat';
import js from '@eslint/js';
import typedReduxSaga from '@jambit/eslint-plugin-typed-redux-saga';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import { createNodeResolver, importX } from 'eslint-plugin-import-x';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Слои FSD снизу вверх. Слой может импортировать только слои ниже себя.
 * Слой пакета определяется его каталогом (packages/<layer>/*),
 * слой импорта — npm-скоупом (@<layer>/*).
 */
const LAYERS = ['shared', 'entities', 'features', 'widgets', 'pages'];

/**
 * Критический путь рендеринга: стили не создаются в рендере и не пишутся инлайном,
 * геометрия не читается из DOM (принудительный пересчёт макета).
 */
const RENDERING_SELECTORS = [
  ...[
    "TaggedTemplateExpression[tag.object.name='styled']",
    "TaggedTemplateExpression[tag.callee.name='styled']",
    "TaggedTemplateExpression[tag.callee.object.object.name='styled']",
    'TaggedTemplateExpression[tag.name=/^(css|keyframes|createGlobalStyle)$/]',
  ].map((selector) => ({
    selector: `:function ${selector}`,
    message:
      'styled-components объявляются на верхнем уровне модуля: внутри функции это новый тип компонента на каждый рендер.',
  })),
  ...[
    "AssignmentExpression > MemberExpression.left[object.property.name='style']",
    "AssignmentExpression > MemberExpression.left[property.name='style']",
    "CallExpression[callee.object.property.name='style']",
    "CallExpression[callee.property.name='setAttribute'][arguments.0.value='style']",
  ].map((selector) => ({
    selector,
    message: 'Инлайн-стилей нет: только классы styled-components и SVG-атрибуты геометрии.',
  })),
];

const LAYOUT_READS = [
  'getBoundingClientRect',
  'getClientRects',
  'getComputedStyle',
  'offsetWidth',
  'offsetHeight',
  'offsetTop',
  'offsetLeft',
  'clientWidth',
  'clientHeight',
  'scrollWidth',
  'scrollHeight',
].map((property) => ({
  property,
  message: 'Размеры не читаются из DOM: это принудительный пересчёт макета. Размер узла — из темы.',
}));

const layerBoundaries = LAYERS.map((layer, index) => {
  const forbidden = [...LAYERS.slice(index + 1), 'app'];
  return {
    name: `boundaries/${layer}`,
    files: [`packages/${layer}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `^@(${forbidden.join('|')})(/|$)`,
              message: `Слой "${layer}" не может импортировать вышележащие слои (${forbidden
                .map((l) => `@${l}`)
                .join(', ')}).`,
            },
            ...(layer === 'pages'
              ? [
                  {
                    regex: '^(react-redux|redux|redux-saga|@reduxjs/toolkit)(/|$)',
                    message:
                      'Страница не обращается к стору напрямую — только через публичные хуки пакетов @entities/*.',
                  },
                ]
              : []),
          ],
        },
      ],
    },
  };
});

export default defineConfig(
  globalIgnores(['**/dist/', '**/node_modules/', '**/.nx/']),

  {
    name: 'base',
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    // import-x регистрируется под неймспейсом "import": имена правил — import/*.
    plugins: { import: importX },
    settings: {
      // Без extensions/parsers import-x не разбирает .ts-файлы при построении графа
      // модулей, и import/no-cycle молча ничего не находит.
      'import-x/extensions': ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
      'import-x/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx'] },
      'import-x/resolver-next': [
        createNodeResolver({
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'],
          conditionNames: ['types', 'import', 'default'],
        }),
      ],
    },
    rules: {
      'import/no-extraneous-dependencies': [
        'error',
        // Workspace-пакеты резолвятся по симлинку в packages/*, т.е. вне node_modules,
        // и import-x считает их "internal". Без includeInternal они не проверялись бы.
        { includeInternal: true, includeTypes: true },
      ],
      'import/no-cycle': 'error',
      // Ловит глубокие импорты в обход "exports" (@shared/lib/src/...) уже на уровне линтера.
      'import/no-unresolved': 'error',
      'import/no-relative-packages': 'error',
    },
  },

  {
    name: 'typed-redux-saga',
    files: ['**/*.{ts,tsx}'],
    // Плагин (0.4.0, 2022) вызывает context.getSourceCode(), удалённый в ESLint 10;
    // fixupPluginRules добавляет совместимые методы контекста.
    plugins: { '@jambit/typed-redux-saga': fixupPluginRules(typedReduxSaga) },
    rules: {
      '@jambit/typed-redux-saga/use-typed-effects': ['error', 'default'],
      '@jambit/typed-redux-saga/delegate-effects': 'error',
    },
  },

  {
    name: 'node-configs',
    files: ['**/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },

  {
    name: 'node',
    files: ['apps/mock-api/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  {
    name: 'rendering',
    files: ['packages/**/*.{ts,tsx}', 'apps/web/src/**/*.{ts,tsx}'],
    plugins: { react: fixupPluginRules(react) },
    settings: { react: { version: '19.3' } },
    rules: {
      'react/forbid-dom-props': ['error', { forbid: ['style'] }],
      'react/forbid-component-props': ['error', { forbid: ['style'] }],
      'no-restricted-syntax': ['error', ...RENDERING_SELECTORS],
      'no-restricted-properties': ['error', ...LAYOUT_READS],
      'no-restricted-globals': ['error', 'getComputedStyle'],
    },
  },

  {
    name: 'packages',
    files: ['packages/**/*.{ts,tsx}'],
    rules: {
      // Правило целиком переопределяет блок rendering, поэтому его селекторы повторены.
      'no-restricted-syntax': [
        'error',
        ...RENDERING_SELECTORS,
        {
          selector:
            "MemberExpression[object.type='MetaProperty'][object.meta.name='import'][property.name='env']",
          message:
            'Пакеты не читают import.meta.env: конфигурация приходит через провайдер из @app/web.',
        },
      ],
    },
  },

  ...layerBoundaries,

  prettier,
);
