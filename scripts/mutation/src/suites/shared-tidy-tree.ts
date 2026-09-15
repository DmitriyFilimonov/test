import type { Suite } from '../types.ts';

export const sharedTidyTreeSuite: Suite = {
  name: 'shared-tidy-tree',
  file: 'packages/shared/tidy-tree/src/layoutTree.ts',
  tests: 'packages/shared/tidy-tree',
  mutations: [
    {
      name: 'сдвиг не распределяется между промежуточными поддеревьями',
      from: 'const perSubtree = amount / (siblingIndex[wp] - siblingIndex[wm]);',
      to: 'const perSubtree = 0;',
    },
    {
      name: 'нет контурных нитей (thread)',
      from: 'thread[outsideRight] = insideLeft;',
      to: '',
    },
    {
      name: 'siblingGap вместо subtreeGap между разными родителями',
      from: '(parent[left] === parent[right] ? options.siblingGap : options.subtreeGap);',
      to: 'options.siblingGap;',
    },
    {
      name: 'ширина узлов не учитывается в зазоре',
      from: '(breadth[left] + breadth[right]) / 2 +',
      to: '0 +',
    },
    {
      name: 'родитель над первым ребёнком, а не по центру',
      from: 'const midpoint = (prelim[childAt(v, 0)] + prelim[childAt(v, childCount[v] - 1)]) / 2;',
      to: 'const midpoint = prelim[childAt(v, 0)];',
    },
    {
      name: 'нет нормализации по x',
      from: 'const along = center[v] - tree.breadth[v] / 2 - minEdge;',
      to: 'const along = center[v] - tree.breadth[v] / 2;',
    },
    {
      name: 'levelGap не учитывается',
      from: 'levelStart[d] = levelStart[d - 1] + levelExtent[d - 1] + options.levelGap;',
      to: 'levelStart[d] = levelStart[d - 1] + levelExtent[d - 1];',
    },
  ],
};
