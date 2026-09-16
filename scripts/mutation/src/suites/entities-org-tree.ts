import type { Suite } from '../types.ts';

const TESTS = 'packages/entities/org-tree';

export const entitiesIsEqualSuite: Suite = {
  name: 'entities-is-equal',
  file: 'packages/entities/org-tree/src/model/isEqual.ts',
  tests: TESTS,
  mutations: [
    {
      name: 'длина не сравнивается (удаление узла не замечено)',
      from: '  if (current.length !== next.length) {\n    return false;\n  }\n',
      to: '',
    },
    {
      name: 'updatedAt узлов не сравнивается',
      from: 'return next.every((node) => updatedAtById.get(node.id) === node.updatedAt);',
      to: 'return true;',
    },
    {
      name: 'matches и order участвуют в сравнении',
      from: '    updatedAtById.set(node.id, node.updatedAt);\n  }\n  return next.every((node) => updatedAtById.get(node.id) === node.updatedAt);',
      to: '    updatedAtById.set(node.id, `${node.updatedAt}|${node.matches}|${node.order}`);\n  }\n  return next.every(\n    (node) => updatedAtById.get(node.id) === `${node.updatedAt}|${node.matches}|${node.order}`,\n  );',
    },
  ],
};

export const entitiesSchemaSuite: Suite = {
  name: 'entities-schema',
  file: 'packages/entities/org-tree/src/model/schema.ts',
  tests: TESTS,
  mutations: [
    { name: 'лишние поля пропускаются', from: 'z.strictObject({', to: 'z.object({' },
    {
      name: 'performance не обязан быть целым',
      from: 'performance: z.number().int().min(0).max(100),',
      to: 'performance: z.number().min(0).max(100),',
    },
    {
      name: 'нет проверки существования parentId',
      from: 'if (node.parentId !== null && !indexById.has(node.parentId)) {',
      to: 'if (false) {',
    },
    {
      name: 'нет проверки циклов',
      from: 'if (current !== undefined && state[current] === 1) {',
      to: 'if (false) {',
    },
    {
      name: 'matches не обязателен',
      from: 'matches: z.boolean(),',
      to: 'matches: z.boolean().optional(),',
    },
    {
      name: 'order с дырами пропускается (нет проверки диапазона)',
      from: 'if (node.order >= nodes.length) {',
      to: 'if (false) {',
    },
    {
      name: 'повторяющийся order пропускается',
      from: '} else if (orderSeen[node.order] === 1) {',
      to: '} else if (false) {',
    },
  ],
};

export const entitiesAggregateSuite: Suite = {
  name: 'entities-aggregate',
  file: 'packages/entities/org-tree/src/model/aggregate.ts',
  tests: TESTS,
  mutations: [
    {
      name: 'среднее не взвешено по headcount',
      from: 'let weighted = node.performance * node.headcount;',
      to: 'let weighted = node.performance;',
    },
    {
      name: 'нулевой headcount даёт деление на ноль вместо null',
      from: 'entry.performance = entry.headcount > 0 ? weighted / entry.headcount : null;',
      to: 'entry.performance = weighted / entry.headcount;',
    },
  ],
};

export const entitiesSelectorsSuite: Suite = {
  name: 'entities-selectors',
  file: 'packages/entities/org-tree/src/model/selectors.ts',
  tests: TESTS,
  mutations: [
    {
      name: 'дети видимы независимо от раскрытия',
      from: 'children: expandedIds.has(node.id) ? children.map(build) : [],',
      to: 'children: children.map(build),',
    },
    {
      name: 'в видимом дереве собственные значения вместо итогов подразделения',
      from: 'subtree: toSubtreeAggregate(aggregates.get(node.id)!)',
      to: 'subtree: { headcount: node.headcount, budget: node.budget, performance: node.performance }',
    },
    {
      name: 'селектор игнорирует params (всегда запись умолчаний)',
      from: 'selectData(state, params) ?? EMPTY_NODES',
      to: "selectData(state, { q: '', sort: 'name', dir: 'asc' }) ?? EMPTY_NODES",
    },
    {
      name: 'агрегация зависит от expandedIds (итоги считаются в selectVisibleTree на каждое раскрытие)',
      from: 'subtree: toSubtreeAggregate(aggregates.get(node.id)!),',
      // Копия массива — промах кеша индексов: полный расчёт внутри построения дерева.
      to: 'subtree: toSubtreeAggregate(getAggregateIndex([...nodeById.values()]).get(node.id)!),',
    },
    {
      name: 'флаг matches в дереве всегда true',
      from: 'matches: node.matches,',
      to: 'matches: true,',
    },
    {
      name: 'level не растёт с глубиной',
      from: 'stack.push({ node: child, level: level + 1 });',
      to: 'stack.push({ node: child, level });',
    },
    {
      name: 'level 0-based (корни — 0)',
      from: '.map((node) => ({ node, level: 1 }));',
      to: '.map((node) => ({ node, level: 0 }));',
    },
    {
      name: 'дети не сортируются',
      from: 'a.name !== b.name ? (a.name < b.name ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,',
      to: '0,',
    },
  ],
};

export const entitiesFetchSuite: Suite = {
  name: 'entities-fetch',
  file: 'packages/entities/org-tree/src/api/fetchOrgTree.ts',
  tests: TESTS,
  mutations: [
    {
      name: 'параметры не передаются в запрос',
      from: 'fetch(`/api/org-tree?${search.toString()}`, { signal })',
      to: "fetch('/api/org-tree', { signal })",
    },
  ],
};

export const entitiesTableSuite: Suite = {
  name: 'entities-table',
  file: 'packages/entities/org-tree/src/model/table.ts',
  tests: TESTS,
  mutations: [
    {
      name: 'свой обход поддерева вместо aggregate.ts',
      from: '  [selectOrgNodes, selectSubtreeAggregates, selectNodeLevels],\n  (nodes, aggregates, levels): TableRow[] => {\n',
      to: [
        '  [selectOrgNodes, selectNodeLevels],',
        '  (nodes, levels): TableRow[] => {',
        '    const sum = (id: string): { headcount: number; budget: number; weighted: number } => {',
        '      const node = nodes.find((candidate) => candidate.id === id)!;',
        '      const total = { headcount: node.headcount, budget: node.budget, weighted: node.performance * node.headcount };',
        '      for (const child of nodes.filter((candidate) => candidate.parentId === id)) {',
        '        const childTotal = sum(child.id);',
        '        total.headcount += childTotal.headcount;',
        '        total.budget += childTotal.budget;',
        '        total.weighted += childTotal.weighted;',
        '      }',
        '      return total;',
        '    };',
        '    const aggregates = new Map(',
        '      nodes.map((node) => {',
        '        const total = sum(node.id);',
        '        const performance = total.headcount > 0 ? total.weighted / total.headcount : null;',
        '        return [node.id, { headcount: total.headcount, budget: total.budget, performance }];',
        '      }),',
        '    );',
        '',
      ].join('\n'),
    },
    {
      name: 'в таблицу попадают узлы без совпадений в поддереве',
      from: 'if (shown.has(children[i].id)) {',
      to: 'if (true) {',
    },
    {
      name: 'предки совпавших не показываются (нет строк контекста)',
      from: 'current = current.parentId === null ? undefined : nodeById.get(current.parentId);',
      to: 'current = undefined;',
    },
    {
      name: 'строка контекста помечена как совпавшая',
      from: 'matches: node.matches,',
      to: 'matches: true,',
    },
    {
      name: 'порядок соседей берётся из массива, а не из order',
      from: '    const byOrder = new Array<OrgNode>(nodes.length);\n    for (const node of nodes) {\n      byOrder[node.order] = node;\n    }\n',
      to: '    const byOrder = nodes;\n',
    },
    {
      name: 'соседи в обратном порядке',
      from: 'for (let i = children.length - 1; i >= 0; i--) {',
      to: 'for (let i = 0; i < children.length; i++) {',
    },
    {
      name: 'обход в ширину: потомки не сразу под родителем',
      from: 'const node = stack.pop()!;',
      to: 'const node = stack.shift()!;',
    },
    {
      name: 'итоги считаются только по совпавшим потомкам',
      from: '[selectOrgNodes, selectSubtreeAggregates, selectNodeLevels],',
      to: '[\n    selectOrgNodes,\n    (state, params) =>\n      selectSubtreeAggregates.resultFunc(selectOrgNodes(state, params).filter((node) => node.matches)),\n    selectNodeLevels,\n  ],',
    },
  ],
};

export const entitiesFormatSuite: Suite = {
  name: 'entities-format',
  file: 'packages/entities/org-tree/src/model/format.ts',
  tests: TESTS,
  mutations: [
    {
      name: 'форматтер создаётся на каждый вызов',
      from: 'for (const part of budgetFormatter.formatToParts(value)) {',
      to: "for (const part of new Intl.NumberFormat('ru', { maximumFractionDigits: 0 }).formatToParts(value)) {",
    },
    {
      name: 'разделитель групп берётся из Intl как есть',
      from: "result += part.type === 'group' ? BUDGET_GROUP_SEPARATOR : part.value;",
      to: 'result += part.value;',
    },
    {
      name: "валюта через style: 'currency' (₽)",
      from: '{ maximumFractionDigits: 0 }',
      to: "{ style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }",
    },
    {
      name: 'дробные рубли не округляются',
      from: '{ maximumFractionDigits: 0 }',
      to: '{}',
    },
    {
      name: 'null-эффективность форматируется как 0',
      from: 'return value === null ? EMPTY_VALUE : String(Math.round(value));',
      to: 'return String(Math.round(value ?? 0));',
    },
    {
      name: 'эффективность не округляется',
      from: 'String(Math.round(value))',
      to: 'String(value)',
    },
  ],
};
