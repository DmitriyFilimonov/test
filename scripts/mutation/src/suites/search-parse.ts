import type { Suite } from '../types.ts';

const PAGE_TESTS = 'packages/pages/org-dashboard/src/OrgDashboardPage.dom.test.tsx';

export const mockApiSearchParseSuite: Suite = {
  name: 'mock-api-search-parse',
  file: 'apps/mock-api/src/search-parse.ts',
  tests: 'apps/mock-api/src/search-parse.test.ts',
  mutations: [
    {
      name: 'ответ модели используется без zod',
      from: 'const validated = filterSchema.parse(parsed);',
      to: 'const validated = parsed;',
    },
    {
      name: 'лишние поля игнорируются',
      from: 'const filterSchema = z.strictObject({',
      to: 'const filterSchema = z.object({',
    },
    {
      name: 'сбой модели выходит как 500',
      from: "console.error('LLM parse error:', error);",
      to: 'throw error;',
    },
    {
      name: 'таймаут не срабатывает',
      from: 'const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);',
      to: 'const timeout = setTimeout(() => {}, LLM_TIMEOUT_MS);',
    },
    {
      name: 'explanation из ответа модели',
      from: "explanation: buildExplanation(filter, 'structured'),",
      to: "explanation: 'structured filter',",
    },
    {
      name: 'данные узлов уходят в модель',
      from: "{ role: 'user', content: text },",
      to: "{ role: 'user', content: text + ' (узлы: Дивизион продаж, Отдел продаж)' },",
    },
    {
      name: 'при пустом ключе всё равно идёт вызов',
      from: 'if (!apiKey) {',
      to: 'if (!apiKey && !client) {',
    },
    {
      name: 'кэш не используется: одна фраза — много вызовов',
      from: 'if (cache.has(normalized)) {',
      to: 'if (false) {',
    },
    {
      name: 'неудача кэшируется: сбой закрепляет фразу за текстовым поиском',
      from: 'if (result !== null) {',
      to: 'if (true) {',
    },
  ],
};

export const entitiesStructuredFilterSuite: Suite = {
  name: 'entities-structured-filter',
  file: 'packages/entities/org-tree/src/model/structuredFilter.ts',
  tests: 'packages/entities/org-tree/src/model/structuredFilter.test.ts',
  mutations: [
    {
      name: 'условия по ИЛИ',
      from: 'if (matchesRow(row, filter)) {',
      to: 'if (Object.entries(filter).some(([key, value]) => value != null && matchesRow(row, { [key]: value }))) {',
    },
    {
      name: 'null-performance проходит minPerformance',
      from: 'if (row.totalPerformance == null || row.totalPerformance < filter.minPerformance) {',
      to: 'if (row.totalPerformance != null && row.totalPerformance < filter.minPerformance) {',
    },
    {
      name: 'null-performance проходит maxPerformance',
      from: 'if (row.totalPerformance == null || row.totalPerformance > filter.maxPerformance) {',
      to: 'if (row.totalPerformance != null && row.totalPerformance > filter.maxPerformance) {',
    },
    {
      name: 'предки не достраиваются',
      from: 'current = current.parentId == null ? undefined : nodeById.get(current.parentId);',
      to: 'current = undefined;',
    },
    {
      name: 'предки не приглушаются',
      from: 'result.push({ ...row, matches: isMatch });',
      to: 'result.push({ ...row, matches: true });',
    },
    {
      name: 'пустой фильтр — новая ссылка',
      from: 'return rows as TableRow[];',
      to: 'return [...rows];',
    },
  ],
};

export const entitiesTableStructuredFilterSuite: Suite = {
  name: 'entities-table-structured-filter',
  file: 'packages/entities/org-tree/src/model/useTableModel.ts',
  tests: PAGE_TESTS,
  mutations: [
    {
      name: 'структурный фильтр уходит в запрос и меняет ключ кэша',
      from: 'useOrgTree(params);',
      to: 'useOrgTree({ ...params, ...structuredFilter });',
    },
    {
      name: 'структурный фильтр не применяется к строкам',
      from: 'return applyStructuredFilter(baseRows, structuredFilter);',
      to: 'return baseRows;',
    },
  ],
};

export const entitiesSearchParseSuite: Suite = {
  name: 'entities-search-parse',
  file: 'packages/entities/org-tree/src/model/useSearchParse.ts',
  tests: PAGE_TESTS,
  mutations: [
    {
      name: 'разбор запускается при открытии по ссылке',
      from: 'if (!shouldParse) {',
      to: 'if (false) {',
    },
    {
      name: 'изменение текста не отменяет разбор',
      from: 'fetchParse(query, controller.signal)',
      to: 'fetchParse(query, new AbortController().signal)',
    },
    {
      name: 'сбой разбора: индикатор остаётся навсегда',
      from: "onParseResult({ mode: 'text', filter: {}, explanation: '', query });",
      to: '',
    },
  ],
};

export const pagesDashboardAiSearchSuite: Suite = {
  name: 'pages-dashboard-ai-search',
  file: 'packages/pages/org-dashboard/src/model/useOrgDashboardModel.ts',
  tests: PAGE_TESTS,
  mutations: [
    {
      name: 'structured-результат не попадает в адрес',
      from: 'setStructuredFilter(filterToUrl(result.filter));',
      to: '',
    },
    {
      name: '«искать по тексту» не подавляет повторный разбор',
      from: 'if (lastParsedQuery !== null && params.q === lastParsedQuery) {',
      to: 'if (false) {',
    },
    {
      name: '«искать по тексту» не возвращает фразу в q',
      from: "searchByText(lastParsedQuery ?? '');",
      to: 'searchByText(params.q);',
    },
    {
      name: 'снятие одного условия снимает все',
      from: 'const next: StructuredFilterUrl = { ...structuredFilter };',
      to: 'const next: StructuredFilterUrl = { levels: [] };',
    },
  ],
};

export const pagesDashboardAiSearchPageSuite: Suite = {
  name: 'pages-dashboard-ai-search-page',
  file: 'packages/pages/org-dashboard/src/OrgDashboardPage.tsx',
  tests: PAGE_TESTS,
  mutations: [
    {
      name: 'разбор блокирует текстовый поиск: таблица ждёт ответа модели',
      from: '{model.showTable && (',
      to: '{model.showTable && !model.isParsing && (',
    },
  ],
};
