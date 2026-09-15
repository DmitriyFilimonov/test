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
    {
      name: 'ancestorIds возвращает только родителя',
      from: '    parentId = parentIndex.get(parentId) ?? null;',
      to: '    parentId = null;',
    },
    {
      name: 'expandIds без изменений создаёт новый набор',
      from: '  if (ids.every((id) => current.has(id))) {\n    return current;\n  }\n',
      to: '',
    },
    {
      name: 'toggleRecursive только раскрывает',
      from: "    type: current.has(id) ? 'collapse' : 'expand',",
      to: "    type: 'expand',",
    },
    {
      name: 'expand без изменений отменяет раскрытие по умолчанию',
      from: '      return next === action.current ? state : next;',
      to: '      return next;',
    },
  ],
};

const TREE_TESTS = 'packages/entities/org-tree/src/ui/OrgTreeView.dom.test.tsx';

export const entitiesUseExpansionSuite: Suite = {
  name: 'entities-use-expansion',
  file: 'packages/entities/org-tree/src/model/useExpansion.ts',
  tests: 'packages/entities/org-tree',
  mutations: [
    {
      name: 'состояние игнорируется: раскрытие всегда по умолчанию',
      from: '  const expandedIds = state ?? initialExpandedIds;',
      to: '  const expandedIds = initialExpandedIds;',
    },
    {
      name: 'expandAncestors считает от умолчаний, а не от раскрытия на экране',
      from: 'expansionActions.expandAncestors(expandedIds, structure, id)',
      to: 'expansionActions.expandAncestors(initialExpandedIds, structure, id)',
    },
  ],
};

export const entitiesTreeModelSuite: Suite = {
  name: 'entities-tree-model',
  file: 'packages/entities/org-tree/src/model/useTreeModel.ts',
  tests: TREE_TESTS,
  mutations: [
    {
      name: 'неуправляемый режим игнорирует defaultExpandedIds',
      from: '    initialExpandedIds: props.defaultExpandedIds ?? computedDefault,',
      to: '    initialExpandedIds: computedDefault,',
    },
    {
      name: 'управляемый режим игнорирует expandedIds из пропа',
      from: '  const controlled = props.expandedIds !== undefined ? props : null;',
      to: '  const controlled = null as typeof props | null;',
    },
    {
      name: 'Alt+клик — обычное переключение',
      from: '        if (event.altKey) {',
      to: '        if (false) {',
    },
    {
      name: 'клик по карточке не выбирает узел',
      from: '      onSelect?.(id);\n',
      to: '',
    },
    {
      name: 'клик по шеврону ещё и выбирает узел',
      from: '        }\n        return;\n      }\n      onSelect?.(id);',
      to: '        }\n      }\n      onSelect?.(id);',
    },
  ],
};

export const entitiesOrgTreeViewSuite: Suite = {
  name: 'entities-org-tree-view',
  file: 'packages/entities/org-tree/src/ui/OrgTreeView.tsx',
  tests: TREE_TESTS,
  mutations: [
    {
      name: 'приглушение без учёта dimUnmatched',
      from: 'dimmed={dimUnmatched && !node.data.matches}',
      to: 'dimmed={!node.data.matches}',
    },
    {
      name: 'выделение не доходит до карточки',
      from: 'selected={node.id === selectedId}',
      to: 'selected={false}',
    },
    {
      name: 'запрос показа узла не передаётся холсту',
      from: 'revealRequest={model.revealRequest}',
      to: 'revealRequest={null}',
    },
  ],
};

export const entitiesOrgNodeCardSuite: Suite = {
  name: 'entities-org-node-card',
  file: 'packages/entities/org-tree/src/ui/OrgNodeCard.tsx',
  tests: TREE_TESTS,
  mutations: [
    { name: 'правило приглушения не приглушает', from: 'opacity: 0.45;', to: 'opacity: 1;' },
    {
      name: 'выбор узла не отражён в aria-current',
      from: "aria-current={selected ? 'true' : undefined}",
      to: 'aria-current={undefined}',
    },
    {
      name: 'выбор узла не отражён в data-selected',
      from: 'data-selected={selected}',
      to: 'data-selected={false}',
    },
  ],
};

export const entitiesTreeCanvasRevealSuite: Suite = {
  name: 'entities-tree-canvas-reveal',
  file: 'packages/entities/org-tree/src/ui/TreeCanvas.tsx',
  tests: TREE_TESTS,
  mutations: [
    {
      name: 'запрос показа не двигает холст',
      from: '      commit(next);\n',
      to: '',
    },
    {
      name: 'выполняется только первый запрос показа (нет сравнения nonce)',
      from: 'revealRequest.nonce === revealedNonceRef.current',
      to: 'revealedNonceRef.current !== null',
    },
    {
      name: 'тот же nonce выполняется повторно',
      from: '    if (!revealRequest || revealRequest.nonce === revealedNonceRef.current || !size) {',
      to: '    if (!revealRequest || !size) {',
    },
  ],
};

export const entitiesRevealBoxSuite: Suite = {
  name: 'entities-reveal-box',
  file: 'packages/entities/org-tree/src/lib/revealBox.ts',
  tests: 'packages/entities/org-tree/src/lib/revealBox.test.ts',
  mutations: [
    {
      name: 'узел больше экрана выравнивается по концу',
      from: '  if (length > viewport - 2 * padding || start < padding) {',
      to: '  if (start < padding) {',
    },
    {
      name: 'видимый узел всё равно сдвигает вид (новый объект)',
      from: '  return dx === 0 && dy === 0 ? view : { ...view, x: view.x + dx, y: view.y + dy };',
      to: '  return { ...view, x: view.x + dx, y: view.y + dy };',
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
