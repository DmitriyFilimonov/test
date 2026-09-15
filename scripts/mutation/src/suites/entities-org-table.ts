import type { Suite } from '../types.ts';

const MODEL_TESTS = 'packages/entities/org-tree/src/model/useTableModel.dom.test.tsx';
const TABLE_TESTS = 'packages/entities/org-tree/src/ui/OrgTable.dom.test.tsx';

export const entitiesTableModelSuite: Suite = {
  name: 'entities-table-model',
  file: 'packages/entities/org-tree/src/model/useTableModel.ts',
  tests: MODEL_TESTS,
  mutations: [
    {
      name: 'дебаунс убран (каждый символ сразу уходит в params)',
      from: 'const timer = setTimeout(() => applyQuery(draftQuery), TABLE_QUERY_DEBOUNCE_MS);',
      to: 'applyQuery(draftQuery);\n    const timer = undefined;',
    },
    {
      name: 'таймер не очищается при размонтировании',
      from: '    return () => clearTimeout(timer);\n',
      to: '',
    },
    {
      name: 'toggleSort по той же колонке не переворачивает dir',
      from: ": params.dir === 'asc' ? 'desc' : 'asc';",
      to: ': params.dir;',
    },
    {
      name: 'toggleSort по другой колонке сохраняет прежний dir',
      from: "column !== params.sort ? 'asc'",
      to: 'column !== params.sort ? params.dir',
    },
    {
      name: 'toggleSort дебаунсится',
      from: 'onParamsChange({ ...params, sort: column, dir });',
      to: 'setTimeout(() => onParamsChange({ ...params, sort: column, dir }), TABLE_QUERY_DEBOUNCE_MS);',
    },
    {
      name: 'внешнее изменение q не синхронизирует инпут',
      from: '      setDraftQuery(params.q);\n',
      to: '',
    },
    {
      name: 'вернувшееся своё q затирает набранное дальше',
      from: 'if (params.q !== sentQuery) {',
      to: 'if (true) {',
    },
    {
      name: 'отложенная отправка берёт params момента ввода (затирает сортировку)',
      from: 'const applyQuery = useEffectEvent((query: string) => {',
      to: 'const applyQuery = ((query: string) => {',
    },
    {
      name: 'clearQuery ждёт паузу дебаунса',
      from: "      setSentQuery('');\n      onParamsChange({ ...params, q: '' });\n",
      to: '',
    },
    {
      name: 'isPlaceholder игнорируется: строки пустеют до ответа',
      from: '      rows,\n      sort: params.sort,',
      to: '      rows: isPlaceholder ? [] : rows,\n      sort: params.sort,',
    },
    {
      name: 'ошибка без данных показывается как загрузка',
      from: "isLoading: !hasData && status !== 'error',",
      to: 'isLoading: !hasData,',
    },
  ],
};

export const entitiesOrgTableSuite: Suite = {
  name: 'entities-org-table',
  file: 'packages/entities/org-tree/src/ui/OrgTable.tsx',
  tests: TABLE_TESTS,
  mutations: [
    {
      name: 'aria-sort не обновляется (memo заголовка сравнивает только колонку)',
      from: '    </HeaderCell>\n  );\n});',
      to: '    </HeaderCell>\n  );\n}, (prev, next) => prev.column === next.column);',
    },
    {
      name: 'направление только глифом: aria-label кнопки без направления',
      from: 'aria-label={`${label}, ${SORT_LABELS[direction]}`}',
      to: 'aria-label={label}',
    },
    {
      name: 'isPlaceholder игнорируется: вместо прежних строк скелетон',
      from: 'if (model.isLoading) {',
      to: 'if (model.isLoading || model.isPlaceholder) {',
    },
    {
      name: 'приглушаются строки при любой ревалидации, а не только прежнего ключа',
      from: 'data-placeholder={model.isPlaceholder}',
      to: 'data-placeholder={model.isValidating}',
    },
    {
      name: 'правило приглушения не приглушает',
      from: "&[data-placeholder='true'] > tbody {\n    opacity: 0.55;",
      to: "&[data-placeholder='true'] > tbody {\n    opacity: 1;",
    },
    {
      name: 'клик по ячейке строки не выбирает (только по кнопке названия)',
      from: ".closest<HTMLElement>('tr[data-id]')",
      to: ".closest<HTMLElement>('button')?.closest<HTMLElement>('tr[data-id]')",
    },
    {
      name: 'пустой результат — пустая строка без сообщения',
      from: '<MessageCell colSpan={ORG_TABLE_COLUMNS.length}>{message}</MessageCell>',
      to: '<MessageCell colSpan={ORG_TABLE_COLUMNS.length} />',
    },
    {
      name: 'уровень сортируется, как остальные колонки',
      from: "column === 'level' ? (",
      to: 'false ? (',
    },
    {
      name: 'пустой ответ показывается как «Ничего не найдено»',
      from: ": model.isEmpty\n        ? 'В оргструктуре пока нет подразделений'\n        : 'Ничего не найдено'",
      to: ": 'Ничего не найдено'",
    },
    {
      name: '«Повторить» активна во время повтора',
      from: ' disabled={model.isValidating}',
      to: '',
    },
    {
      name: 'очистка не возвращает фокус в поле',
      from: '    inputRef.current?.focus();\n',
      to: '',
    },
    {
      name: 'запрос показа строки не прокручивает таблицу',
      from: "        row.scrollIntoView({ block: 'nearest' });\n",
      to: '',
    },
    {
      name: 'прокрутка по смене id, а не по запросу: повторный выбор того же узла не прокручивает',
      from: '  }, [revealRequest]);',
      to: '    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [revealRequest?.id]);',
    },
  ],
};

export const entitiesOrgTableRowSuite: Suite = {
  name: 'entities-org-table-row',
  file: 'packages/entities/org-tree/src/ui/OrgTableRow.tsx',
  tests: TABLE_TESTS,
  mutations: [
    {
      name: 'строка без React.memo (смена порядка перерисовывает все строки)',
      from: 'export const OrgTableRow = memo(function OrgTableRow({',
      to: 'export const OrgTableRow = (function OrgTableRow({',
    },
    {
      name: 'бюджет без форматирования',
      from: '{formatBudget(totalBudget)}',
      to: '{totalBudget}',
    },
    {
      name: 'эффективность без formatPerformance (дробь, null — пусто)',
      from: '{formatPerformance(totalPerformance)}',
      to: '{totalPerformance}',
    },
    {
      name: 'отступ не зависит от уровня',
      from: '<NameCell data-level={level}>',
      to: '<NameCell data-level={1}>',
    },
    {
      name: 'шаг отступа не растёт с уровнем',
      from: '--indent: ${index * INDENT_STEP_PX}px;',
      to: '--indent: ${INDENT_STEP_PX}px;',
    },
    {
      name: 'строка контекста не приглушена',
      from: "&[data-matches='false'] {\n    color: ${({ theme }) => theme.colors.textMuted};",
      to: "&[data-matches='false'] {\n    color: inherit;",
    },
    {
      name: 'выбор строки не отражён в aria-current',
      from: " aria-current={selected ? 'true' : undefined}",
      to: '',
    },
  ],
};
