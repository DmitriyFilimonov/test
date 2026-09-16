import type { Suite } from '../types.ts';

const TABLE_TESTS = 'packages/entities/org-tree/src/ui/OrgTable.dom.test.tsx';
const TREE_TESTS = 'packages/entities/org-tree/src/ui/OrgTreeView.dom.test.tsx';

export const entitiesTableKeyboardSuite: Suite = {
  name: 'entities-table-keyboard',
  file: 'packages/entities/org-tree/src/model/useTableKeyboard.ts',
  tests: TABLE_TESTS,
  mutations: [
    {
      name: 'стрелки не двигают фокус (строка в порядке Tab меняется, фокус остаётся)',
      from: 'row.focus({ preventScroll: true });',
      to: '',
    },
    {
      name: 'стрелка вниз не двигает строку',
      from: 'return Math.min(index + 1, count - 1);',
      to: 'return index;',
    },
    {
      name: 'Home идёт на строку выше, а не к первой',
      from: 'return 0;',
      to: 'return Math.max(index - 1, 0);',
    },
    {
      name: 'End идёт на строку ниже, а не к последней',
      from: 'return count - 1;',
      to: 'return Math.min(index + 1, count - 1);',
    },
    {
      name: 'фокус привязан к позиции, а не к узлу',
      from: 'if (id !== null && remaining.has(id)) {',
      to: 'if (id !== null && remaining.has(id)) {\n    return ids[previousIds.indexOf(id)] ?? id;',
    },
    {
      name: 'отфильтрованный узел: фокус на первую строку, а не на ближайшую',
      from: 'const nearest = id === null ? null : nearestRemaining(previousIds, remaining, id);',
      to: 'const nearest = null;',
    },
    {
      name: 'Enter не выбирает строку',
      from: 'onSelect(ids[index]!);',
      to: '',
    },
    {
      name: 'строки, появившиеся после пустой таблицы, забирают фокус',
      from: 'hasFocus: state.hasFocus && ids.length > 0,',
      to: 'hasFocus: state.hasFocus,',
    },
    {
      name: 'PageDown и PageUp — на одну строку, а не на экран',
      from: 'Math.floor(entry.contentRect.height / rowHeight) - 1',
      to: '0',
    },
  ],
};

export const entitiesTableRowFocusSuite: Suite = {
  name: 'entities-table-row-focus',
  file: 'packages/entities/org-tree/src/ui/OrgTableRow.tsx',
  tests: TABLE_TESTS,
  mutations: [
    {
      name: 'все строки в порядке Tab (roving tabindex сломан)',
      from: 'tabIndex={focusable ? 0 : -1}',
      to: 'tabIndex={0}',
    },
    {
      name: 'кнопка названия в порядке Tab',
      from: 'tabIndex={-1} ',
      to: '',
    },
  ],
};

export const entitiesLayoutTransitionSuite: Suite = {
  name: 'entities-layout-transition',
  file: 'packages/entities/org-tree/src/model/useLayoutTransition.ts',
  tests: TREE_TESTS,
  mutations: [
    {
      name: 'узел не удаляется после анимации исчезновения',
      from: 'setTransition((state) => completeExit(state, id));',
      to: '',
    },
    {
      name: 'узел удаляется по концу любой анимации внутри него',
      from: "if (!(target instanceof SVGElement) || target.dataset.motion !== 'exit') {",
      to: 'if (!(target instanceof Element)) {',
    },
    {
      name: 'пропавший узел удаляется сразу, без исчезновения',
      from: 'if (after.has(was.node.id)) {',
      to: 'if (true) {',
    },
    {
      name: 'новый узел появляется без анимации',
      from: "motion: staying ? was.motion : 'enter',",
      to: 'motion: staying ? was.motion : null,',
    },
    {
      name: 'узел появляется на своём месте, а не из родителя',
      from: 'originX: anchor?.x ?? node.x,',
      to: 'originX: node.x,',
    },
    {
      name: 'вернувшийся до конца исчезновения узел остаётся исчезающим',
      from: "const staying = was !== undefined && was.motion !== 'exit';",
      to: 'const staying = was !== undefined;',
    },
    {
      name: 'первые данные появляются с анимацией',
      from: 'motion: null,',
      to: "motion: 'enter' as const,",
    },
  ],
};

export const entitiesTreeMotionSuite: Suite = {
  name: 'entities-tree-motion',
  file: 'packages/entities/org-tree/src/ui/TreeCanvas.tsx',
  tests: TREE_TESTS,
  mutations: [
    {
      name: 'reduced-motion игнорируется',
      from: '@media (prefers-reduced-motion: reduce) {',
      to: '@media (max-width: 0px) {',
    },
    {
      name: 'при reduced-motion длительность не обнуляется',
      from: 'animation-duration: 0s;',
      to: 'animation-duration: inherit;',
    },
    {
      name: 'конец анимации не слушается: исчезнувший узел остаётся в DOM',
      from: "group.addEventListener('animationend', handleAnimationEnd);",
      to: '',
    },
    {
      name: 'исчезающий узел считается узлом раскладки',
      from: 'data-node-id={exiting ? undefined : node.id}',
      to: 'data-node-id={node.id}',
    },
    {
      name: 'исчезающий узел доступен скринридеру',
      from: 'aria-hidden={exiting ? true : undefined}',
      to: 'aria-hidden={undefined}',
    },
  ],
};

export const entitiesTreeEdgeMotionSuite: Suite = {
  name: 'entities-tree-edge-motion',
  file: 'packages/entities/org-tree/src/ui/TreeEdge.tsx',
  tests: TREE_TESTS,
  mutations: [
    {
      name: 'рёбра появляются и исчезают без анимации',
      from: ' data-motion={motion ?? undefined}',
      to: '',
    },
  ],
};
