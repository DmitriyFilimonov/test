import type { Suite } from '../types.ts';

const TESTS = 'packages/entities/org-tree';

export const entitiesAggregatePatchSuite: Suite = {
  name: 'entities-aggregate-patch',
  file: 'packages/entities/org-tree/src/model/aggregate.ts',
  tests: TESTS,
  mutations: [
    {
      name: 'пересчитывается всё дерево (локальность нарушена)',
      from: 'const result = new Map<string, AggregateEntryInternal>(index);\n  for (const [id, entry] of patched) {\n    result.set(id, entry);\n  }\n  return result;',
      to: 'return aggregateSubtrees(currentNodes);',
    },
    {
      name: 'цепочка предков обрывается на первом уровне',
      from: 'current = parentById.get(current) ?? null;',
      to: 'current = null;',
    },
    {
      name: 'разностный пересчёт не обновляет накопленные суммы',
      from: 'const newWeighted = getWeighted(base) + wDiff;',
      to: 'const newWeighted = getWeighted(base);',
    },
    {
      name: 'удаление не вычитает поддерево',
      from: 'if (changes.added.length > 0 || changes.removed.length > 0) {\n    return aggregateSubtrees(currentNodes);\n  }',
      to: 'if (changes.added.length > 0) {\n    return aggregateSubtrees(currentNodes);\n  }',
    },
    {
      name: 'взвешенная эффективность накапливается дробями',
      from: 'const wDiff = curr.performance * curr.headcount - prev.performance * prev.headcount;',
      to: 'const wDiff = (curr.performance / curr.headcount) - (prev.performance / prev.headcount);',
    },
    {
      name: 'патч без изменений (diff === 0) не возвращается',
      from: 'if (hcDiff === 0 && bDiff === 0 && wDiff === 0) continue;',
      to: '',
    },
  ],
};
