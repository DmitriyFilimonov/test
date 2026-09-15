import type { LayoutEdge, LayoutInput, LayoutNode, LayoutOptions, LayoutResult } from './types';

/**
 * Дерево после разбора входа. Узлы пронумерованы в прямом обходе; дети узла `v` —
 * `childList[childStart[v] .. childStart[v] + childCount[v])`, слева направо.
 */
interface IndexedTree<T> {
  inputs: LayoutInput<T>[];
  parent: Int32Array;
  depth: Int32Array;
  childStart: Int32Array;
  childCount: Int32Array;
  childList: Int32Array;
  /** Размер вдоль оси соседей: ширина при vertical, высота при horizontal. */
  breadth: Float64Array;
  maxDepth: number;
}

function indexTree<T>(root: LayoutInput<T>, options: LayoutOptions): IndexedTree<T> {
  const inputs: LayoutInput<T>[] = [];
  const parents: number[] = [];
  const depths: number[] = [];
  const childStarts: number[] = [];
  const childCounts: number[] = [];
  const childSlots: number[] = [];
  const ids = new Set<string>();

  // Итеративный прямой обход: глубокие цепочки не упираются в стек вызовов.
  const stack: { input: LayoutInput<T>; parent: number; depth: number; slot: number }[] = [
    { input: root, parent: -1, depth: 0, slot: -1 },
  ];
  while (stack.length > 0) {
    const { input, parent, depth, slot } = stack.pop()!;
    if (ids.has(input.id)) {
      throw new Error(`layoutTree: duplicate node id "${input.id}"`);
    }
    ids.add(input.id);
    const { width, height } = input.size;
    if (!(width >= 0 && height >= 0 && Number.isFinite(width) && Number.isFinite(height))) {
      throw new Error(`layoutTree: invalid size of node "${input.id}"`);
    }

    const index = inputs.length;
    inputs.push(input);
    parents.push(parent);
    depths.push(depth);
    if (slot >= 0) {
      childSlots[slot] = index;
    }

    const start = childSlots.length;
    childStarts.push(start);
    childCounts.push(input.children.length);
    childSlots.length += input.children.length;
    for (let k = input.children.length - 1; k >= 0; k--) {
      stack.push({ input: input.children[k], parent: index, depth: depth + 1, slot: start + k });
    }
  }

  const n = inputs.length;
  const breadth = new Float64Array(n);
  let maxDepth = 0;
  for (let v = 0; v < n; v++) {
    const { width, height } = inputs[v].size;
    breadth[v] = options.orientation === 'vertical' ? width : height;
    maxDepth = Math.max(maxDepth, depths[v]);
  }

  return {
    inputs,
    parent: Int32Array.from(parents),
    depth: Int32Array.from(depths),
    childStart: Int32Array.from(childStarts),
    childCount: Int32Array.from(childCounts),
    childList: Int32Array.from(childSlots),
    breadth,
    maxDepth,
  };
}

/**
 * Координаты центров узлов вдоль оси соседей — Walker в линейной версии
 * Buchheim–Jünger–Leipert (2002): обход снизу вверх, контуры поддеревьев через нити
 * (thread), сдвиг поддерева с равномерным распределением между промежуточными
 * поддеревьями через shift/change, итоговые координаты — сверху вниз через mod.
 */
function placeCenters<T>(tree: IndexedTree<T>, options: LayoutOptions) {
  const { parent, childStart, childCount, childList, breadth } = tree;
  const n = tree.inputs.length;

  const prelim = new Float64Array(n);
  const mod = new Float64Array(n);
  const shift = new Float64Array(n);
  const change = new Float64Array(n);
  const thread = new Int32Array(n).fill(-1);
  const ancestor = new Int32Array(n);
  const defaultAncestor = new Int32Array(n).fill(-1);
  const siblingIndex = new Int32Array(n);

  const childAt = (v: number, k: number) => childList[childStart[v] + k];

  for (let v = 0; v < n; v++) {
    ancestor[v] = v;
    for (let k = 0; k < childCount[v]; k++) {
      siblingIndex[childAt(v, k)] = k;
    }
  }

  const nextLeft = (v: number) => (childCount[v] > 0 ? childAt(v, 0) : thread[v]);
  const nextRight = (v: number) => (childCount[v] > 0 ? childAt(v, childCount[v] - 1) : thread[v]);

  // Зазор считается от фактических размеров соседей, а не от одинаковой «ячейки».
  const separation = (left: number, right: number) =>
    (breadth[left] + breadth[right]) / 2 +
    (parent[left] === parent[right] ? options.siblingGap : options.subtreeGap);

  const moveSubtree = (wm: number, wp: number, amount: number) => {
    const perSubtree = amount / (siblingIndex[wp] - siblingIndex[wm]);
    change[wp] -= perSubtree;
    shift[wp] += amount;
    change[wm] += perSubtree;
    prelim[wp] += amount;
    mod[wp] += amount;
  };

  const executeShifts = (v: number) => {
    let accumulatedShift = 0;
    let accumulatedChange = 0;
    for (let k = childCount[v] - 1; k >= 0; k--) {
      const w = childAt(v, k);
      prelim[w] += accumulatedShift;
      mod[w] += accumulatedShift;
      accumulatedChange += change[w];
      accumulatedShift += shift[w] + accumulatedChange;
    }
  };

  const apportion = (v: number, leftSibling: number, currentAncestor: number) => {
    if (leftSibling < 0) {
      return currentAncestor;
    }
    let insideRight = v;
    let outsideRight = v;
    let insideLeft = leftSibling;
    let outsideLeft = childAt(parent[v], 0);
    let sumInsideRight = mod[insideRight];
    let sumOutsideRight = mod[outsideRight];
    let sumInsideLeft = mod[insideLeft];
    let sumOutsideLeft = mod[outsideLeft];

    for (;;) {
      insideLeft = nextRight(insideLeft);
      insideRight = nextLeft(insideRight);
      if (insideLeft < 0 || insideRight < 0) {
        break;
      }
      outsideLeft = nextLeft(outsideLeft);
      outsideRight = nextRight(outsideRight);
      ancestor[outsideRight] = v;

      const overlap =
        prelim[insideLeft] +
        sumInsideLeft -
        (prelim[insideRight] + sumInsideRight) +
        separation(insideLeft, insideRight);
      if (overlap > 0) {
        const candidate = ancestor[insideLeft];
        const conflicting = parent[candidate] === parent[v] ? candidate : currentAncestor;
        moveSubtree(conflicting, v, overlap);
        sumInsideRight += overlap;
        sumOutsideRight += overlap;
      }
      sumInsideLeft += mod[insideLeft];
      sumInsideRight += mod[insideRight];
      sumOutsideLeft += mod[outsideLeft];
      sumOutsideRight += mod[outsideRight];
    }

    if (insideLeft >= 0 && nextRight(outsideRight) < 0) {
      thread[outsideRight] = insideLeft;
      mod[outsideRight] += sumInsideLeft - sumOutsideRight;
    }
    if (insideRight >= 0 && nextLeft(outsideLeft) < 0) {
      thread[outsideLeft] = insideRight;
      mod[outsideLeft] += sumInsideRight - sumOutsideLeft;
      return v;
    }
    return currentAncestor;
  };

  // Обратный обход «справа налево в прямом порядке» — это обход снизу вверх слева направо.
  const preorderRightFirst: number[] = [];
  const stack = [0];
  while (stack.length > 0) {
    const v = stack.pop()!;
    preorderRightFirst.push(v);
    for (let k = 0; k < childCount[v]; k++) {
      stack.push(childAt(v, k));
    }
  }

  for (let i = preorderRightFirst.length - 1; i >= 0; i--) {
    const v = preorderRightFirst[i];
    const p = parent[v];
    const leftSibling = p >= 0 && siblingIndex[v] > 0 ? childAt(p, siblingIndex[v] - 1) : -1;

    if (childCount[v] > 0) {
      executeShifts(v);
      const midpoint = (prelim[childAt(v, 0)] + prelim[childAt(v, childCount[v] - 1)]) / 2;
      if (leftSibling >= 0) {
        prelim[v] = prelim[leftSibling] + separation(leftSibling, v);
        mod[v] = prelim[v] - midpoint;
      } else {
        prelim[v] = midpoint;
      }
    } else if (leftSibling >= 0) {
      prelim[v] = prelim[leftSibling] + separation(leftSibling, v);
    }

    if (p >= 0) {
      const current = defaultAncestor[p] >= 0 ? defaultAncestor[p] : childAt(p, 0);
      defaultAncestor[p] = apportion(v, leftSibling, current);
    }
  }

  // Сверху вниз: координата = prelim + сумма mod предков. Номера узлов — прямой обход,
  // поэтому родитель всегда обработан раньше ребёнка.
  const center = new Float64Array(n);
  const modSum = new Float64Array(n);
  for (let v = 0; v < n; v++) {
    const inherited = parent[v] >= 0 ? modSum[parent[v]] : 0;
    center[v] = prelim[v] + inherited;
    modSum[v] = mod[v] + inherited;
  }
  return center;
}

/**
 * Раскладка tidy tree (Reingold–Tilford с улучшениями Walker), O(n).
 * Координаты — левый верхний угол узла; результат нормализован к (0, 0).
 */
export function layoutTree<T>(root: LayoutInput<T>, options: LayoutOptions): LayoutResult<T> {
  for (const key of ['siblingGap', 'subtreeGap', 'levelGap'] as const) {
    if (!(options[key] >= 0 && Number.isFinite(options[key]))) {
      throw new Error(`layoutTree: ${key} must be a non-negative number`);
    }
  }

  const tree = indexTree(root, options);
  const n = tree.inputs.length;
  const center = placeCenters(tree, options);

  let minEdge = Infinity;
  let maxEdge = -Infinity;
  for (let v = 0; v < n; v++) {
    minEdge = Math.min(minEdge, center[v] - tree.breadth[v] / 2);
    maxEdge = Math.max(maxEdge, center[v] + tree.breadth[v] / 2);
  }

  const vertical = options.orientation === 'vertical';
  const levelExtent = new Float64Array(tree.maxDepth + 1);
  for (let v = 0; v < n; v++) {
    const { width, height } = tree.inputs[v].size;
    const extent = vertical ? height : width;
    levelExtent[tree.depth[v]] = Math.max(levelExtent[tree.depth[v]], extent);
  }
  const levelStart = new Float64Array(tree.maxDepth + 1);
  for (let d = 1; d <= tree.maxDepth; d++) {
    levelStart[d] = levelStart[d - 1] + levelExtent[d - 1] + options.levelGap;
  }

  const nodes: LayoutNode<T>[] = new Array(n);
  const edges: LayoutEdge[] = [];
  for (let v = 0; v < n; v++) {
    const input = tree.inputs[v];
    const along = center[v] - tree.breadth[v] / 2 - minEdge;
    const across = levelStart[tree.depth[v]];
    const parentId = tree.parent[v] >= 0 ? tree.inputs[tree.parent[v]].id : null;
    nodes[v] = {
      id: input.id,
      x: vertical ? along : across,
      y: vertical ? across : along,
      width: input.size.width,
      height: input.size.height,
      depth: tree.depth[v],
      parentId,
      data: input.data,
    };
    if (parentId !== null) {
      edges.push({ id: `${parentId}->${input.id}`, parentId, childId: input.id });
    }
  }

  const breadthTotal = maxEdge - minEdge;
  const depthTotal = levelStart[tree.maxDepth] + levelExtent[tree.maxDepth];
  return {
    nodes,
    edges,
    bounds: vertical
      ? { width: breadthTotal, height: depthTotal }
      : { width: depthTotal, height: breadthTotal },
  };
}
