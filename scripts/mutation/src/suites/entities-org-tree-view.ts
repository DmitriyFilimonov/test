import type { Suite } from '../types.ts';

export const entitiesExpansionSuite: Suite = {
  name: 'entities-expansion',
  file: 'packages/entities/org-tree/src/model/expansion.ts',
  tests: 'packages/entities/org-tree',
  mutations: [
    {
      name: 'toggle сбрасывает раскрытия потомков',
      from: 'при повторном раскрытии.\n      const next = new Set(action.current);',
      to: 'при повторном раскрытии.\n      const next = new Set<string>();',
    },
  ],
};

export const entitiesLayoutForestSuite: Suite = {
  name: 'entities-layout-forest',
  file: 'packages/entities/org-tree/src/lib/useTreeLayout.ts',
  tests: 'packages/entities/org-tree',
  mutations: [
    {
      name: 'виртуальный корень остаётся в узлах',
      from: '.filter((node) => node.id !== VIRTUAL_ROOT_ID)',
      to: '',
    },
    {
      name: 'рёбра от виртуального корня остаются',
      from: 'edges: result.edges.filter((edge) => edge.parentId !== VIRTUAL_ROOT_ID),',
      to: 'edges: result.edges,',
    },
    {
      name: 'у корней parentId виртуального корня, а не null',
      from: 'parentId: node.parentId === VIRTUAL_ROOT_ID ? null : node.parentId,',
      to: 'parentId: node.parentId,',
    },
    { name: 'пустой уровень не вычитается из y', from: 'y: node.y - offset,', to: 'y: node.y,' },
    { name: 'глубина не уменьшается', from: 'depth: node.depth - 1,', to: 'depth: node.depth,' },
    {
      name: 'bounds включает пустой уровень',
      from: 'height: result.bounds.height - offset',
      to: 'height: result.bounds.height',
    },
  ],
};

export const entitiesNodeMetricsSuite: Suite = {
  name: 'entities-node-metrics',
  file: 'packages/entities/org-tree/src/lib/nodeMetrics.ts',
  tests: 'packages/entities/org-tree',
  mutations: [
    {
      name: 'общая численность = собственной',
      from: 'totalHeadcount: subtree.headcount,',
      to: 'totalHeadcount: node.headcount,',
    },
    {
      name: 'общая эффективность = собственной',
      from: 'const totalPerformance = subtree.performance === null ? null : Math.round(subtree.performance);',
      to: 'const totalPerformance: number | null = node.performance;',
    },
    {
      name: 'собственная эффективность при 0 сотрудников не «—»',
      from: 'const ownPerformance = node.headcount > 0 ? node.performance : null;',
      to: 'const ownPerformance = node.performance;',
    },
    {
      name: 'цвет общей эффективности по неокруглённому значению',
      from: 'totalPerformanceLevel: levelOf(totalPerformance),',
      to: 'totalPerformanceLevel: levelOf(subtree.performance),',
    },
    {
      name: 'лист показывает все четыре строки',
      from: 'if (isLeaf) {',
      to: 'if (false) {',
    },
    {
      name: 'нет данных не выделяется',
      from: "value === null ? 'none' : getPerformanceLevel(value);",
      to: 'getPerformanceLevel(value ?? 0);',
    },
  ],
};
