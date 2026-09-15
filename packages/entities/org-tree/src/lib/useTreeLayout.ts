import { useMemo } from 'react';
import { useTheme } from 'styled-components';
import type { OrgTreeItem, VisibleOrgTreeNode } from '../model/selectors';
import {
  layoutTree,
  type LayoutInput,
  type LayoutOptions,
  type LayoutResult,
  type Size,
} from '@shared/tidy-tree';

export type OrgTreeLayout = LayoutResult<OrgTreeItem>;
export type ForestSpacing = Pick<LayoutOptions, 'siblingGap' | 'subtreeGap' | 'levelGap'>;

const EMPTY_LAYOUT: OrgTreeLayout = { nodes: [], edges: [], bounds: { width: 0, height: 0 } };
/** Начинается с NUL: с id из данных (непустые строки из API) не пересечётся на практике. */
const VIRTUAL_ROOT_ID = `${String.fromCharCode(0)}virtual-root`;
const VIRTUAL_ROOT_SIZE: Size = { width: 0, height: 0 };

/**
 * Раскладка леса с любым числом корней (0, 1, …). layoutTree принимает одно дерево,
 * поэтому корни становятся детьми невидимого корня нулевого размера; после раскладки он,
 * его рёбра и его пустой уровень удаляются. Корни — соседи через siblingGap, у каждого
 * `parentId: null` и `depth: 0`.
 */
export function layoutForest(
  forest: readonly VisibleOrgTreeNode[],
  nodeSize: Size,
  { siblingGap, subtreeGap, levelGap }: ForestSpacing,
): OrgTreeLayout {
  if (forest.length === 0) {
    return EMPTY_LAYOUT;
  }
  const toInput = (node: VisibleOrgTreeNode): LayoutInput<OrgTreeItem | null> => ({
    id: node.id,
    size: nodeSize,
    data: node.data,
    children: node.children.map(toInput),
  });
  const result = layoutTree<OrgTreeItem | null>(
    { id: VIRTUAL_ROOT_ID, size: VIRTUAL_ROOT_SIZE, data: null, children: forest.map(toInput) },
    { orientation: 'vertical', siblingGap, subtreeGap, levelGap },
  );

  // Уровень виртуального корня занимает 0 (его высота) + levelGap.
  const offset = levelGap;
  return {
    nodes: result.nodes
      .filter((node) => node.id !== VIRTUAL_ROOT_ID)
      .map((node) => ({
        ...node,
        y: node.y - offset,
        depth: node.depth - 1,
        parentId: node.parentId === VIRTUAL_ROOT_ID ? null : node.parentId,
        data: node.data as OrgTreeItem,
      })),
    edges: result.edges.filter((edge) => edge.parentId !== VIRTUAL_ROOT_ID),
    bounds: { width: result.bounds.width, height: result.bounds.height - offset },
  };
}

/** Единственное место, где виджет знает про @shared/tidy-tree: мемоизированный layoutForest. */
export function useTreeLayout(
  visibleTree: readonly VisibleOrgTreeNode[],
  nodeSize: Size,
): OrgTreeLayout {
  const { tree } = useTheme();
  const { siblingGap, subtreeGap, levelGap } = tree;

  return useMemo(
    () => layoutForest(visibleTree, nodeSize, { siblingGap, subtreeGap, levelGap }),
    [visibleTree, nodeSize, siblingGap, subtreeGap, levelGap],
  );
}
