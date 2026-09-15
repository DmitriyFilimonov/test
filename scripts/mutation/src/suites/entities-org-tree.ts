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
  ],
};

export const entitiesAggregateSuite: Suite = {
  name: 'entities-aggregate',
  file: 'packages/entities/org-tree/src/model/aggregate.ts',
  tests: TESTS,
  mutations: [
    {
      name: 'среднее не взвешено по headcount',
      from: 'weighted: node.performance * node.headcount,',
      to: 'weighted: node.performance,',
    },
    {
      name: 'нулевой headcount даёт деление на ноль вместо null',
      from: 'performance: total.headcount > 0 ? total.weighted / total.headcount : null,',
      to: 'performance: total.weighted / total.headcount,',
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
      from: 'subtree: aggregates.get(node.id)!',
      to: 'subtree: { headcount: node.headcount, budget: node.budget, performance: node.performance }',
    },
    {
      name: 'дети не сортируются',
      from: 'a.name !== b.name ? (a.name < b.name ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,',
      to: '0,',
    },
  ],
};
