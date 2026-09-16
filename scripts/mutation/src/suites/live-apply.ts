import type { Suite } from '../types.ts';

const ORG_TREE_TESTS = 'packages/entities/org-tree';

export const sharedQueryPatchSuite: Suite = {
  name: 'shared-query-patch',
  file: 'packages/shared/query/src/createQuery.ts',
  tests: 'packages/shared/query/src/createQuery.test.ts',
  mutations: [
    {
      name: 'патч применяется ко всем ключам',
      from: 'return setEntry(state, key, { ...entry, data: updater(entry.data), fetchedAt });',
      to: [
        'const entries = Object.fromEntries(',
        '        Object.entries(state.entries).map(([other, value]) => [',
        '          other,',
        '          value.data === undefined ? value : { ...value, data: updater(value.data), fetchedAt },',
        '        ]),',
        '      );',
        '      return { ...state, entries };',
      ].join('\n'),
    },
    {
      name: 'патч не продлевает свежесть данных',
      from: '{ ...entry, data: updater(entry.data), fetchedAt }',
      to: '{ ...entry, data: updater(entry.data) }',
    },
    {
      name: 'invalidated удаляет данные',
      from: 'entries[key] = { ...entry, fetchedAt: undefined };',
      to: 'entries[key] = { ...entry, data: undefined, fetchedAt: undefined };',
    },
    {
      name: 'invalidated игнорирует predicate',
      from: 'if (entry.fetchedAt !== undefined && predicate(key)) {',
      to: 'if (entry.fetchedAt !== undefined) {',
    },
  ],
};

export const entitiesLiveSagaSuite: Suite = {
  name: 'entities-live-saga',
  file: 'packages/entities/org-tree/src/model/liveSaga.ts',
  tests: ORG_TREE_TESTS,
  mutations: [
    {
      name: 'патч вызывает полный рефетч',
      from: 'put(patched(params, () => result.nodes));',
      to: 'put(patched(params, () => result.nodes));\n    yield* put(requested(params, { force: true }));',
    },
    {
      name: 'пропуск seq игнорируется',
      from: 'if (previous !== null && event.seq > previous + 1) {',
      to: 'if (previous !== null && event.seq < 0) {',
    },
    {
      name: 'другие ключи не помечаются протухшими',
      from: 'yield* put(invalidated((other) => other !== key));',
      to: 'void key;',
    },
    {
      name: 'текущий ключ помечается протухшим вместе с другими',
      from: 'invalidated((other) => other !== key)',
      to: 'invalidated(() => true)',
    },
    {
      name: 'hello после переподключения не сверяет seq',
      from: 'if (params && previous !== null && event.seq !== previous) {',
      to: 'if (params && previous === null && event.seq !== previous) {',
    },
    {
      name: 'повтор уже учтённого seq применяется заново',
      from: 'event.seq <= previous',
      to: 'event.seq < 0',
    },
    {
      name: 'индекс агрегатов не кладётся заранее: полный расчёт на каждый патч',
      from: 'setAggregateIndex(result.nodes, result.index);',
      to: '',
    },
    {
      name: 'номера обновлений не записываются',
      from: 'orgTreeUpdatesRecorded({ updates: result.updates, removed: result.removed })',
      to: "{ type: 'noop' }",
    },
  ],
};

export const entitiesLivePatchSuite: Suite = {
  name: 'entities-live-patch',
  file: 'packages/entities/org-tree/src/model/livePatch.ts',
  tests: ORG_TREE_TESTS,
  mutations: [
    {
      name: 'патч меняет order (пересортировка по новому значению)',
      from: 'next.push(...added);',
      to: [
        'next.push(...added);',
        '  next.sort((a, b) => b.headcount - a.headcount);',
        '  next.forEach((node, position) => {',
        '    next[position] = { ...node, order: position };',
        '  });',
      ].join('\n'),
    },
    {
      name: 'удаление не сдвигает order следующих узлов',
      from: 'removedOrders.filter((removedOrder) => removedOrder < node.order).length',
      to: '0',
    },
    {
      name: 'нетронутые узлы копируются',
      from: 'next.push(order === node.order ? node : { ...node, order });',
      to: 'next.push({ ...node, order });',
    },
    {
      name: 'номера обновлений без предков',
      from: 'id = after.parentId;',
      to: 'id = null;',
    },
    {
      name: 'номер обновления у каждого пересчитанного значения, а не у изменившегося',
      from: 'if (was[metric] !== now[metric]) {',
      to: 'if (was[metric] !== undefined) {',
    },
    {
      name: 'эффективность сравнивается без округления',
      from: 'totalPerformance: metrics.totalPerformance',
      to: 'totalPerformance: subtree.performance',
    },
    {
      name: 'повторное добавление существующего узла дублирует его',
      from: 'if (!byId.has(node.id)) {',
      to: "if (node.id !== '') {",
    },
    {
      name: 'добавление и удаление не обновляют итоги предков',
      from: 'const starts = [',
      to: 'const starts = [...updated];\n  void [',
    },
  ],
};

export const entitiesSelectorsStructureSuite: Suite = {
  name: 'entities-selectors-structure',
  file: 'packages/entities/org-tree/src/model/selectors.ts',
  tests: ORG_TREE_TESTS,
  mutations: [
    {
      name: 'патч метрик пересобирает индексы структуры',
      from: 'resultEqualityCheck: isSameStructure',
      to: 'resultEqualityCheck: () => false',
    },
    {
      name: 'дерево берёт узел из индекса структуры (значения прежних данных)',
      from: 'const node = nodeById.get(id)!;',
      to: 'const node = [...index.values()].flat().find((candidate) => candidate.id === id)!;',
    },
    {
      name: 'структура сравнивается без parentId',
      from: 'a[i].parentId !== b[i].parentId || ',
      to: '',
    },
  ],
};

export const entitiesUpdateHighlightSuite: Suite = {
  name: 'entities-update-highlight',
  file: 'packages/entities/org-tree/src/ui/updateHighlight.ts',
  tests: ORG_TREE_TESTS,
  mutations: [
    {
      name: 'reduced-motion игнорируется',
      from: '@media (prefers-reduced-motion: reduce) {',
      to: '@media (max-width: 0px) {',
    },
    {
      name: 'при reduced-motion подсветка пропадает совсем',
      from: 'animation-timing-function: step-end;',
      to: 'animation: none;',
    },
    {
      name: 'подсветка не гаснет',
      from: 'theme.motion.updateHighlight} ease-out;',
      to: 'theme.motion.updateHighlight} ease-out infinite;',
    },
  ],
};

export const entitiesRowHighlightSuite: Suite = {
  name: 'entities-row-highlight',
  file: 'packages/entities/org-tree/src/ui/OrgTableRow.tsx',
  tests: ORG_TREE_TESTS,
  mutations: [
    {
      name: 'подсветка ячейки не перезапускается',
      from: 'key={`headcount-${fresh.headcount}`} ',
      to: '',
    },
  ],
};

export const entitiesCardHighlightSuite: Suite = {
  name: 'entities-card-highlight',
  file: 'packages/entities/org-tree/src/ui/OrgNodeCard.tsx',
  tests: ORG_TREE_TESTS,
  mutations: [
    {
      name: 'подсветка поля карточки не перезапускается',
      from: 'key={update} ',
      to: '',
    },
    {
      name: 'поле листа подсвечивается по чужой метрике',
      from: "headcount: 'ownHeadcount',",
      to: "headcount: 'totalPerformance',",
    },
  ],
};

export const entitiesFreshUpdatesSuite: Suite = {
  name: 'entities-fresh-updates',
  file: 'packages/entities/org-tree/src/model/useFreshUpdates.ts',
  tests: ORG_TREE_TESTS,
  mutations: [
    {
      name: 'обновление до монтирования подсвечивается при появлении',
      from: 'seqs[key] !== mounted[key]',
      to: 'seqs[key] !== undefined',
    },
  ],
};
