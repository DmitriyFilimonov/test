import type { Suite } from '../types.ts';

const PAGE_TESTS = 'packages/pages/org-dashboard';

export const pagesDashboardModelSuite: Suite = {
  name: 'pages-dashboard-model',
  file: 'packages/pages/org-dashboard/src/model/useOrgDashboardModel.ts',
  tests: PAGE_TESTS,
  mutations: [
    { name: 'предки не раскрываются', from: '      expandAncestors(id);\n', to: '' },
    {
      name: 'раскрытие только при смене выделения: повторный клик после сворачивания не раскрывает',
      from: '      expandAncestors(id);\n',
      to: '      if (id !== selection.selectedId) {\n        expandAncestors(id);\n      }\n',
    },
    {
      name: 'при < 1280px смонтированы оба представления',
      from: "    showTable: effectiveView !== 'tree',",
      to: "    showTable: view !== 'tree',",
    },
    {
      name: 'схлопывание split переписывает URL',
      from: '  const effectiveView = resolveView(view, splitAvailable);\n',
      to: '  const effectiveView = resolveView(view, splitAvailable);\n  if (effectiveView !== view) {\n    queueMicrotask(() => setView(effectiveView));\n  }\n',
    },
    {
      name: 'в режиме tree узлы приглушаются',
      from: "    dimUnmatched: effectiveView !== 'tree',",
      to: '    dimUnmatched: true,',
    },
    {
      name: 'выбор в дереве не прокручивает таблицу',
      from: '      return { ...current, selectedId: id, nonce, tableReveal: { id, nonce } };',
      to: '      return { ...current, selectedId: id, nonce };',
    },
    {
      name: 'split в переключателе и на узком экране',
      from: '    views: splitAvailable ? ORG_DASHBOARD_VIEWS : NARROW_VIEWS,',
      to: '    views: ORG_DASHBOARD_VIEWS,',
    },
  ],
};

export const pagesDashboardPageSuite: Suite = {
  name: 'pages-dashboard-page',
  file: 'packages/pages/org-dashboard/src/OrgDashboardPage.tsx',
  tests: PAGE_TESTS,
  mutations: [
    {
      name: 'выделение не передаётся в дерево',
      from: '              selectedId={model.selectedId}\n              onSelect={model.selectFromTree}',
      to: '              selectedId={null}\n              onSelect={model.selectFromTree}',
    },
    {
      name: 'выбор строки не доходит до страницы',
      from: '              onSelect={model.selectFromTable}',
      to: '              onSelect={() => {}}',
    },
  ],
};

export const pagesDashboardParamsSuite: Suite = {
  name: 'pages-dashboard-params',
  file: 'packages/pages/org-dashboard/src/model/useOrgDashboardParams.ts',
  tests: PAGE_TESTS,
  mutations: [
    {
      name: 'изменение q делает push вместо replace',
      from: 'navigate(withParams(searchParams, next), true)',
      to: 'navigate(withParams(searchParams, next), false)',
    },
    {
      name: 'изменение view делает replace вместо push',
      from: 'navigate(withView(searchParams, next), false)',
      to: 'navigate(withView(searchParams, next), true)',
    },
  ],
};

export const pagesDashboardSearchSuite: Suite = {
  name: 'pages-dashboard-search',
  file: 'packages/pages/org-dashboard/src/model/searchParams.ts',
  tests: PAGE_TESTS,
  mutations: [
    {
      name: 'переключение в tree стирает q',
      from: '  put(next, KEYS.view, view, DEFAULT_VIEW);\n',
      to: "  put(next, KEYS.view, view, DEFAULT_VIEW);\n  if (view === 'tree') {\n    next.delete(KEYS.q);\n  }\n",
    },
    {
      name: 'sort=level из адреса принимается',
      from: 'oneOf(ORG_TABLE_SORT_COLUMNS, search.get(KEYS.sort)',
      to: "oneOf(['level', ...ORG_TABLE_SORT_COLUMNS], search.get(KEYS.sort)",
    },
    {
      name: 'умолчания пишутся в адрес',
      from: '  if (value === fallback) {',
      to: '  if (false) {',
    },
    {
      name: 'невалидные sort, dir и view не заменяются умолчаниями',
      from: '(values as readonly string[]).includes(value)',
      to: 'true',
    },
    {
      name: 'q длиннее лимита эндпоинта не заменяется',
      from: '    q: q.length <= ORG_TREE_MAX_QUERY_LENGTH ? q : DEFAULT_ORG_TREE_PARAMS.q,',
      to: '    q,',
    },
    {
      name: 'split не схлопывается на узком экране',
      from: "  return view === 'split' && !splitAvailable ? 'tree' : view;",
      to: '  return view;',
    },
  ],
};

export const pagesSplitAvailableSuite: Suite = {
  name: 'pages-split-available',
  file: 'packages/pages/org-dashboard/src/model/useSplitAvailable.ts',
  tests: PAGE_TESTS,
  mutations: [
    {
      name: 'смена ширины не отслеживается',
      from: "  list.addEventListener('change', onChange);\n",
      to: '',
    },
    {
      name: 'граница по max-width: широкий и узкий экраны перепутаны',
      from: "'(min-width: 1280px)'",
      to: "'(max-width: 1279px)'",
    },
  ],
};
