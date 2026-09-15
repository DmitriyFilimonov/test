/** @vitest-environment node */
import type { OrgNode } from '../model/schema';
import type { VisibleOrgTreeNode } from '../model/selectors';
import { describe, expect, it } from 'vitest';
import { layoutForest, type OrgTreeLayout } from './useTreeLayout';

const SIZE = { width: 100, height: 40 };
const SPACING = { siblingGap: 10, subtreeGap: 30, levelGap: 20 };

let counter = 0;
function node(children: VisibleOrgTreeNode[] = []): VisibleOrgTreeNode {
  const id = `n${counter++}`;
  const data: OrgNode = {
    id,
    name: id,
    parentId: null,
    headcount: 1,
    budget: 1,
    performance: 50,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return {
    id,
    data: {
      node: data,
      childCount: children.length,
      subtree: { headcount: 1, budget: 1, performance: 50 },
    },
    children,
  };
}

function count(forest: VisibleOrgTreeNode[]): number {
  return forest.reduce((sum, root) => sum + 1 + count(root.children), 0);
}

function expectValidForest(layout: OrgTreeLayout, forest: VisibleOrgTreeNode[]) {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  expect(layout.nodes).toHaveLength(count(forest));
  expect(layout.nodes.every((n) => !n.id.includes('virtual-root'))).toBe(true);

  // Корни: все из входа, в том же порядке, parentId null, глубина 0, верхний уровень.
  const roots = layout.nodes.filter((n) => n.parentId === null);
  expect(roots.map((n) => n.id)).toEqual(forest.map((r) => r.id));
  expect(roots.every((n) => n.depth === 0 && n.y === 0)).toBe(true);
  roots.slice(1).forEach((root, i) => {
    expect(root.x - (roots[i].x + roots[i].width)).toBeGreaterThanOrEqual(
      SPACING.siblingGap - 1e-6,
    );
  });

  // Глубина и уровень у потомков, рёбра только между настоящими узлами.
  for (const n of layout.nodes) {
    if (n.parentId !== null) {
      expect(n.depth).toBe(byId.get(n.parentId)!.depth + 1);
    }
    expect(n.y).toBe(n.depth * (SIZE.height + SPACING.levelGap));
  }
  expect(layout.edges).toHaveLength(layout.nodes.length - roots.length);
  expect(
    layout.edges.every((e) => byId.has(e.parentId) && byId.get(e.childId)?.parentId === e.parentId),
  ).toBe(true);

  // Нормализация и плотные границы.
  expect(Math.min(...layout.nodes.map((n) => n.x))).toBeCloseTo(0);
  expect(Math.max(...layout.nodes.map((n) => n.x + n.width))).toBeCloseTo(layout.bounds.width);
  expect(Math.max(...layout.nodes.map((n) => n.y + n.height))).toBeCloseTo(layout.bounds.height);
}

describe('layoutForest: число корней не фиксировано', () => {
  it('ноль корней — пустая раскладка', () => {
    expect(layoutForest([], SIZE, SPACING)).toEqual({
      nodes: [],
      edges: [],
      bounds: { width: 0, height: 0 },
    });
  });

  it('один корень', () => {
    const forest = [node([node(), node()])];
    const layout = layoutForest(forest, SIZE, SPACING);
    expectValidForest(layout, forest);
    expect(layout.bounds).toEqual({ width: 2 * 100 + 10, height: 40 + 20 + 40 });
  });

  it('два корня — соседи через siblingGap', () => {
    const forest = [node(), node()];
    const layout = layoutForest(forest, SIZE, SPACING);
    expectValidForest(layout, forest);
    expect(layout.bounds).toEqual({ width: 210, height: 40 });
  });

  it.each([3, 5, 12, 40])('корней: %i, поддеревья разной глубины', (rootCount) => {
    const forest = Array.from({ length: rootCount }, (_, i) =>
      node(Array.from({ length: i % 4 }, () => node(i % 3 === 0 ? [node(), node()] : []))),
    );
    expectValidForest(layoutForest(forest, SIZE, SPACING), forest);
  });
});
